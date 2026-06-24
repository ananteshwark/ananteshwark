import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ProfitCenter } from './entities/profit-center.entity';
import { CostAllocationCycle, AllocationCycleStatus } from './entities/cost-allocation-cycle.entity';
import { CostAllocationEntry } from './entities/cost-allocation-entry.entity';
import { InternalOrder, InternalOrderStatus } from './entities/internal-order.entity';
import { ActivityType } from './entities/activity-type.entity';
import { ActivityPrice } from './entities/activity-price.entity';
import { OverheadCostingSheet } from './entities/overhead-costing-sheet.entity';
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
    @InjectRepository(InternalOrder)
    private readonly internalOrderRepo: Repository<InternalOrder>,
    @InjectRepository(ActivityType)
    private readonly activityTypeRepo: Repository<ActivityType>,
    @InjectRepository(ActivityPrice)
    private readonly activityPriceRepo: Repository<ActivityPrice>,
    @InjectRepository(OverheadCostingSheet)
    private readonly overheadSheetRepo: Repository<OverheadCostingSheet>,
    private readonly glService: GlService,
    private readonly dataSource: DataSource,
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

  // ─── Internal Orders ──────────────────────────────────────────────────────

  private async nextOrderNumber(tenantId: string): Promise<string> {
    const count = await this.internalOrderRepo.count({ where: { tenantId } });
    return `IO-${String(count + 1).padStart(6, '0')}`;
  }

  async createInternalOrder(tenantId: string, dto: any): Promise<InternalOrder> {
    const orderNumber = dto.orderNumber ?? await this.nextOrderNumber(tenantId);
    const order = this.internalOrderRepo.create({ ...dto, tenantId, orderNumber } as any);
    return (this.internalOrderRepo.save(order) as unknown) as Promise<InternalOrder>;
  }

  async listInternalOrders(tenantId: string): Promise<InternalOrder[]> {
    return this.internalOrderRepo.find({ where: { tenantId }, order: { orderNumber: 'ASC' } });
  }

  async getInternalOrder(tenantId: string, id: string): Promise<InternalOrder> {
    const order = await this.internalOrderRepo.findOne({ where: { id, tenantId } });
    if (!order) throw new NotFoundException(`Internal order ${id} not found`);
    return order;
  }

  async updateInternalOrder(tenantId: string, id: string, dto: any): Promise<InternalOrder> {
    const order = await this.getInternalOrder(tenantId, id);
    Object.assign(order, dto);
    return this.internalOrderRepo.save(order);
  }

  async releaseInternalOrder(tenantId: string, id: string): Promise<InternalOrder> {
    const order = await this.getInternalOrder(tenantId, id);
    if (order.status !== InternalOrderStatus.OPEN) {
      throw new BadRequestException('Only OPEN orders can be released');
    }
    order.status = InternalOrderStatus.RELEASED;
    return this.internalOrderRepo.save(order);
  }

  async getInternalOrderActuals(tenantId: string, id: string): Promise<any> {
    const order = await this.getInternalOrder(tenantId, id);
    const rows = await this.dataSource.query(
      `SELECT l.account_id, SUM(l.debit) AS total_debit, SUM(l.credit) AS total_credit
       FROM fin_journal_lines l
       JOIN fin_journal_entries e ON e.id = l.journal_entry_id
       WHERE e.tenant_id = $1 AND e.status = 'POSTED' AND l.internal_order_id = $2
       GROUP BY l.account_id`,
      [tenantId, id],
    );
    const totalDebit: number = rows.reduce((s: number, r: any) => s + Number(r.total_debit), 0);
    const totalCredit: number = rows.reduce((s: number, r: any) => s + Number(r.total_credit), 0);
    const netCost = totalDebit - totalCredit;
    order.actualCost = netCost;
    await this.internalOrderRepo.save(order);
    return { order, rows, netCost };
  }

  async settleInternalOrder(tenantId: string, id: string, userId?: string): Promise<any> {
    const order = await this.getInternalOrder(tenantId, id);
    if (order.status === InternalOrderStatus.CLOSED) {
      throw new BadRequestException('Order is already closed');
    }
    if (!order.settlementAccountId) {
      throw new BadRequestException('settlementAccountId must be set before settlement');
    }

    const actualsResult = await this.getInternalOrderActuals(tenantId, id);
    const netCost = actualsResult.netCost;

    if (Math.abs(netCost) > 0.001) {
      const lines: PostJournalEntryInput['lines'] = [
        {
          accountId: order.settlementAccountId,
          costCenterId: order.settlementCostCenterId ?? null,
          debit: netCost > 0 ? netCost : 0,
          credit: netCost < 0 ? Math.abs(netCost) : 0,
          description: `Settlement — ${order.orderNumber}`,
        },
        {
          accountId: order.settlementAccountId,
          costCenterId: order.responsibleCostCenterId ?? null,
          debit: netCost < 0 ? Math.abs(netCost) : 0,
          credit: netCost > 0 ? netCost : 0,
          description: `Settlement clearing — ${order.orderNumber}`,
        },
      ];
      await this.glService.postJournalEntry(
        tenantId,
        {
          date: new Date().toISOString().split('T')[0],
          description: `Internal Order Settlement: ${order.name} (${order.orderNumber})`,
          reference: `IO-SETTLE-${id.slice(0, 8)}`,
          source: JournalSource.SYSTEM,
          lines,
        },
        userId ?? null,
      );
    }

    order.status = InternalOrderStatus.TECHNICALLY_CLOSED;
    return this.internalOrderRepo.save(order);
  }

  // ─── CO-PA Report ─────────────────────────────────────────────────────────

  async copaReport(
    tenantId: string,
    fromDate: string,
    toDate: string,
  ): Promise<any[]> {
    const rows = await this.dataSource.query(
      `SELECT
         l.profit_center_id,
         a.type AS account_type,
         SUM(l.debit)  AS total_debit,
         SUM(l.credit) AS total_credit
       FROM fin_journal_lines l
       JOIN fin_journal_entries e ON e.id = l.journal_entry_id
       JOIN fin_accounts a ON a.id = l.account_id
       WHERE e.tenant_id = $1
         AND e.status = 'POSTED'
         AND e.date BETWEEN $2 AND $3
       GROUP BY l.profit_center_id, a.type
       ORDER BY l.profit_center_id NULLS LAST`,
      [tenantId, fromDate, toDate],
    );

    const profitCenters = await this.profitCenterRepo.find({ where: { tenantId } });
    const pcMap = new Map(profitCenters.map(pc => [pc.id, pc]));

    const grouped = new Map<string, any>();
    for (const row of rows) {
      const key = row.profit_center_id ?? 'unassigned';
      if (!grouped.has(key)) {
        grouped.set(key, {
          profitCenterId: row.profit_center_id,
          profitCenterName: pcMap.get(row.profit_center_id)?.name ?? '(Unassigned)',
          revenue: 0,
          expenses: 0,
          grossProfit: 0,
        });
      }
      const entry = grouped.get(key);
      const net = Number(row.total_credit) - Number(row.total_debit);
      if (['INCOME', 'REVENUE'].includes(row.account_type)) {
        entry.revenue += net;
      } else if (['EXPENSE', 'COGS'].includes(row.account_type)) {
        entry.expenses += Math.abs(net);
      }
      entry.grossProfit = entry.revenue - entry.expenses;
    }

    return Array.from(grouped.values());
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

  // ─── Phase 79: Activity Types ─────────────────────────────────────────────

  async listActivityTypes(tenantId: string): Promise<ActivityType[]> {
    return this.activityTypeRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async createActivityType(tenantId: string, dto: any): Promise<ActivityType> {
    const at = this.activityTypeRepo.create({ ...dto, tenantId } as any);
    return (this.activityTypeRepo.save(at) as unknown) as Promise<ActivityType>;
  }

  async updateActivityType(tenantId: string, id: string, dto: any): Promise<ActivityType> {
    const at = await this.activityTypeRepo.findOne({ where: { id, tenantId } });
    if (!at) throw new NotFoundException(`Activity type ${id} not found`);
    Object.assign(at, dto);
    return this.activityTypeRepo.save(at);
  }

  async findActivityTypeById(tenantId: string, id: string): Promise<ActivityType | null> {
    return this.activityTypeRepo.findOne({ where: { id, tenantId } });
  }

  // ─── Phase 79: Activity Prices ────────────────────────────────────────────

  async setActivityPrice(tenantId: string, dto: {
    activityTypeId: string;
    costCenterId: string;
    fiscalYear: number;
    plannedCost: number;
    plannedQty: number;
  }): Promise<ActivityPrice> {
    const { activityTypeId, costCenterId, fiscalYear, plannedCost, plannedQty } = dto;
    const plannedRate = plannedQty > 0 ? plannedCost / plannedQty : 0;

    let price = await this.activityPriceRepo.findOne({
      where: { tenantId, activityTypeId, costCenterId, fiscalYear },
    });
    if (price) {
      price.plannedCost = plannedCost;
      price.plannedQty = plannedQty;
      price.plannedRate = Math.round(plannedRate * 1000000) / 1000000;
    } else {
      price = (this.activityPriceRepo.create({
        tenantId, activityTypeId, costCenterId, fiscalYear,
        plannedCost, plannedQty,
        plannedRate: Math.round(plannedRate * 1000000) / 1000000,
        actualCost: 0, actualQty: 0, actualRate: 0,
      } as any) as unknown) as ActivityPrice;
    }
    return (this.activityPriceRepo.save(price) as unknown) as Promise<ActivityPrice>;
  }

  async listActivityPrices(tenantId: string, fiscalYear?: number): Promise<ActivityPrice[]> {
    const where: any = { tenantId };
    if (fiscalYear) where.fiscalYear = fiscalYear;
    return this.activityPriceRepo.find({ where, order: { fiscalYear: 'DESC' } });
  }

  /**
   * Confirm activity consumption: debit production order WIP account,
   * credit cost center activity clearing account, update ActivityPrice actuals.
   */
  async confirmActivity(tenantId: string, dto: {
    activityTypeId: string;
    costCenterId: string;
    productionOrderId: string;
    qty: number;
    confirmationDate: string;
    userId?: string;
  }): Promise<{ journalEntryId: string; cost: number }> {
    const { activityTypeId, costCenterId, productionOrderId, qty, confirmationDate, userId } = dto;
    const at = await this.activityTypeRepo.findOne({ where: { id: activityTypeId, tenantId } });
    if (!at) throw new NotFoundException(`Activity type ${activityTypeId} not found`);
    if (!at.wipAccountId || !at.creditAccountId) {
      throw new BadRequestException('Activity type must have wipAccountId and creditAccountId configured');
    }

    // Determine rate: actual rate if set, else planned rate
    const fiscalYear = new Date(confirmationDate).getFullYear();
    const price = await this.activityPriceRepo.findOne({
      where: { tenantId, activityTypeId, costCenterId, fiscalYear },
    });
    const rate = price && Number(price.actualRate) > 0
      ? Number(price.actualRate)
      : (price ? Number(price.plannedRate) : 0);
    const cost = Math.round(qty * rate * 100) / 100;

    // Post GL: WIP debit, cost center credit
    const je = await this.glService.postJournalEntry(
      tenantId,
      {
        date: confirmationDate,
        description: `Activity: ${at.name} — Order ${productionOrderId.slice(0, 8)}`,
        reference: `ACT-${activityTypeId.slice(0, 8)}-${productionOrderId.slice(0, 8)}`,
        source: JournalSource.SYSTEM,
        lines: [
          { accountId: at.wipAccountId, costCenterId, debit: cost, credit: 0, description: `Activity ${at.code}` },
          { accountId: at.creditAccountId, costCenterId, debit: 0, credit: cost, description: `Activity ${at.code} output` },
        ],
      } as unknown as PostJournalEntryInput,
      userId ?? null,
    );

    // Update ActivityPrice actuals
    if (price) {
      price.actualQty = Number(price.actualQty) + qty;
      price.actualCost = Number(price.actualCost) + cost;
      price.actualRate = price.actualQty > 0
        ? Math.round((price.actualCost / price.actualQty) * 1000000) / 1000000
        : 0;
      await this.activityPriceRepo.save(price);
    }

    return { journalEntryId: je.id, cost };
  }

  // ─── Phase 79: Overhead Costing Sheets ───────────────────────────────────

  async listOverheadCostingSheets(tenantId: string): Promise<OverheadCostingSheet[]> {
    return this.overheadSheetRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async createOverheadCostingSheet(tenantId: string, dto: any): Promise<OverheadCostingSheet> {
    const sheet = this.overheadSheetRepo.create({ ...dto, tenantId } as any);
    return (this.overheadSheetRepo.save(sheet) as unknown) as Promise<OverheadCostingSheet>;
  }

  async updateOverheadCostingSheet(tenantId: string, id: string, dto: any): Promise<OverheadCostingSheet> {
    const sheet = await this.overheadSheetRepo.findOne({ where: { id, tenantId } });
    if (!sheet) throw new NotFoundException(`Overhead costing sheet ${id} not found`);
    Object.assign(sheet, dto);
    return this.overheadSheetRepo.save(sheet);
  }

  /**
   * Apply an overhead costing sheet to a production order.
   * Computes overhead per line (base cost × rate), posts GL entries,
   * and returns the total overhead amount applied.
   */
  async applyOverheadToOrder(
    tenantId: string,
    sheetId: string,
    costInfo: { materialCost: number; laborCost: number; productionOrderId: string },
    userId?: string,
  ): Promise<{ totalOverhead: number; lineResults: Array<{ name: string; overhead: number }> }> {
    const sheet = await this.overheadSheetRepo.findOne({ where: { id: sheetId, tenantId } });
    if (!sheet) throw new NotFoundException(`Overhead costing sheet ${sheetId} not found`);
    if (!sheet.isActive) throw new BadRequestException('Overhead costing sheet is inactive');

    const { materialCost, laborCost, productionOrderId } = costInfo;
    const totalBase = materialCost + laborCost;
    let totalOverhead = 0;
    const lineResults: Array<{ name: string; overhead: number }> = [];
    const date = new Date().toISOString().split('T')[0];

    for (const line of sheet.lines) {
      const base =
        line.base === 'MATERIAL_COST' ? materialCost
        : line.base === 'LABOR_COST' ? laborCost
        : totalBase;
      const overhead = Math.round(base * (line.rate / 100) * 100) / 100;
      if (overhead <= 0) continue;

      await this.glService.postJournalEntry(
        tenantId,
        {
          date,
          description: `Overhead: ${line.name} — Order ${productionOrderId.slice(0, 8)}`,
          reference: `OH-${sheetId.slice(0, 6)}-${productionOrderId.slice(0, 6)}`,
          source: JournalSource.SYSTEM,
          lines: [
            { accountId: line.debitAccountId, debit: overhead, credit: 0, description: `OH ${line.name}` },
            { accountId: line.creditAccountId, debit: 0, credit: overhead, description: `OH ${line.name} offset` },
          ],
        } as unknown as PostJournalEntryInput,
        userId ?? null,
      );

      totalOverhead += overhead;
      lineResults.push({ name: line.name, overhead });
    }

    return { totalOverhead: Math.round(totalOverhead * 100) / 100, lineResults };
  }
}
