import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Certification, CertEnrollment, CertEnrollmentStatus } from './entities/academy.entity';
import { AutomationService } from '../../automation/automation.service';

function addMonths(date: Date, months: number): string {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class AcademyService {
  constructor(
    @InjectRepository(Certification) private readonly certRepo: Repository<Certification>,
    @InjectRepository(CertEnrollment) private readonly enrollRepo: Repository<CertEnrollment>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Certifications ───────────────────────────────────────────

  async createCertification(tenantId: string, dto: { name: string; description?: string; requirements?: any[]; validityMonths?: number }): Promise<Certification> {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    const requirements = (dto.requirements ?? []).filter((r) => r?.ref && (r.type === 'COURSE' || r.type === 'ASSESSMENT'));
    if (!requirements.length) throw new BadRequestException('At least one COURSE or ASSESSMENT requirement is required');
    return this.certRepo.save(this.certRepo.create({
      tenantId, name: dto.name.trim(), description: dto.description ?? null, requirements,
      validityMonths: dto.validityMonths ?? null, active: true,
    }));
  }

  listCertifications(tenantId: string): Promise<Certification[]> {
    return this.certRepo.find({ where: { tenantId, active: true }, order: { name: 'ASC' } });
  }

  // ─── Enrolment & progress ─────────────────────────────────────

  async enroll(tenantId: string, certId: string, learnerId: string): Promise<CertEnrollment> {
    const cert = await this.certRepo.findOne({ where: { id: certId, tenantId, active: true } });
    if (!cert) throw new NotFoundException(`Certification ${certId} not found`);
    const existing = await this.enrollRepo.findOne({ where: { tenantId, certId, learnerId } });
    if (existing && existing.status !== CertEnrollmentStatus.EXPIRED) return existing;
    return this.enrollRepo.save(this.enrollRepo.create({
      tenantId, certId, learnerId, status: CertEnrollmentStatus.ENROLLED, progress: [],
    }));
  }

  /**
   * Record a requirement as met (with an optional score). Re-evaluates the
   * enrolment: if every requirement is satisfied (and any minScore is met) the
   * learner is CERTIFIED with a certificate and expiry; otherwise IN_PROGRESS.
   */
  async recordRequirement(tenantId: string, enrollmentId: string, dto: { ref: string; score?: number }, now: Date): Promise<CertEnrollment> {
    const enrollment = await this.enrollRepo.findOne({ where: { id: enrollmentId, tenantId } });
    if (!enrollment) throw new NotFoundException(`Enrolment ${enrollmentId} not found`);
    if (enrollment.status === CertEnrollmentStatus.CERTIFIED) throw new BadRequestException('Learner is already certified');
    const cert = await this.certRepo.findOne({ where: { id: enrollment.certId, tenantId } });
    if (!cert) throw new NotFoundException('Certification not found');
    if (!cert.requirements.some((r) => r.ref === dto.ref)) throw new BadRequestException(`"${dto.ref}" is not a requirement of this certification`);

    enrollment.progress = [...enrollment.progress.filter((p) => p.ref !== dto.ref), { ref: dto.ref, score: dto.score ?? null }];

    const allMet = cert.requirements.every((req) => {
      const p = enrollment.progress.find((x) => x.ref === req.ref);
      if (!p) return false;
      if (req.minScore != null) return Number(p.score ?? 0) >= req.minScore;
      return true;
    });

    if (allMet) {
      enrollment.status = CertEnrollmentStatus.CERTIFIED;
      enrollment.certifiedAt = now;
      enrollment.expiresAt = cert.validityMonths ? addMonths(now, cert.validityMonths) : null;
      enrollment.certificateRef = `CERT-${cert.id.slice(0, 8)}-${enrollment.learnerId.slice(0, 8)}`;
      const saved = await this.enrollRepo.save(enrollment);
      await this.automation?.emit(tenantId, 'academy.certified', {
        enrollmentId: saved.id, certId: cert.id, certName: cert.name, learnerId: saved.learnerId, expiresAt: saved.expiresAt,
      });
      return saved;
    }
    enrollment.status = CertEnrollmentStatus.IN_PROGRESS;
    return this.enrollRepo.save(enrollment);
  }

  listEnrollments(tenantId: string, filter: { learnerId?: string; certId?: string; status?: CertEnrollmentStatus }): Promise<CertEnrollment[]> {
    const where: any = { tenantId };
    if (filter.learnerId) where.learnerId = filter.learnerId;
    if (filter.certId) where.certId = filter.certId;
    if (filter.status) where.status = filter.status;
    return this.enrollRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /** Flip certified enrolments past their expiry to EXPIRED. */
  async expireSweep(tenantId: string, asOf: string): Promise<{ expired: number }> {
    const due = await this.enrollRepo.find({ where: { tenantId, status: CertEnrollmentStatus.CERTIFIED, expiresAt: LessThanOrEqual(asOf) } });
    for (const e of due) e.status = CertEnrollmentStatus.EXPIRED;
    if (due.length) await this.enrollRepo.save(due);
    return { expired: due.length };
  }
}
