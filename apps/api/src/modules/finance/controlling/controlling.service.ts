import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfitCenter } from './entities/profit-center.entity';
import { CostAllocationCycle, AllocationCycleStatus } from './entities/cost-allocation-cycle.entity';
import { CostAllocationEntry } from './entities/cost-allocation-entry.entity';
import { GlService, PostJournalEntryInput } from '../gl/gl.service';
import { CostCenter } from '../gl/entities/cost-center.entity';
import { JournalSource } from '../gl/entities/journal-entry.entity';

@Injectable()
export class ControllingService {
  constructor(
    @InjectRepository(ProfitCenter)
    private readonly profitCenterRepo: Repository<ProfitCenter>,
    @InjectRepository(CostAllocationCycle)
    private readonly cycleRepo: Repository<CostAllocationCycle>,
    @InjectRepository(CostAllocationEntry)
    private readonly entryRepo: Repository<CostAllocationEntry>,
    @InjectRepository(CostCenter)
    private readonly costCenterRepo: Repository<CostCenter>,
    private readonly glService: GlService,
  ) {}

  // ─── Profit Centers ────────────────────────────────────────────────────────

  async listProfitCenters(tenantId: string): Promise<ProfitCenter[]> {
    return this.profitCenterRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async createProfitCenter(tenantId: string, dto: Partial<ProfitCenter>): Promise<ProfitCenter> {
    const pc = this.profitCenterRepo.create({ ...dto, tenantId });
    return this.profitCenterRepo.save(pc);
  }

  async updateProfitCenter(
    tenantId: string,
    id: string,
    dto: Partial<ProfitCenter>,
  ): Promise<ProfitCenter> {
    const pc = await this.profitCenterRepo.findOne({ where: { id, tenantId } });
    if (!pc) throw new NotFoundException('Profit center not found');
    Object.assign(pc, dto);
    return this.profitCenterRepo.save(pc);
  }

  // ─── Allocation Cycles ─────────────────────────────────────────────────────

  async listAllocationCycles(tenantId: string): Promise<CostAllocationCycle[]> {
    return this.cycleRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async createAllocationCycle(
    tenantId: string,
    dto: Partial<CostAllocationCycle>,
  ): Promise<CostAllocationCycle> {
    const cycle = this.cycleRepo.create({ ...dto, tenantId });
    return this.cycleRepo.save(cycle);
  }

  async runAllocationCycle(
    tenantId: string,
    cycleId: string,
    period: string,
  ): Promise<{ entriesCreated: number; journalEntryId: string | null }> {
    const cycle = await this.cycleRepo.findOne({ where: { id: cycleId, tenantId } });
    if (!cycle) throw new NotFoundException('Allocation cycle not found');
    if (cycle.status === AllocationCycleStatus.POSTED) {
      throw new BadRequestException('Cycle already posted for this period');
    }

    const periodStart = `${period}-01`;
    const periodEnd = `${period}-28`; // safe last day

    const entriesToSave: Partial<CostAllocationEntry>[] = [];
    const journalLines: PostJournalEntryInput['lines'] = [];

    for (const rule of cycle.rules) {
      let totalAmount = 0;

      if (rule.senderType === 'COST_CENTER') {
        totalAmount = await this.glService.sumLinesByCostCenter(
          tenantId,
          rule.senderId,
          periodStart,
          periodEnd,
        );
      }
      // FIXED method: use the first split value as total
      if (rule.method === 'FIXED') {
        totalAmount = rule.split.reduce((s, v) => s + v, 0);
      }

      for (let i = 0; i < rule.receiverIds.length; i++) {
        const receiverId = rule.receiverIds[i];
        let amount = 0;

        if (rule.method === 'PERCENTAGE') {
          amount = (totalAmount * (rule.split[i] ?? 0)) / 100;
        } else if (rule.method === 'FIXED') {
          amount = rule.split[i] ?? 0;
        } else {
          // SKF — equal split
          amount = rule.receiverIds.length > 0 ? totalAmount / rule.receiverIds.length : 0;
        }

        if (amount === 0) continue;

        entriesToSave.push({
          tenantId,
          cycleId,
          period,
          fromCostCenterId: rule.senderId,
          toCostCenterId: receiverId,
          glAccountId: rule.senderId,
          amount,
          description: `${cycle.name} — ${period}`,
        });

        // DR receiver cost center, CR sender
        journalLines.push({
          accountId: rule.senderId,
          costCenterId: receiverId,
          debit: amount,
          credit: 0,
          description: `Allocation to CC ${receiverId}`,
        });
        journalLines.push({
          accountId: rule.senderId,
          costCenterId: rule.senderId,
          debit: 0,
          credit: amount,
          description: `Allocation from CC ${rule.senderId}`,
        });
      }
    }

    if (entriesToSave.length > 0) {
      await this.entryRepo.save(entriesToSave as CostAllocationEntry[]);
    }

    let journalEntryId: string | null = null;
    if (journalLines.length > 0) {
      try {
        const je = await this.glService.postJournalEntry(
          tenantId,
          {
            date: periodStart,
            description: `Cost Allocation: ${cycle.name} — ${period}`,
            reference: `ALLOC-${cycleId.slice(0, 8)}`,
            source: JournalSource.SYSTEM,
            lines: journalLines,
          },
          null,
        );
        journalEntryId = je.id;
      } catch {
        // GL posting failure is non-fatal if no valid accounts are configured
      }
    }

    cycle.status = AllocationCycleStatus.POSTED;
    await this.cycleRepo.save(cycle);

    return { entriesCreated: entriesToSave.length, journalEntryId };
  }

  // ─── Cost Center Reporting ─────────────────────────────────────────────────

  async getCostCenterActuals(
    tenantId: string,
    costCenterId: string,
    fromDate: string,
    toDate: string,
  ): Promise<number> {
    return this.glService.sumLinesByCostCenter(tenantId, costCenterId, fromDate, toDate);
  }

  async costCenterReport(tenantId: string, period: string): Promise<any[]> {
    const costCenters = await this.costCenterRepo.find({ where: { tenantId } });
    const periodStart = `${period}-01`;
    const periodEnd = `${period}-31`;

    return Promise.all(
      costCenters.map(async (cc) => {
        const actual = await this.glService.sumLinesByCostCenter(
          tenantId,
          cc.id,
          periodStart,
          periodEnd,
        );
        const monthlyBudget = cc.budgetAmount ? cc.budgetAmount / 12 : 0;
        const variance = monthlyBudget - actual;
        const variancePct =
          monthlyBudget !== 0 ? Math.round((variance / monthlyBudget) * 10000) / 100 : 0;

        return {
          id: cc.id,
          code: cc.code,
          name: cc.name,
          hierarchyNode: cc.hierarchyNode,
          budget: monthlyBudget,
          actual,
          variance,
          variancePct,
        };
      }),
    );
  }

  // ─── Profit Center P&L ─────────────────────────────────────────────────────

  async profitCenterPL(
    tenantId: string,
    profitCenterId: string,
    fromDate: string,
    toDate: string,
  ): Promise<any> {
    const pc = await this.profitCenterRepo.findOne({ where: { id: profitCenterId, tenantId } });
    if (!pc) throw new NotFoundException('Profit center not found');

    const { revenues, expenses } = await this.glService.sumLinesByProfitCenter(
      tenantId,
      profitCenterId,
      fromDate,
      toDate,
    );

    return {
      profitCenter: pc,
      fromDate,
      toDate,
      revenues,
      expenses,
      netIncome: revenues - expenses,
    };
  }
}
