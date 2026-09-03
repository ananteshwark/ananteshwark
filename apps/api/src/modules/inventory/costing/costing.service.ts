import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StandardCost } from './entities/standard-cost.entity';
import { CostVariance, VarianceType } from './entities/cost-variance.entity';
import { CostUpdate, CostUpdateStatus } from './entities/cost-update.entity';
import { StockBalance } from '../entities/stock-balance.entity';
import { Item } from '../entities/item.entity';
import { Account } from '../../finance/gl/entities/account.entity';
import { GlService } from '../../finance/gl/gl.service';
import { JournalSource } from '../../finance/gl/entities/journal-entry.entity';
import { DEFAULT_ACCOUNT_CODES } from '../../finance/finance.constants';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

export interface WacResult {
  newQty: number;
  newAvgCost: number;
  newTotalValue: number;
}

@Injectable()
export class CostingService {
  constructor(
    @InjectRepository(StandardCost) private readonly stdRepo: Repository<StandardCost>,
    @InjectRepository(CostVariance) private readonly varRepo: Repository<CostVariance>,
    @InjectRepository(CostUpdate) private readonly updateRepo: Repository<CostUpdate>,
    @InjectRepository(StockBalance) private readonly balanceRepo: Repository<StockBalance>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    private readonly glService: GlService,
  ) {}

  // ─── Ph-137: Weighted Average Cost ────────────────────────────────

  /**
   * Pure WAC roll: new average = (existing value + receipt value) / total qty.
   * Issues (negative receiptQty) keep the average unchanged.
   */
  computeMovingAverage(currentQty: number, currentAvg: number, receiptQty: number, receiptUnitCost: number): WacResult {
    const cur = Number(currentQty) || 0;
    const curAvg = Number(currentAvg) || 0;
    if (receiptQty <= 0) {
      const newQty = round4(cur + receiptQty);
      return { newQty, newAvgCost: round4(curAvg), newTotalValue: round2(newQty * curAvg) };
    }
    const existingValue = cur * curAvg;
    const receiptValue = receiptQty * receiptUnitCost;
    const newQty = round4(cur + receiptQty);
    const newAvg = newQty > 0 ? round4((existingValue + receiptValue) / newQty) : 0;
    return { newQty, newAvgCost: newAvg, newTotalValue: round2(newQty * newAvg) };
  }

  /** Apply a receipt to the stock balance using moving average. */
  async applyReceiptToBalance(tenantId: string, itemId: string, warehouseId: string, receiptQty: number, receiptUnitCost: number): Promise<StockBalance> {
    let balance = await this.balanceRepo.findOne({ where: { tenantId, itemId, warehouseId } });
    if (!balance) {
      balance = this.balanceRepo.create({ tenantId, itemId, warehouseId, qtyOnHand: 0, avgCost: 0, totalCost: 0 } as any) as unknown as StockBalance;
    }
    const wac = this.computeMovingAverage(Number(balance.qtyOnHand), Number(balance.avgCost), receiptQty, receiptUnitCost);
    balance.qtyOnHand = wac.newQty;
    balance.avgCost = wac.newAvgCost;
    balance.totalCost = round4(wac.newQty * wac.newAvgCost);
    balance.unitCost = wac.newAvgCost;
    balance.totalValue = wac.newTotalValue;
    return (this.balanceRepo.save(balance) as unknown) as Promise<StockBalance>;
  }

  // ─── Ph-138: Standard cost ────────────────────────────────────────

  async listStandardCosts(tenantId: string, itemId?: string): Promise<StandardCost[]> {
    const where: any = { tenantId };
    if (itemId) where.itemId = itemId;
    return this.stdRepo.find({ where, order: { effectiveFrom: 'DESC' } });
  }

  async setStandardCost(tenantId: string, data: {
    itemId: string; organizationId?: string; standardCost: number; effectiveFrom: string; notes?: string;
  }): Promise<StandardCost> {
    if (!data.itemId) throw new BadRequestException('itemId is required');
    if (data.standardCost == null || data.standardCost < 0) throw new BadRequestException('standardCost must be >= 0');
    const rec = this.stdRepo.create({
      tenantId, itemId: data.itemId, organizationId: data.organizationId ?? null,
      standardCost: data.standardCost, effectiveFrom: data.effectiveFrom, notes: data.notes ?? null,
    } as any) as unknown as StandardCost;
    return (this.stdRepo.save(rec) as unknown) as Promise<StandardCost>;
  }

