import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PayrollCostingRule, SplitType } from './entities/payroll-costing-rule.entity';
import { PayrollCostDistribution } from './entities/payroll-cost-distribution.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CostSplit {
  costCenterId: string | null;
  projectId: string | null;
  glAccountId: string | null;
  amount: number;
  ruleName: string;
}

export interface ElementCost {
  employeeId?: string;
  componentCode: string;
  amount: number;
}

@Injectable()
export class PayrollCostingService {
  constructor(
    @InjectRepository(PayrollCostingRule) private readonly ruleRepo: Repository<PayrollCostingRule>,
    @InjectRepository(PayrollCostDistribution) private readonly distRepo: Repository<PayrollCostDistribution>,
  ) {}

  // ─── Ph-174: costing rules ────────────────────────────────────────

  listRules(tenantId: string, componentCode?: string): Promise<PayrollCostingRule[]> {
    const where: any = { tenantId };
    if (componentCode) where.componentCode = componentCode;
    return this.ruleRepo.find({ where, order: { priority: 'ASC' } });
  }

  async createRule(tenantId: string, data: Partial<PayrollCostingRule>): Promise<PayrollCostingRule> {
    if (!data.name) throw new BadRequestException('name is required');
    if (data.splitValue == null || data.splitValue < 0) throw new BadRequestException('splitValue must be >= 0');
    const rule = this.ruleRepo.create({
      tenantId, splitType: SplitType.PERCENTAGE, priority: 50, isActive: true, ...data,
    } as any) as unknown as PayrollCostingRule;
    return (this.ruleRepo.save(rule) as unknown) as Promise<PayrollCostingRule>;
  }

  async deleteRule(tenantId: string, id: string): Promise<void> {
    const rule = await this.ruleRepo.findOne({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`Rule ${id} not found`);
    await this.ruleRepo.remove(rule);
  }

  // ─── Ph-175: cost distribution ────────────────────────────────────

  /**
   * Split one element's cost across the matching rules. ABSOLUTE rules consume a
   * fixed amount, PERCENTAGE rules a proportion; any unallocated remainder goes
   * to a default split (no cost center).
   */
  splitElementCost(amount: number, rules: PayrollCostingRule[]): CostSplit[] {
    const splits: CostSplit[] = [];
    let remaining = round2(amount);
    for (const r of rules) {
      if (remaining <= 0) break;
      let portion = 0;
      if (r.splitType === SplitType.ABSOLUTE) {
        portion = Math.min(remaining, round2(Number(r.splitValue)));
      } else {
        portion = round2((amount * Number(r.splitValue)) / 100);
        portion = Math.min(portion, remaining);
      }
      if (portion <= 0) continue;
      splits.push({ costCenterId: r.costCenterId, projectId: r.projectId, glAccountId: r.glAccountId, amount: portion, ruleName: r.name });
      remaining = round2(remaining - portion);
    }
    if (remaining > 0) {
      splits.push({ costCenterId: null, projectId: null, glAccountId: null, amount: remaining, ruleName: 'Default (unallocated)' });
    }
    return splits;
  }

  /**
   * Distribute a payroll run's element costs and persist distribution lines.
   */
  async distribute(tenantId: string, payrollRunId: string, lines: ElementCost[]): Promise<{ created: number; total: number }> {
    if (!lines?.length) throw new BadRequestException('No element costs supplied');
    // clear any prior distribution for this run (re-runnable)
    await this.distRepo.delete({ tenantId, payrollRunId });

    const allRules = await this.ruleRepo.find({ where: { tenantId, isActive: true }, order: { priority: 'ASC' } });
    let created = 0;
    let total = 0;
    for (const line of lines) {
      const matched = allRules.filter((r) => !r.componentCode || r.componentCode === line.componentCode);
      const splits = this.splitElementCost(line.amount, matched);
      for (const s of splits) {
        await this.distRepo.save(this.distRepo.create({
          tenantId, payrollRunId, employeeId: line.employeeId ?? null, componentCode: line.componentCode,
          costCenterId: s.costCenterId, projectId: s.projectId, glAccountId: s.glAccountId, amount: s.amount,
        } as any));
        created++;
        total = round2(total + s.amount);
      }
    }
    return { created, total };
  }

  async listDistribution(tenantId: string, payrollRunId: string): Promise<PayrollCostDistribution[]> {
    return this.distRepo.find({ where: { tenantId, payrollRunId }, order: { createdAt: 'ASC' } });
  }

  // ─── Ph-176: labor distribution reporting ─────────────────────────

  /** Aggregate distributed payroll cost by a chosen dimension. */
  async laborReport(tenantId: string, params: { payrollRunId?: string; groupBy?: 'costCenter' | 'project' | 'account' | 'component' } = {}): Promise<any> {
    const where: any = { tenantId };
    if (params.payrollRunId) where.payrollRunId = params.payrollRunId;
    const rows = await this.distRepo.find({ where });
    const groupBy = params.groupBy ?? 'costCenter';
    const keyOf = (r: PayrollCostDistribution) =>
      groupBy === 'project' ? (r.projectId ?? 'UNASSIGNED')
      : groupBy === 'account' ? (r.glAccountId ?? 'UNASSIGNED')
      : groupBy === 'component' ? r.componentCode
      : (r.costCenterId ?? 'UNASSIGNED');

    const map = new Map<string, number>();
    let total = 0;
    for (const r of rows) {
      const k = keyOf(r);
      map.set(k, round2((map.get(k) ?? 0) + Number(r.amount)));
      total = round2(total + Number(r.amount));
    }
    return {
      groupBy,
      total,
      lines: [...map.entries()].map(([key, amount]) => ({ key, amount, pct: total > 0 ? round2((amount / total) * 100) : 0 }))
        .sort((a, b) => b.amount - a.amount),
    };
  }
}
