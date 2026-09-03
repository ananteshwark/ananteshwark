import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FaceEnrollment, MobileAppConfig, Visitor, VisitorStatus } from './entities/device.entity';
import { FaceMatchAdapter } from './face-match.adapter';
import { AutomationService } from '../../automation/automation.service';

/** Compare two dotted numeric versions: -1 (a<b), 0 (equal), 1 (a>b). */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

@Injectable()
export class DeviceService {
  constructor(
    @InjectRepository(FaceEnrollment) private readonly faceRepo: Repository<FaceEnrollment>,
    @InjectRepository(MobileAppConfig) private readonly configRepo: Repository<MobileAppConfig>,
    @InjectRepository(Visitor) private readonly visitorRepo: Repository<Visitor>,
    private readonly faceMatch: FaceMatchAdapter,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Facial check-in ──────────────────────────────────────────

  async enrollFace(tenantId: string, dto: { employeeId: string; templateRef: string }): Promise<FaceEnrollment> {
    if (!dto.employeeId || !dto.templateRef?.trim()) throw new BadRequestException('employeeId and templateRef are required');
    let e = await this.faceRepo.findOne({ where: { tenantId, employeeId: dto.employeeId } });
    if (!e) e = this.faceRepo.create({ tenantId, employeeId: dto.employeeId });
    e.templateRef = dto.templateRef.trim();
    e.active = true;
    return this.faceRepo.save(e);
  }

  async deactivateFace(tenantId: string, employeeId: string): Promise<FaceEnrollment> {
    const e = await this.faceRepo.findOne({ where: { tenantId, employeeId } });
    if (!e) throw new NotFoundException(`Face enrolment for ${employeeId} not found`);
    e.active = false;
    return this.faceRepo.save(e);
  }

  /** Match a probe against active enrolments via the face seam. */
  async faceCheckIn(tenantId: string, probeRef: string): Promise<{ matched: boolean; employeeId?: string; confidence?: number; reason?: string }> {
    if (!probeRef?.trim()) throw new BadRequestException('probeRef is required');
    const enrolled = (await this.faceRepo.find({ where: { tenantId, active: true } })).map((e) => ({ employeeId: e.employeeId, templateRef: e.templateRef }));
    const res = await this.faceMatch.match(probeRef, enrolled);
    return { matched: res.matched, employeeId: res.employeeId, confidence: res.confidence, reason: res.reason };
  }

  // ─── Mobile app config ────────────────────────────────────────

  async getMobileConfig(tenantId: string): Promise<MobileAppConfig> {
    let cfg = await this.configRepo.findOne({ where: { tenantId } });
    if (!cfg) cfg = await this.configRepo.save(this.configRepo.create({ tenantId }));
    return cfg;
  }

  async updateMobileConfig(tenantId: string, dto: Partial<MobileAppConfig> & { updatedByUserId?: string }): Promise<MobileAppConfig> {
    const cfg = await this.getMobileConfig(tenantId);
    const fields: (keyof MobileAppConfig)[] = ['minVersion', 'latestVersion', 'theme', 'featureFlags', 'offlineEntities', 'deepLinks'];
    for (const f of fields) if ((dto as any)[f] !== undefined) (cfg as any)[f] = (dto as any)[f];
    if (dto.updatedByUserId) cfg.updatedByUserId = dto.updatedByUserId;
    return this.configRepo.save(cfg);
  }

  /** Version gate for a launching client. */
  async checkVersion(tenantId: string, clientVersion: string): Promise<{ supported: boolean; forceUpdate: boolean; latestVersion: string; updateAvailable: boolean }> {
    const cfg = await this.getMobileConfig(tenantId);
    const belowMin = compareVersions(clientVersion, cfg.minVersion) < 0;
    return {
      supported: !belowMin,
      forceUpdate: belowMin,
      latestVersion: cfg.latestVersion,
      updateAvailable: compareVersions(clientVersion, cfg.latestVersion) < 0,
    };
  }

  // ─── Visitor kiosk ────────────────────────────────────────────

  async preRegister(tenantId: string, dto: { fullName: string; company?: string; email?: string; phone?: string; hostEmployeeId?: string; purpose?: string; expectedAt?: string }): Promise<Visitor> {
    if (!dto.fullName?.trim()) throw new BadRequestException('fullName is required');
    return this.visitorRepo.save(this.visitorRepo.create({
      tenantId, fullName: dto.fullName.trim(), company: dto.company ?? null, email: dto.email ?? null,
      phone: dto.phone ?? null, hostEmployeeId: dto.hostEmployeeId ?? null, purpose: dto.purpose ?? null,
      expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : null, status: VisitorStatus.PRE_REGISTERED,
    }));
  }

  listVisitors(tenantId: string, status?: VisitorStatus): Promise<Visitor[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.visitorRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /** Kiosk check-in: assign a badge, stamp the time, notify the host. */
  async checkIn(tenantId: string, visitorId: string, badgeNumber?: string): Promise<Visitor> {
    const v = await this.visitorRepo.findOne({ where: { id: visitorId, tenantId } });
    if (!v) throw new NotFoundException(`Visitor ${visitorId} not found`);
    if (v.status === VisitorStatus.CHECKED_IN) throw new BadRequestException('Visitor is already checked in');
    if (v.status === VisitorStatus.CHECKED_OUT) throw new BadRequestException('Visitor has already checked out');
    v.status = VisitorStatus.CHECKED_IN;
    v.checkedInAt = new Date();
    v.badgeNumber = badgeNumber ?? `V-${visitorId.slice(0, 8).toUpperCase()}`;
    const saved = await this.visitorRepo.save(v);
    await this.automation?.emit(tenantId, 'visitor.checked_in', {
      visitorId, fullName: v.fullName, hostEmployeeId: v.hostEmployeeId, badgeNumber: v.badgeNumber,
    });
    return saved;
  }

  async checkOut(tenantId: string, visitorId: string): Promise<Visitor> {
    const v = await this.visitorRepo.findOne({ where: { id: visitorId, tenantId } });
    if (!v) throw new NotFoundException(`Visitor ${visitorId} not found`);
    if (v.status !== VisitorStatus.CHECKED_IN) throw new BadRequestException('Only checked-in visitors can check out');
    v.status = VisitorStatus.CHECKED_OUT;
    v.checkedOutAt = new Date();
    return this.visitorRepo.save(v);
  }

  /** Mark pre-registered visitors expected before `asOf` who never arrived as NO_SHOW. */
  async noShowSweep(tenantId: string, asOf: Date): Promise<{ noShows: number }> {
    const pending = await this.visitorRepo.find({ where: { tenantId, status: VisitorStatus.PRE_REGISTERED } });
    const stale = pending.filter((v) => v.expectedAt && v.expectedAt < asOf);
    for (const v of stale) v.status = VisitorStatus.NO_SHOW;
    if (stale.length) await this.visitorRepo.save(stale);
    return { noShows: stale.length };
  }
}