  /** Active standard cost = latest effective record on/before the date. */
  async getActiveStandard(tenantId: string, itemId: string, asOf: string, organizationId?: string): Promise<number> {
    const records = await this.stdRepo.find({ where: { tenantId, itemId, organizationId: organizationId ?? null } });
    const effective = records
      .filter((r) => r.effectiveFrom <= asOf)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
    if (effective.length > 0) return Number(effective[0].standardCost);
    const item = await this.itemRepo.findOne({ where: { id: itemId, tenantId } });
    return item ? Number(item.standardCost) : 0;
  }

  /**
   * Record a purchase price variance at PO receipt:
   *   PPV = (actualUnitCost − standardCost) × qty
   */
  async recordPpv(tenantId: string, data: {
    itemId: string; quantity: number; actualUnitCost: number; date: string;
    organizationId?: string; sourceId?: string; vendorId?: string;
  }): Promise<CostVariance> {
    const standard = await this.getActiveStandard(tenantId, data.itemId, data.date, data.organizationId);
    const variance = round2((data.actualUnitCost - standard) * data.quantity);
    const rec = this.varRepo.create({
      tenantId,
      varianceType: VarianceType.PPV,
      itemId: data.itemId,
      organizationId: data.organizationId ?? null,
      sourceType: 'PO_RECEIPT',
      sourceId: data.sourceId ?? null,
      standardCost: round4(standard),
      actualCost: round4(data.actualUnitCost),
      quantity: round4(data.quantity),
      varianceAmount: variance,
      varianceDate: data.date,
      vendorId: data.vendorId ?? null,
    } as any) as unknown as CostVariance;
    return (this.varRepo.save(rec) as unknown) as Promise<CostVariance>;
  }

  /** Generic variance recorder (MUV/LRV/SUV from production). */
  async recordVariance(tenantId: string, data: {
    varianceType: VarianceType; itemId: string; quantity: number; standardCost: number; actualCost: number;
    date: string; organizationId?: string; sourceId?: string; workCenterId?: string;
  }): Promise<CostVariance> {
    const variance = round2((data.actualCost - data.standardCost) * data.quantity);
    const rec = this.varRepo.create({
      tenantId, varianceType: data.varianceType, itemId: data.itemId, organizationId: data.organizationId ?? null,
      sourceType: 'PRODUCTION', sourceId: data.sourceId ?? null,
      standardCost: round4(data.standardCost), actualCost: round4(data.actualCost),
      quantity: round4(data.quantity), varianceAmount: variance, varianceDate: data.date,
      workCenterId: data.workCenterId ?? null,
    } as any) as unknown as CostVariance;
    return (this.varRepo.save(rec) as unknown) as Promise<CostVariance>;
  }

  // ─── Ph-139: Cost update / revaluation ────────────────────────────

  private async resolveAccount(tenantId: string, code: string): Promise<Account | null> {
    return this.accountRepo.findOne({ where: { tenantId, code } });
  }

