import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BpmProcess, BpmStage } from './entities/bpm-process.entity';
import { BpmInstance, BpmInstanceStatus } from './entities/bpm-instance.entity';
import { ApprovalTask, ApprovalTaskStatus } from './entities/approval-task.entity';
import { DelegationRule } from './entities/delegation-rule.entity';

@Injectable()
export class BpmService {
  constructor(
    @InjectRepository(BpmProcess) private readonly processRepo: Repository<BpmProcess>,
    @InjectRepository(BpmInstance) private readonly instanceRepo: Repository<BpmInstance>,
    @InjectRepository(ApprovalTask) private readonly taskRepo: Repository<ApprovalTask>,
    @InjectRepository(DelegationRule) private readonly delegationRepo: Repository<DelegationRule>,
  ) {}

  // ─── Ph-259: process definitions (designer) ───────────────────────

  listProcesses(tenantId: string): Promise<BpmProcess[]> {
    return this.processRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async createProcess(tenantId: string, data: { code: string; name: string; stages: BpmStage[]; swimlanes?: string[]; gateways?: any[] }): Promise<BpmProcess> {
    if (!data.code?.trim() || !data.name?.trim()) throw new BadRequestException('code and name are required');
    if (!data.stages?.length) throw new BadRequestException('at least one stage is required');
    for (const s of data.stages) {
      if (!s.id || !s.name) throw new BadRequestException('each stage needs an id and name');
      if (!s.approvers?.length) throw new BadRequestException(`stage "${s.id}" needs approvers`);
      if (!['ALL', 'ANY'].includes(s.mode)) throw new BadRequestException(`stage "${s.id}" mode must be ALL or ANY`);
    }
    const dup = await this.processRepo.findOne({ where: { tenantId, code: data.code } });
    if (dup) throw new BadRequestException('Process code already exists');
    const p = this.processRepo.create({
      tenantId, code: data.code, name: data.name, stages: data.stages,
      swimlanes: data.swimlanes ?? [], gateways: data.gateways ?? [], isActive: true,
    } as any) as unknown as BpmProcess;
    return (this.processRepo.save(p) as unknown) as Promise<BpmProcess>;
  }

  // ─── Ph-258: delegation resolution ────────────────────────────────

  async setDelegation(tenantId: string, data: { userId: string; delegateId: string; fromDate: string; toDate: string }): Promise<DelegationRule> {
    if (data.userId === data.delegateId) throw new BadRequestException('Cannot delegate to yourself');
    if (data.toDate < data.fromDate) throw new BadRequestException('toDate must be on/after fromDate');
    const r = this.delegationRepo.create({ tenantId, userId: data.userId, delegateId: data.delegateId, fromDate: data.fromDate, toDate: data.toDate, isActive: true } as any) as unknown as DelegationRule;
    return (this.delegationRepo.save(r) as unknown) as Promise<DelegationRule>;
  }

  private async resolveApprover(tenantId: string, userId: string, onDate: string): Promise<string> {
    const rules = await this.delegationRepo.find({ where: { tenantId, userId, isActive: true } });
    const active = rules.find((r) => onDate >= r.fromDate && onDate <= r.toDate);
    return active ? active.delegateId : userId;
  }

  // ─── Ph-256: start + parallel routing ─────────────────────────────

  private async createStageTasks(instance: BpmInstance, stage: BpmStage, stageIndex: number, startAt: string): Promise<void> {
    const onDate = startAt.slice(0, 10);
    const due = stage.escalationHours ? new Date(new Date(startAt).getTime() + stage.escalationHours * 3600000) : null;
    for (const approver of stage.approvers) {
      const resolved = await this.resolveApprover(instance.tenantId, approver, onDate);
      await this.taskRepo.save(this.taskRepo.create({
        tenantId: instance.tenantId, instanceId: instance.id, stageIndex, stageId: stage.id, mode: stage.mode,
        assignedTo: resolved, originalAssignee: approver, status: ApprovalTaskStatus.PENDING, dueAt: due, decidedAt: null, comment: null,
      } as any));
    }
  }

  async start(tenantId: string, processId: string, subjectRef: string, startAt: string): Promise<any> {
    const process = await this.processRepo.findOne({ where: { id: processId, tenantId } });
    if (!process) throw new NotFoundException('Process not found');
    if (!process.isActive) throw new BadRequestException('Process is not active');
    const instance = (await this.instanceRepo.save(this.instanceRepo.create({
      tenantId, processId, subjectRef, status: BpmInstanceStatus.RUNNING, currentStageIndex: 0, startedAt: new Date(startAt), completedAt: null,
    } as any))) as unknown as BpmInstance;
    await this.createStageTasks(instance, process.stages[0], 0, startAt);
    return { instance, activeStage: process.stages[0].id };
  }

  /**
   * Record an approval decision. ANY stages complete on the first approve; ALL
   * stages require every task approved. A reject fails the instance.
   */
  async decide(tenantId: string, taskId: string, userId: string, decision: 'APPROVE' | 'REJECT', at: string, comment?: string): Promise<any> {
    const task = await this.taskRepo.findOne({ where: { id: taskId, tenantId } });
    if (!task) throw new NotFoundException('Task not found');
    if (task.assignedTo !== userId) throw new ForbiddenException('Task is not assigned to you');
    if (task.status !== ApprovalTaskStatus.PENDING && task.status !== ApprovalTaskStatus.ESCALATED) throw new BadRequestException('Task already decided');
    const instance = await this.instanceRepo.findOne({ where: { id: task.instanceId, tenantId } });
    if (!instance || instance.status !== BpmInstanceStatus.RUNNING) throw new BadRequestException('Instance is not running');
    const process = await this.processRepo.findOne({ where: { id: instance.processId, tenantId } });
    if (!process) throw new NotFoundException('Process not found');

    task.status = decision === 'APPROVE' ? ApprovalTaskStatus.APPROVED : ApprovalTaskStatus.REJECTED;
    task.decidedAt = new Date(at);
    task.comment = comment ?? null;
    await this.taskRepo.save(task);

    if (decision === 'REJECT') {
      instance.status = BpmInstanceStatus.REJECTED;
      instance.completedAt = new Date(at);
      await this.instanceRepo.save(instance);
      return { instanceStatus: instance.status, stageAdvanced: false };
    }

    const stageTasks = await this.taskRepo.find({ where: { tenantId, instanceId: instance.id, stageIndex: task.stageIndex } });
    const approvedCount = stageTasks.filter((t) => t.status === ApprovalTaskStatus.APPROVED).length;
    const stageComplete = task.mode === 'ANY' ? approvedCount >= 1 : approvedCount === stageTasks.length;
    if (!stageComplete) return { instanceStatus: instance.status, stageAdvanced: false };

    // Skip remaining pending tasks in an ANY stage.
    if (task.mode === 'ANY') {
      for (const t of stageTasks) if (t.status === ApprovalTaskStatus.PENDING || t.status === ApprovalTaskStatus.ESCALATED) { t.status = ApprovalTaskStatus.SKIPPED; await this.taskRepo.save(t); }
    }

    const nextIndex = task.stageIndex + 1;
    if (nextIndex >= process.stages.length) {
      instance.status = BpmInstanceStatus.APPROVED;
      instance.completedAt = new Date(at);
      await this.instanceRepo.save(instance);
      return { instanceStatus: instance.status, stageAdvanced: true, completed: true };
    }
    instance.currentStageIndex = nextIndex;
    await this.instanceRepo.save(instance);
    await this.createStageTasks(instance, process.stages[nextIndex], nextIndex, at);
    return { instanceStatus: instance.status, stageAdvanced: true, activeStage: process.stages[nextIndex].id };
  }

  // ─── Ph-257: escalation ───────────────────────────────────────────

  /**
   * Escalate overdue pending tasks: reassign to the stage's escalateTo and mark
   * ESCALATED. Returns the escalated tasks.
   */
  async checkEscalations(tenantId: string, now: string): Promise<any> {
    const nowMs = new Date(now).getTime();
    const pending = await this.taskRepo.find({ where: { tenantId, status: ApprovalTaskStatus.PENDING } });
    const escalated: any[] = [];
    for (const t of pending) {
      if (!t.dueAt || new Date(t.dueAt).getTime() > nowMs) continue;
      const instance = await this.instanceRepo.findOne({ where: { id: t.instanceId, tenantId } });
      const process = instance ? await this.processRepo.findOne({ where: { id: instance.processId, tenantId } }) : null;
      const stage = process?.stages[t.stageIndex];
      if (!stage?.escalateTo) continue;
      t.status = ApprovalTaskStatus.ESCALATED;
      t.assignedTo = stage.escalateTo;
      await this.taskRepo.save(t);
      escalated.push({ taskId: t.id, escalatedTo: stage.escalateTo, stageId: t.stageId });
    }
    return { escalatedCount: escalated.length, escalated };
  }

  // ─── retrieval ────────────────────────────────────────────────────

  listTasks(tenantId: string, assignedTo: string, status?: ApprovalTaskStatus): Promise<ApprovalTask[]> {
    const where: any = { tenantId, assignedTo };
    if (status) where.status = status;
    return this.taskRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getInstance(tenantId: string, id: string): Promise<any> {
    const instance = await this.instanceRepo.findOne({ where: { id, tenantId } });
    if (!instance) throw new NotFoundException('Instance not found');
    const tasks = await this.taskRepo.find({ where: { tenantId, instanceId: id }, order: { stageIndex: 'ASC' } });
    return { instance, tasks };
  }
}
