import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CapitalProjectConfig, CostTreatment } from './entities/capital-config.entity';
import { CapitalRule } from './entities/capital-rule.entity';
import { CipEntry, CipStatus } from './entities/cip-entry.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class CapitalService {
  constructor(
    @InjectRepository(CapitalProjectConfig) private readonly configRepo: Repository<CapitalProjectConfig>,
    @InjectRepository(CapitalRule) private readonly ruleRepo: Repository<CapitalRule>,
    @InjectRepository(CipEntry) private readonly cipRepo: Repository<CipEntry>,
  ) {}

  // ─── Ph-248: capital project type + rules ─────────────────────────

  async setConfig(tenantId: string, data: { projectId: string; isCapital: boolean; cipAccountCode?: string; defaultTreatment?: CostTreatment }): Promise<CapitalProjectConfig> {
    let row = await this.configRepo.findOne({ where: { tenantId, projectId: data.projectId } });
    if (row) {
      row.isCapital = data.isCapital;
      row.cipAccountCode = data.cipAccountCode ?? row.cipAccountCode;
      row.defaultTreatment = data.defaultTreatment ?? row.defaultTreatment;
    } else {
      row = this.configRepo.create({
        tenantId, projectId: data.projectId, isCapital: data.isCapital,
        cipAccountCode: data.cipAccountCode ?? null, defaultTreatment: data.defaultTreatment ?? CostTreatment.EXPENSE,
      } as any) as unknown as CapitalProjectConfig;
    }
    return (this.configRepo.save(row) as unknown) as Promise<CapitalProjectConfig>;
  }

  getConfig(tenantId: string, projectId: string): Promise<CapitalProjectConfig | null> {
    return this.configRepo.findOne({ where: { tenantId, projectId } });
  }

  async setRule(tenantId: string, data: { projectId: string; taskId: string; treatment: CostTreatment }): Promise<CapitalRule> {
    if (!data.taskId) throw new BadRequestException('taskId is required');
    let row = await this.ruleRepo.findOne({ where: { tenantId, projectId: data.projectId, taskId: data.taskId } });
    if (row) row.treatment = data.treatment;
    else row = this.ruleRepo.create({ tenantId, projectId: data.projectId, taskId: data.taskId, treatment: data.treatment } as any) as unknown as CapitalRule;
    return (this.ruleRepo.save(row) as unknown) as Promise<CapitalRule>;
  }

  listRules(tenantId: string, projectId: string): Promise<CapitalRule[]> {
    return this.ruleRepo.find({ where: { tenantId, projectId } });
  }

  // ─── Ph-249: CIP interface ────────────────────────────────────────

  /**
   * Accumulate a project cost; classify it capitalize/expense via the task rule
   * or the project default. Capitalized amounts land in CIP.
   */
  async accumulate(tenantId: string, data: { projectId: string; taskId?: string; period: string; amount: number }): Promise<CipEntry> {
    if (!/^\d{4}-\d{2}$/.test(data.period ?? '')) throw new BadRequestException('period must be YYYY-MM');
    if (data.amount == null || data.amount < 0) throw new BadRequestException('amount must be >= 0');
    const config = await this.configRepo.findOne({ where: { tenantId, projectId: data.projectId } });
    if (!config || !config.isCapital) throw new BadRequestException('Project is not configured as capital');
    let treatment = config.defaultTreatment;
    if (data.taskId) {
      const rule = await this.ruleRepo.findOne({ where: { tenantId, projectId: data.projectId, taskId: data.taskId } });
      if (rule) treatment = rule.treatment;
    }
    const entry = this.cipRepo.create({
      tenantId, projectId: data.projectId, taskId: data.taskId ?? null, period: data.period,
      amount: round2(data.amount), treatment, status: CipStatus.ACCUMULATED, assetRef: null,
    } as any) as unknown as CipEntry;
    return (this.cipRepo.save(entry) as unknown) as Promise<CipEntry>;
  }

  /** CIP summary: capitalized (in CIP / transferred) vs expensed. */
  async cipSummary(tenantId: string, projectId: string): Promise<any> {
    const entries = await this.cipRepo.find({ where: { tenantId, projectId } });
    const capital = entries.filter((e) => e.treatment === CostTreatment.CAPITALIZE);
    const expense = entries.filter((e) => e.treatment === CostTreatment.EXPENSE);
    const inCip = round2(capital.filter((e) => e.status === CipStatus.ACCUMULATED).reduce((s, e) => s + Number(e.amount), 0));
    const transferred = round2(capital.filter((e) => e.status === CipStatus.TRANSFERRED).reduce((s, e) => s + Number(e.amount), 0));
    const expensed = round2(expense.reduce((s, e) => s + Number(e.amount), 0));
    return { projectId, totalCapitalized: round2(inCip + transferred), inCip, transferred, expensed, pendingTransfer: inCip };
  }

  // ─── Ph-250: asset assignment (CIP → in-service) ──────────────────

  /**
   * Transfer accumulated CIP to one or more in-service assets, splitting by
   * percentage (must sum to 100). Marks the CIP entries transferred.
   */
  async transferToInService(tenantId: string, projectId: string, assets: Array<{ assetName: string; splitPct: number }>): Promise<any> {
    if (!assets?.length) throw new BadRequestException('at least one asset is required');
    const totalPct = round2(assets.reduce((s, a) => s + Number(a.splitPct), 0));
    if (Math.abs(totalPct - 100) > 0.01) throw new BadRequestException(`Asset split must sum to 100 (got ${totalPct})`);
    const pending = await this.cipRepo.find({ where: { tenantId, projectId, treatment: CostTreatment.CAPITALIZE, status: CipStatus.ACCUMULATED } });
    const total = round2(pending.reduce((s, e) => s + Number(e.amount), 0));
    if (total <= 0) throw new BadRequestException('No capitalized CIP pending transfer');
    const assetLines = assets.map((a) => ({ assetName: a.assetName, splitPct: Number(a.splitPct), amount: round2((total * Number(a.splitPct)) / 100) }));
    const ref = assetLines.map((a) => a.assetName).join('+');
    for (const e of pending) { e.status = CipStatus.TRANSFERRED; e.assetRef = ref; await this.cipRepo.save(e); }
    return { projectId, totalTransferred: total, entriesTransferred: pending.length, assets: assetLines };
  }

  listEntries(tenantId: string, projectId: string): Promise<CipEntry[]> {
    return this.cipRepo.find({ where: { tenantId, projectId }, order: { period: 'ASC' } });
  }
}