  /**
   * Period-end standard cost update. Revalues on-hand inventory and posts a JE:
   *   increase → Dr Inventory, Cr Revaluation (gain)
   *   decrease → Dr Revaluation (loss), Cr Inventory
   */
  async costUpdate(tenantId: string, data: {
    itemId: string; newStandard: number; effectiveDate: string; organizationId?: string;
  }, userId: string): Promise<CostUpdate> {
    if (data.newStandard == null || data.newStandard < 0) throw new BadRequestException('newStandard must be >= 0');
    const oldStandard = await this.getActiveStandard(tenantId, data.itemId, data.effectiveDate, data.organizationId);

    const balances = await this.balanceRepo.find({ where: { tenantId, itemId: data.itemId } });
    const qtyOnHand = round4(balances.reduce((s, b) => s + Number(b.qtyOnHand), 0));
    const revaluation = round2((data.newStandard - oldStandard) * qtyOnHand);

    const update = (await this.updateRepo.save(
      this.updateRepo.create({
        tenantId, itemId: data.itemId, organizationId: data.organizationId ?? null,
        oldStandard: round4(oldStandard), newStandard: round4(data.newStandard),
        qtyOnHand, revaluationAmount: revaluation,
        status: CostUpdateStatus.DRAFT, effectiveDate: data.effectiveDate,
      } as any),
    )) as unknown as CostUpdate;

    // post revaluation JE when material
    if (revaluation !== 0) {
      const invAccount = await this.resolveAccount(tenantId, DEFAULT_ACCOUNT_CODES.INVENTORY);
      const revalAccount = await this.resolveAccount(tenantId, DEFAULT_ACCOUNT_CODES.INVENTORY_REVALUATION);
      if (invAccount && revalAccount) {
        const amt = Math.abs(revaluation);
        const lines = revaluation > 0
          ? [
              { accountId: invAccount.id, debit: amt, credit: 0, description: 'Inventory revaluation increase' },
              { accountId: revalAccount.id, debit: 0, credit: amt, description: 'Revaluation gain' },
            ]
          : [
              { accountId: revalAccount.id, debit: amt, credit: 0, description: 'Revaluation loss' },
              { accountId: invAccount.id, debit: 0, credit: amt, description: 'Inventory revaluation decrease' },
            ];
        const je = await this.glService.postJournalEntry(
          tenantId,
          { date: data.effectiveDate, description: `Cost update revaluation item ${data.itemId}`, source: JournalSource.SYSTEM, currency: 'USD', lines },
          userId,
        );
        update.journalEntryId = je.id;
      }
    }

    // record the new standard + a revaluation variance row, mark posted
    await this.setStandardCost(tenantId, { itemId: data.itemId, organizationId: data.organizationId, standardCost: data.newStandard, effectiveFrom: data.effectiveDate });
    await this.varRepo.save(this.varRepo.create({
      tenantId, varianceType: VarianceType.REVALUATION, itemId: data.itemId, organizationId: data.organizationId ?? null,
      sourceType: 'COST_UPDATE', sourceId: update.id, standardCost: round4(data.newStandard), actualCost: round4(oldStandard),
      quantity: qtyOnHand, varianceAmount: revaluation, varianceDate: data.effectiveDate,
    } as any));
    update.status = CostUpdateStatus.POSTED;
    return (this.updateRepo.save(update) as unknown) as Promise<CostUpdate>;
  }

  async listCostUpdates(tenantId: string, itemId?: string): Promise<CostUpdate[]> {
    const where: any = { tenantId };
    if (itemId) where.itemId = itemId;
    return this.updateRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  // ─── Ph-140: Variance dashboard ───────────────────────────────────

  async varianceDashboard(tenantId: string, params: { from?: string; to?: string } = {}): Promise<any> {
    const qb = this.varRepo.createQueryBuilder('v').where('v.tenant_id = :tenantId', { tenantId });
    if (params.from) qb.andWhere('v.variance_date >= :from', { from: params.from });
    if (params.to) qb.andWhere('v.variance_date <= :to', { to: params.to });
    const variances = await qb.getMany();

    const byType = new Map<string, number>();
    const byItem = new Map<string, number>();
    const byVendor = new Map<string, number>();
    for (const v of variances) {
      byType.set(v.varianceType, round2((byType.get(v.varianceType) ?? 0) + Number(v.varianceAmount)));
      byItem.set(v.itemId, round2((byItem.get(v.itemId) ?? 0) + Number(v.varianceAmount)));
      if (v.vendorId) byVendor.set(v.vendorId, round2((byVendor.get(v.vendorId) ?? 0) + Number(v.varianceAmount)));
    }
    const total = round2(variances.reduce((s, v) => s + Number(v.varianceAmount), 0));
    const toRows = (m: Map<string, number>, key: string) => [...m.entries()].map(([k, amount]) => ({ [key]: k, amount })).sort((a: any, b: any) => Math.abs(b.amount) - Math.abs(a.amount));
    return {
      totalVariance: total,
      count: variances.length,
      byType: toRows(byType, 'varianceType'),
      byItem: toRows(byItem, 'itemId').slice(0, 20),
      byVendor: toRows(byVendor, 'vendorId').slice(0, 20),
    };
  }

  async listVariances(tenantId: string, params: { varianceType?: VarianceType; itemId?: string } = {}): Promise<CostVariance[]> {
    const where: any = { tenantId };
    if (params.varianceType) where.varianceType = params.varianceType;
    if (params.itemId) where.itemId = params.itemId;
    return this.varRepo.find({ where, order: { varianceDate: 'DESC' }, take: 200 });
  }
}
