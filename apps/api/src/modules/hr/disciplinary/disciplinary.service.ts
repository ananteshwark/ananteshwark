import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DisciplinaryCase, DisciplinaryType, DisciplinarySeverity, DisciplinaryStatus, DisciplinaryStage,
  DisciplinaryAction, DisciplinaryEvent, CaseEventKind,
} from './entities/disciplinary.entity';
import { AutomationService } from '../../automation/automation.service';

// Progressive-discipline ladder order for advance-stage validation.
const STAGE_ORDER: DisciplinaryStage[] = [
  DisciplinaryStage.NONE,
  DisciplinaryStage.VERBAL_WARNING,
  DisciplinaryStage.WRITTEN_WARNING,
  DisciplinaryStage.FINAL_WARNING,
  DisciplinaryStage.SUSPENSION,
  DisciplinaryStage.TERMINATION,
];

@Injectable()
export class DisciplinaryService {
  constructor(
    @InjectRepository(DisciplinaryCase) private readonly caseRepo: Repository<DisciplinaryCase>,
    @InjectRepository(DisciplinaryAction) private readonly actionRepo: Repository<DisciplinaryAction>,
    @InjectRepository(DisciplinaryEvent) private readonly eventRepo: Repository<DisciplinaryEvent>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  async openCase(tenantId: string, dto: { employeeId: string; employeeName: string; caseType?: DisciplinaryType; severity?: DisciplinarySeverity; description: string; raisedByUserId?: string; confidential?: boolean }): Promise<DisciplinaryCase> {
    if (!dto.employeeId || !dto.description?.trim()) throw new BadRequestException('employeeId and description are required');
    const kase = await this.caseRepo.save(this.caseRepo.create({
      tenantId, employeeId: dto.employeeId, employeeName: dto.employeeName,
      caseType: dto.caseType ?? DisciplinaryType.MISCONDUCT, severity: dto.severity ?? DisciplinarySeverity.MINOR,
      status: DisciplinaryStatus.OPEN, currentStage: DisciplinaryStage.NONE,
      description: dto.description.trim(), raisedByUserId: dto.raisedByUserId ?? null,
      confidential: dto.confidential !== false,
    }));
    await this.eventRepo.save(this.eventRepo.create({
      tenantId, caseId: kase.id, kind: CaseEventKind.NOTE, detail: 'Case opened', byUserId: dto.raisedByUserId ?? null,
    }));
    await this.automation?.emit(tenantId, 'disciplinary.opened', {
      caseId: kase.id, employeeId: kase.employeeId, caseType: kase.caseType, severity: kase.severity,
    });
    return kase;
  }

  listCases(tenantId: string, filter: { employeeId?: string; status?: DisciplinaryStatus }): Promise<DisciplinaryCase[]> {
    const where: any = { tenantId };
    if (filter.employeeId) where.employeeId = filter.employeeId;
    if (filter.status) where.status = filter.status;
    return this.caseRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getCase(tenantId: string, id: string): Promise<{ case: DisciplinaryCase; actions: DisciplinaryAction[]; timeline: DisciplinaryEvent[] }> {
    const kase = await this.caseRepo.findOne({ where: { id, tenantId } });
    if (!kase) throw new NotFoundException(`Disciplinary case ${id} not found`);
    const [actions, timeline] = await Promise.all([
      this.actionRepo.find({ where: { tenantId, caseId: id }, order: { createdAt: 'ASC' } }),
      this.eventRepo.find({ where: { tenantId, caseId: id }, order: { createdAt: 'ASC' } }),
    ]);
    return { case: kase, actions, timeline };
  }

  private async findCase(tenantId: string, id: string): Promise<DisciplinaryCase> {
    const kase = await this.caseRepo.findOne({ where: { id, tenantId } });
    if (!kase) throw new NotFoundException(`Disciplinary case ${id} not found`);
    return kase;
  }

  async addEvent(tenantId: string, caseId: string, dto: { kind?: CaseEventKind; detail: string; byUserId?: string }): Promise<DisciplinaryEvent> {
    await this.findCase(tenantId, caseId);
    if (!dto.detail?.trim()) throw new BadRequestException('detail is required');
    return this.eventRepo.save(this.eventRepo.create({
      tenantId, caseId, kind: dto.kind ?? CaseEventKind.NOTE, detail: dto.detail.trim(), byUserId: dto.byUserId ?? null,
    }));
  }

  async transitionStatus(tenantId: string, caseId: string, status: DisciplinaryStatus, byUserId?: string): Promise<DisciplinaryCase> {
    const kase = await this.findCase(tenantId, caseId);
    if (kase.status === DisciplinaryStatus.CLOSED) throw new BadRequestException('A closed case cannot change status');
    kase.status = status;
    const saved = await this.caseRepo.save(kase);
    await this.eventRepo.save(this.eventRepo.create({
      tenantId, caseId, kind: CaseEventKind.STATUS_CHANGE, detail: `Status → ${status}`, byUserId: byUserId ?? null,
    }));
    return saved;
  }

  /**
   * Issue a progressive-discipline action. The stage may only move forward
   * along the ladder (no regressing to a lighter stage); GROSS misconduct is
   * allowed to jump straight to termination.
   */
  async issueAction(tenantId: string, caseId: string, dto: { actionStage: DisciplinaryStage; issuedByUserId?: string; note?: string; expiresAt?: string }): Promise<DisciplinaryAction> {
    const kase = await this.findCase(tenantId, caseId);
    if (kase.status === DisciplinaryStatus.CLOSED) throw new BadRequestException('A closed case cannot receive actions');
    const targetIdx = STAGE_ORDER.indexOf(dto.actionStage);
    const currentIdx = STAGE_ORDER.indexOf(kase.currentStage);
    if (targetIdx <= 0) throw new BadRequestException('A concrete disciplinary stage is required');
    const isGrossJump = kase.severity === DisciplinarySeverity.GROSS;
    if (targetIdx <= currentIdx) throw new BadRequestException('Disciplinary stage cannot move backwards');
    if (targetIdx > currentIdx + 1 && !isGrossJump) {
      throw new BadRequestException('Progressive discipline requires advancing one stage at a time (except for gross misconduct)');
    }
    const action = await this.actionRepo.save(this.actionRepo.create({
      tenantId, caseId, employeeId: kase.employeeId, actionStage: dto.actionStage,
      issuedByUserId: dto.issuedByUserId ?? null, note: dto.note ?? null, acknowledged: false, expiresAt: dto.expiresAt ?? null,
    }));
    kase.currentStage = dto.actionStage;
    kase.status = DisciplinaryStatus.DECISION;
    await this.caseRepo.save(kase);
    await this.eventRepo.save(this.eventRepo.create({
      tenantId, caseId, kind: CaseEventKind.STATUS_CHANGE, detail: `Action issued: ${dto.actionStage}`, byUserId: dto.issuedByUserId ?? null,
    }));
    await this.automation?.emit(tenantId, 'disciplinary.action_issued', {
      caseId, employeeId: kase.employeeId, actionStage: dto.actionStage,
    });
    return action;
  }

  async acknowledgeAction(tenantId: string, actionId: string): Promise<DisciplinaryAction> {
    const action = await this.actionRepo.findOne({ where: { id: actionId, tenantId } });
    if (!action) throw new NotFoundException(`Action ${actionId} not found`);
    action.acknowledged = true;
    return this.actionRepo.save(action);
  }

  async closeCase(tenantId: string, caseId: string, dto: { outcome?: string; byUserId?: string }): Promise<DisciplinaryCase> {
    const kase = await this.findCase(tenantId, caseId);
    if (kase.status === DisciplinaryStatus.CLOSED) throw new BadRequestException('Case is already closed');
    kase.status = DisciplinaryStatus.CLOSED;
    kase.closedAt = new Date();
    if (dto.outcome) kase.outcome = dto.outcome;
    const saved = await this.caseRepo.save(kase);
    await this.eventRepo.save(this.eventRepo.create({
      tenantId, caseId, kind: CaseEventKind.STATUS_CHANGE, detail: 'Case closed', byUserId: dto.byUserId ?? null,
    }));
    await this.automation?.emit(tenantId, 'disciplinary.closed', {
      caseId, employeeId: kase.employeeId, finalStage: kase.currentStage, outcome: kase.outcome,
    });
    return saved;
  }

  /**
   * An employee's active (non-expired) warnings — the progressive-discipline
   * history that determines the next appropriate stage.
   */
  async activeWarnings(tenantId: string, employeeId: string, asOf: string): Promise<DisciplinaryAction[]> {
    const actions = await this.actionRepo.find({ where: { tenantId, employeeId }, order: { createdAt: 'DESC' } });
    return actions.filter((a) => !a.expiresAt || a.expiresAt >= asOf);
  }
}
