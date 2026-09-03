import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { I9Case, I9Status, CitizenshipStatus, EVerifyResult } from './entities/i9-case.entity';
import { AutomationService } from '../../automation/automation.service';
import { EVerifyAdapter } from './everify.adapter';

/** Add `n` business days (skipping Sat/Sun) to a YYYY-MM-DD date. */
function addBusinessDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  let added = 0;
  while (added < n) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class I9Service {
  constructor(
    @InjectRepository(I9Case) private readonly caseRepo: Repository<I9Case>,
    @Optional() private readonly automation?: AutomationService,
    @Optional() private readonly everify?: EVerifyAdapter,
  ) {}

  async createCase(tenantId: string, dto: { employeeId: string; employeeName: string; hireDate: string; everifyEnabled?: boolean }): Promise<I9Case> {
    if (!dto.employeeId || !dto.hireDate) throw new BadRequestException('employeeId and hireDate are required');
    const existing = await this.caseRepo.findOne({ where: { tenantId, employeeId: dto.employeeId } });
    if (existing) throw new BadRequestException('An I-9 case already exists for this employee');
    return this.caseRepo.save(this.caseRepo.create({
      tenantId, employeeId: dto.employeeId, employeeName: dto.employeeName, hireDate: dto.hireDate,
      section2DueDate: addBusinessDays(dto.hireDate, 3),
      status: I9Status.SECTION1_PENDING, everifyEnabled: dto.everifyEnabled ?? false,
    }));
  }

  listCases(tenantId: string, status?: I9Status): Promise<I9Case[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.caseRepo.find({ where, order: { hireDate: 'DESC' } });
  }

  async getCase(tenantId: string, id: string): Promise<I9Case> {
    const kase = await this.caseRepo.findOne({ where: { id, tenantId } });
    if (!kase) throw new NotFoundException(`I-9 case ${id} not found`);
    return kase;
  }

  /** Employee completes Section 1. Alien-authorized status requires a work-auth expiry. */
  async completeSection1(tenantId: string, id: string, dto: { citizenshipStatus: CitizenshipStatus; workAuthExpiry?: string; signedAt?: string }): Promise<I9Case> {
    const kase = await this.getCase(tenantId, id);
    if (kase.status !== I9Status.SECTION1_PENDING) throw new BadRequestException('Section 1 has already been completed');
    if (!Object.values(CitizenshipStatus).includes(dto.citizenshipStatus)) throw new BadRequestException('A valid citizenship status is required');
    if (dto.citizenshipStatus === CitizenshipStatus.ALIEN_AUTHORIZED && !dto.workAuthExpiry) {
      throw new BadRequestException('Alien-authorized status requires a work-authorization expiry date');
    }
    kase.section1 = {
      citizenshipStatus: dto.citizenshipStatus,
      workAuthExpiry: dto.workAuthExpiry ?? null,
      signedAt: dto.signedAt ?? new Date().toISOString().slice(0, 10),
    };
    kase.status = I9Status.SECTION2_PENDING;
    return this.caseRepo.save(kase);
  }

  /**
   * Employer completes Section 2 by recording the documents presented. Valid
   * combinations: a single List A document, OR one List B + one List C.
   */
  async completeSection2(tenantId: string, id: string, dto: { documents: Array<{ list: 'A' | 'B' | 'C'; title: string; number?: string; expiry?: string }>; verifiedByUserId: string }): Promise<I9Case> {
    const kase = await this.getCase(tenantId, id);
    if (kase.status !== I9Status.SECTION2_PENDING) throw new BadRequestException('The case is not awaiting Section 2');
    const docs = dto.documents ?? [];
    const a = docs.filter((d) => d.list === 'A');
    const b = docs.filter((d) => d.list === 'B');
    const c = docs.filter((d) => d.list === 'C');
    const validA = a.length === 1 && b.length === 0 && c.length === 0;
    const validBC = a.length === 0 && b.length === 1 && c.length === 1;
    if (!validA && !validBC) {
      throw new BadRequestException('Section 2 requires either one List A document, or one List B and one List C document');
    }
    kase.section2 = { documents: docs, verifiedByUserId: dto.verifiedByUserId, verifiedAt: new Date().toISOString().slice(0, 10) };
    // Carry a reverification date from any document (or Section 1) expiry.
    const expiries = [
      ...docs.map((d) => d.expiry).filter(Boolean) as string[],
      kase.section1?.workAuthExpiry ?? undefined,
    ].filter(Boolean) as string[];
    if (expiries.length) kase.reverificationDate = expiries.sort()[0];

    if (kase.everifyEnabled) {
      kase.status = I9Status.EVERIFY_PENDING;
    } else {
      kase.status = I9Status.COMPLETE;
      kase.completedAt = new Date();
      await this.automation?.emit(tenantId, 'i9.completed', { caseId: kase.id, employeeId: kase.employeeId, everify: false });
    }
    return this.caseRepo.save(kase);
  }

  /** Submit to E-Verify and record the result. Authorization completes the case. */
  async recordEVerify(tenantId: string, id: string, dto: { caseNumber: string; result: EVerifyResult }): Promise<I9Case> {
    const kase = await this.getCase(tenantId, id);
    if (kase.status !== I9Status.EVERIFY_PENDING) throw new BadRequestException('The case is not awaiting an E-Verify result');
    if (!Object.values(EVerifyResult).includes(dto.result)) throw new BadRequestException('A valid E-Verify result is required');
    kase.everify = { caseNumber: dto.caseNumber, result: dto.result, submittedAt: new Date().toISOString().slice(0, 10) };
    if (dto.result === EVerifyResult.EMPLOYMENT_AUTHORIZED) {
      kase.status = I9Status.COMPLETE;
      kase.completedAt = new Date();
      await this.automation?.emit(tenantId, 'i9.completed', { caseId: kase.id, employeeId: kase.employeeId, everify: true });
    }
    // TNC / final non-confirmation keep the case in EVERIFY_PENDING for follow-up.
    return this.caseRepo.save(kase);
  }

  get everifyLive(): boolean {
    return !!this.everify;
  }

  /**
   * Live E-Verify submission through the adapter seam. Requires Section 1 and
   * Section 2 to be complete. If the adapter returns an immediate result it is
   * applied via recordEVerify; otherwise the caseNumber is stamped and the case
   * stays EVERIFY_PENDING for a later status refresh. Without a wired adapter it
   * returns submitted:false and the manual path remains available.
   */
  async submitToEVerify(tenantId: string, id: string): Promise<{ case: I9Case; submitted: boolean; result?: EVerifyResult; reason?: string }> {
    const kase = await this.getCase(tenantId, id);
    if (kase.status !== I9Status.EVERIFY_PENDING) throw new BadRequestException('The case is not awaiting E-Verify');
    if (!kase.section1 || !kase.section2) throw new BadRequestException('Section 1 and Section 2 must be complete before E-Verify');
    if (!this.everify) return { case: kase, submitted: false, reason: 'E-Verify integration not wired in this deployment' };

    const res = await this.everify.submitCase({ employeeName: kase.employeeName, hireDate: kase.hireDate, section1: kase.section1, section2: kase.section2 });
    if (!res.submitted) return { case: kase, submitted: false, reason: res.reason };

    const caseNumber = res.caseNumber ?? `EV-${kase.id.slice(0, 10)}`;
    if (res.result) {
      const updated = await this.recordEVerify(tenantId, id, { caseNumber, result: res.result });
      await this.maybeEmitTnc(tenantId, updated, res.result);
      return { case: updated, submitted: true, result: res.result };
    }
    kase.everify = { caseNumber, result: undefined as any, submittedAt: new Date().toISOString().slice(0, 10) };
    return { case: await this.caseRepo.save(kase), submitted: true, reason: 'Submitted; awaiting result' };
  }

  /** Poll E-Verify for a submitted case and apply any newly available result. */
  async refreshEVerify(tenantId: string, id: string): Promise<{ case: I9Case; result?: EVerifyResult; reason?: string }> {
    const kase = await this.getCase(tenantId, id);
    if (!this.everify) return { case: kase, reason: 'E-Verify integration not wired in this deployment' };
    if (!kase.everify?.caseNumber) throw new BadRequestException('No E-Verify case has been submitted');
    if (kase.status !== I9Status.EVERIFY_PENDING) return { case: kase, reason: 'Case is not awaiting an E-Verify result' };
    const res = await this.everify.checkStatus(kase.everify.caseNumber);
    if (!res.result) return { case: kase, reason: res.reason ?? 'No result yet' };
    const updated = await this.recordEVerify(tenantId, id, { caseNumber: kase.everify.caseNumber, result: res.result });
    await this.maybeEmitTnc(tenantId, updated, res.result);
    return { case: updated, result: res.result };
  }

  private async maybeEmitTnc(tenantId: string, kase: I9Case, result: EVerifyResult): Promise<void> {
    if (result === EVerifyResult.TENTATIVE_NONCONFIRMATION) {
      await this.automation?.emit(tenantId, 'i9.everify_tnc', { caseId: kase.id, employeeId: kase.employeeId, caseNumber: kase.everify?.caseNumber });
    }
  }

  /** Flag a completed case for reverification (work authorization expiring). */
  async flagReverification(tenantId: string, id: string, reverificationDate: string): Promise<I9Case> {
    const kase = await this.getCase(tenantId, id);
    kase.status = I9Status.REVERIFICATION;
    kase.reverificationDate = reverificationDate;
    return this.caseRepo.save(kase);
  }

  /** Cases whose Section 2 deadline has passed while still pending. */
  async section2Overdue(tenantId: string, asOf: string): Promise<I9Case[]> {
    return this.caseRepo.find({
      where: { tenantId, status: I9Status.SECTION2_PENDING, section2DueDate: LessThan(asOf) },
      order: { section2DueDate: 'ASC' },
    });
  }

  /** Completed cases whose reverification date is on/before `asOf`. */
  async dueForReverification(tenantId: string, asOf: string): Promise<I9Case[]> {
    const cases = await this.caseRepo.find({ where: { tenantId, status: I9Status.COMPLETE }, order: { reverificationDate: 'ASC' } });
    return cases.filter((k) => k.reverificationDate && k.reverificationDate <= asOf);
  }
}
