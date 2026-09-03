import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CloseTask, CloseTaskStatus, CloseTaskType } from './entities/close-task.entity';
import { AccountReconciliation, ReconStatus } from './entities/account-reconciliation.entity';
import { GlService } from '../gl/gl.service';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class CloseManagementService {
  constructor(
    @InjectRepository(CloseTask) private readonly taskRepo: Repository<CloseTask>,
    @InjectRepository(AccountReconciliation) private readonly reconRepo: Repository<AccountReconciliation>,
    private readonly glService: GlService,
  ) {}

  private today(): string {
    // deterministic-safe: derive from a JS Date is disallowed in workflows but
    // fine in a Nest service at runtime
    return new Date().toISOString().slice(0, 10);
  }

  // ─── Ph-131: Close tasks ──────────────────────────────────────────

  async listTasks(tenantId: string, params: { periodId?: string; status?: CloseTaskStatus } = {}): Promise<CloseTask[]> {
    const where: any = { tenantId };
    if (params.periodId) where.periodId = params.periodId;
    if (params.status) where.status = params.status;
    return this.taskRepo.find({ where, order: { sequence: 'ASC', dueDate: 'ASC' } });
  }

  async createTask(tenantId: string, data: {
    periodId: string; title: string; taskType?: CloseTaskType; accountId?: string;
    preparerId?: string; reviewerId?: string; dueDate: string; sequence?: number; notes?: string;
  }): Promise<CloseTask> {
    if (!data.periodId) throw new BadRequestException('periodId is required');
    if (!data.title) throw new BadRequestException('title is required');
    if (!data.dueDate) throw new BadRequestException('dueDate is required');
    const task = this.taskRepo.create({
      tenantId,
      periodId: data.periodId,
      title: data.title,
      taskType: data.taskType ?? CloseTaskType.OTHER,
      accountId: data.accountId ?? null,
      preparerId: data.preparerId ?? null,
      reviewerId: data.reviewerId ?? null,
      dueDate: data.dueDate,
      status: CloseTaskStatus.OPEN,
      sequence: data.sequence ?? 0,
      notes: data.notes ?? null,
    } as any) as unknown as CloseTask;
    return (this.taskRepo.save(task) as unknown) as Promise<CloseTask>;
  }

  private async getTask(tenantId: string, id: string): Promise<CloseTask> {
    const task = await this.taskRepo.findOne({ where: { id, tenantId } });
    if (!task) throw new NotFoundException(`Close task ${id} not found`);
    return task;
  }

  async transitionTask(tenantId: string, id: string, action: 'start' | 'prepare' | 'certify' | 'reject' | 'reopen', data: { reason?: string } = {}): Promise<CloseTask> {
    const task = await this.getTask(tenantId, id);
    switch (action) {
      case 'start':
        if (task.status !== CloseTaskStatus.OPEN) throw new BadRequestException('Only OPEN tasks can be started');
        task.status = CloseTaskStatus.IN_PROGRESS;
        break;
      case 'prepare':
        if (![CloseTaskStatus.OPEN, CloseTaskStatus.IN_PROGRESS, CloseTaskStatus.REJECTED].includes(task.status)) {
          throw new BadRequestException(`Cannot prepare a ${task.status} task`);
        }
        task.status = CloseTaskStatus.PREPARED;
        task.preparedAt = new Date();
        break;
      case 'certify':
        if (task.status !== CloseTaskStatus.PREPARED) throw new BadRequestException('Only PREPARED tasks can be certified');
        task.status = CloseTaskStatus.CERTIFIED;
        task.certifiedAt = new Date();
        break;
      case 'reject':
        if (task.status !== CloseTaskStatus.PREPARED) throw new BadRequestException('Only PREPARED tasks can be rejected');
        task.status = CloseTaskStatus.REJECTED;
        task.rejectReason = data.reason ?? null;
        break;
      case 'reopen':
        if (task.status !== CloseTaskStatus.CERTIFIED) throw new BadRequestException('Only CERTIFIED tasks can be reopened');
        task.status = CloseTaskStatus.IN_PROGRESS;
        task.certifiedAt = null;
        break;
    }
    return (this.taskRepo.save(task) as unknown) as Promise<CloseTask>;
  }

  // ─── Ph-132: Reconciliations ──────────────────────────────────────

  async listReconciliations(tenantId: string, periodId?: string): Promise<AccountReconciliation[]> {
    const where: any = { tenantId };
    if (periodId) where.periodId = periodId;
    return this.reconRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /** Create a reconciliation, pulling the live GL balance as of the date. */
  async createReconciliation(tenantId: string, data: {
    periodId: string; accountId: string; closeTaskId?: string; asOfDate?: string;
    scheduleItems?: Array<{ description: string; amount: number; reference?: string }>;
  }): Promise<AccountReconciliation> {
    if (!data.accountId) throw new BadRequestException('accountId is required');
    const glBalance = await this.glService.getAccountBalance(tenantId, data.accountId, data.asOfDate);
    const items = data.scheduleItems ?? [];
    const supporting = round2(items.reduce((s, i) => s + Number(i.amount), 0));
    const recon = this.reconRepo.create({
      tenantId,
      periodId: data.periodId,
      accountId: data.accountId,
      closeTaskId: data.closeTaskId ?? null,
      glBalance: round2(glBalance),
      supportingBalance: supporting,
      variance: round2(glBalance - supporting),
      scheduleItems: items,
      status: ReconStatus.OPEN,
      asOfDate: data.asOfDate ?? null,
    } as any) as unknown as AccountReconciliation;
    return (this.reconRepo.save(recon) as unknown) as Promise<AccountReconciliation>;
  }

  private async getRecon(tenantId: string, id: string): Promise<AccountReconciliation> {
    const recon = await this.reconRepo.findOne({ where: { id, tenantId } });
    if (!recon) throw new NotFoundException(`Reconciliation ${id} not found`);
    return recon;
  }

  async addScheduleItem(tenantId: string, id: string, item: { description: string; amount: number; reference?: string }): Promise<AccountReconciliation> {
    const recon = await this.getRecon(tenantId, id);
    if (recon.status === ReconStatus.CERTIFIED) throw new BadRequestException('Cannot modify a certified reconciliation');
    recon.scheduleItems = [...(recon.scheduleItems ?? []), { description: item.description, amount: round2(item.amount), reference: item.reference }];
    recon.supportingBalance = round2(recon.scheduleItems.reduce((s, i) => s + Number(i.amount), 0));
    recon.variance = round2(Number(recon.glBalance) - recon.supportingBalance);
    return (this.reconRepo.save(recon) as unknown) as Promise<AccountReconciliation>;
  }

  /** Refresh the GL balance (e.g. after late journals) and recompute variance. */
  async refreshReconciliation(tenantId: string, id: string): Promise<AccountReconciliation> {
    const recon = await this.getRecon(tenantId, id);
    if (recon.status === ReconStatus.CERTIFIED) throw new BadRequestException('Cannot refresh a certified reconciliation');
    recon.glBalance = round2(await this.glService.getAccountBalance(tenantId, recon.accountId, recon.asOfDate ?? undefined));
    recon.variance = round2(Number(recon.glBalance) - Number(recon.supportingBalance));
    return (this.reconRepo.save(recon) as unknown) as Promise<AccountReconciliation>;
  }

  async reconAction(tenantId: string, id: string, action: 'prepare' | 'certify' | 'reject', data: { userId?: string; reason?: string } = {}): Promise<AccountReconciliation> {
    const recon = await this.getRecon(tenantId, id);
    if (action === 'prepare') {
      if (recon.status !== ReconStatus.OPEN && recon.status !== ReconStatus.REJECTED) throw new BadRequestException('Only OPEN/REJECTED reconciliations can be prepared');
      recon.status = ReconStatus.PREPARED;
      recon.preparerId = data.userId ?? recon.preparerId;
      recon.preparedAt = new Date();
    } else if (action === 'certify') {
      if (recon.status !== ReconStatus.PREPARED) throw new BadRequestException('Only PREPARED reconciliations can be certified');
      if (round2(Number(recon.variance)) !== 0) {
        throw new BadRequestException(`Cannot certify a reconciliation with a non-zero variance (${recon.variance})`);
      }
      recon.status = ReconStatus.CERTIFIED;
      recon.reviewerId = data.userId ?? recon.reviewerId;
      recon.certifiedAt = new Date();
    } else if (action === 'reject') {
      if (recon.status !== ReconStatus.PREPARED) throw new BadRequestException('Only PREPARED reconciliations can be rejected');
      recon.status = ReconStatus.REJECTED;
      recon.notes = data.reason ?? recon.notes;
    }
    return (this.reconRepo.save(recon) as unknown) as Promise<AccountReconciliation>;
  }

  // ─── Ph-133: Close calendar dashboard ─────────────────────────────

  async closeDashboard(tenantId: string, periodId: string): Promise<any> {
    const tasks = await this.taskRepo.find({ where: { tenantId, periodId } });
    const today = this.today();
    const counts: Record<string, number> = { OPEN: 0, IN_PROGRESS: 0, PREPARED: 0, CERTIFIED: 0, REJECTED: 0 };
    let overdue = 0;
    const overdueTasks: any[] = [];
    for (const t of tasks) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
      if (t.status !== CloseTaskStatus.CERTIFIED && t.dueDate < today) {
        overdue++;
        overdueTasks.push({ id: t.id, title: t.title, dueDate: t.dueDate, status: t.status, daysOverdue: Math.floor((new Date(today).getTime() - new Date(t.dueDate).getTime()) / 86400000) });
      }
    }
    const total = tasks.length;
    const certified = counts.CERTIFIED;
    const recons = await this.reconRepo.find({ where: { tenantId, periodId } });
    return {
      periodId,
      total,
      certified,
      completionPct: total > 0 ? round2((certified / total) * 100) : 0,
      statusCounts: counts,
      overdue,
      overdueTasks,
      reconciliations: {
        total: recons.length,
        certified: recons.filter((r) => r.status === ReconStatus.CERTIFIED).length,
        withVariance: recons.filter((r) => round2(Number(r.variance)) !== 0).length,
      },
      readyToClose: total > 0 && certified === total && overdue === 0,
    };
  }
}
