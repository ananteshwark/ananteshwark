import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockBalance } from '../inventory/entities/stock-balance.entity';

const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

export type ATPStatus = 'AVAILABLE' | 'INSUFFICIENT';

export interface ATPCheckResult {
  status: ATPStatus;
  availableQty: number;
  committedQty: number;
  onHandQty: number;
  requestedQty: number;
  shortfall?: number;
}

export interface ATPDashboardRow {
  itemId: string;
  warehouseId: string;
  onHandQty: number;
  committedQty: number;
  availableQty: number;
}

@Injectable()
export class AtpService {
  constructor(
    @InjectRepository(StockBalance)
    private readonly balanceRepo: Repository<StockBalance>,
  ) {}

  async checkATP(
    tenantId: string,
    itemId: string,
    warehouseId: string | null | undefined,
    requestedQty: number,
    _requiredDate?: string,
  ): Promise<ATPCheckResult> {
    let onHand = 0;
    let committed = 0;

    if (warehouseId) {
      const bal = await this.balanceRepo.findOne({ where: { tenantId, itemId, warehouseId } });
      onHand = Number(bal?.qtyOnHand) || 0;
      committed = Number(bal?.committedQty) || 0;
    } else {
      // Aggregate across all warehouses for the item.
      const row = await this.balanceRepo
        .createQueryBuilder('b')
        .select('COALESCE(SUM(b.qtyOnHand), 0)', 'onHand')
        .addSelect('COALESCE(SUM(b.committedQty), 0)', 'committed')
        .where('b.tenantId = :tenantId', { tenantId })
        .andWhere('b.itemId = :itemId', { itemId })
        .getRawOne();
      onHand = Number(row?.onHand) || 0;
      committed = Number(row?.committed) || 0;
    }

    const availableQty = round4(onHand - committed);
    const requested = requestedQty || 0;
    const status: ATPStatus = availableQty >= requested ? 'AVAILABLE' : 'INSUFFICIENT';
    const result: ATPCheckResult = {
      status,
      availableQty,
      committedQty: round4(committed),
      onHandQty: round4(onHand),
      requestedQty: round4(requested),
    };
    if (status === 'INSUFFICIENT') result.shortfall = round4(requested - availableQty);
    return result;
  }

  /** Increase committed qty for the item/warehouse (creating a balance row if absent). */
  async commitStock(tenantId: string, itemId: string, warehouseId: string, qty: number): Promise<StockBalance> {
    let bal = await this.balanceRepo.findOne({ where: { tenantId, itemId, warehouseId } });
    if (!bal) {
      bal = this.balanceRepo.create({ tenantId, itemId, warehouseId, qtyOnHand: 0, committedQty: 0 });
    }
    bal.committedQty = round4((Number(bal.committedQty) || 0) + (qty || 0));
    return this.balanceRepo.save(bal);
  }

  /** Decrease committed qty (never below zero). */
  async releaseCommitment(tenantId: string, itemId: string, warehouseId: string, qty: number): Promise<StockBalance | null> {
    const bal = await this.balanceRepo.findOne({ where: { tenantId, itemId, warehouseId } });
    if (!bal) return null;
    bal.committedQty = round4(Math.max(0, (Number(bal.committedQty) || 0) - (qty || 0)));
    return this.balanceRepo.save(bal);
  }

  /**
   * Resolve a warehouse for an item (the balance row with the most on-hand)
   * and commit there. Used by sales order confirmation where no explicit
   * warehouse is supplied on the line.
   */
  async commitForItem(tenantId: string, itemId: string, qty: number): Promise<StockBalance | null> {
    const balances = await this.balanceRepo.find({ where: { tenantId, itemId } });
    if (balances.length === 0) return null;
    balances.sort((a, b) => (Number(b.qtyOnHand) || 0) - (Number(a.qtyOnHand) || 0));
    return this.commitStock(tenantId, itemId, balances[0].warehouseId, qty);
  }

  /** Release committed qty for an item across its warehouses (best effort). */
  async releaseForItem(tenantId: string, itemId: string, qty: number): Promise<void> {
    const balances = await this.balanceRepo.find({ where: { tenantId, itemId } });
    let remaining = qty || 0;
    // Release from the warehouses carrying committed qty first.
    balances.sort((a, b) => (Number(b.committedQty) || 0) - (Number(a.committedQty) || 0));
    for (const bal of balances) {
      if (remaining <= 0) break;
      const committed = Number(bal.committedQty) || 0;
      if (committed <= 0) continue;
      const release = Math.min(committed, remaining);
      bal.committedQty = round4(committed - release);
      await this.balanceRepo.save(bal);
      remaining = round4(remaining - release);
    }
  }

  /**
   * Ship (issue) qty for an item: relieves on-hand across the item's warehouses
   * (most-stocked first) and releases the matching committed reservation.
   * Throws if total on-hand is insufficient, so a shipment can never oversell.
   */
  async issueForItem(tenantId: string, itemId: string, qty: number): Promise<void> {
    const need = qty || 0;
    if (need <= 0) return;
    const balances = await this.balanceRepo.find({ where: { tenantId, itemId } });
    const totalOnHand = balances.reduce((s, b) => s + (Number(b.qtyOnHand) || 0), 0);
    if (round4(totalOnHand) < round4(need)) {
      throw new BadRequestException(
        `Insufficient stock to ship item ${itemId}: on-hand ${round4(totalOnHand)}, requested ${round4(need)}`,
      );
    }
    balances.sort((a, b) => (Number(b.qtyOnHand) || 0) - (Number(a.qtyOnHand) || 0));
    let remaining = need;
    for (const bal of balances) {
      if (remaining <= 0) break;
      const onHand = Number(bal.qtyOnHand) || 0;
      if (onHand <= 0) continue;
      const take = Math.min(onHand, remaining);
      bal.qtyOnHand = round4(onHand - take);
      bal.committedQty = round4(Math.max(0, (Number(bal.committedQty) || 0) - take));
      await this.balanceRepo.save(bal);
      remaining = round4(remaining - take);
    }
  }

  /** Items where available (on-hand minus committed) is at or below zero. */
  async getATPDashboard(tenantId: string): Promise<ATPDashboardRow[]> {
    const balances = await this.balanceRepo.find({ where: { tenantId } });
    return balances
      .map((b) => {
        const onHandQty = Number(b.qtyOnHand) || 0;
        const committedQty = Number(b.committedQty) || 0;
        return {
          itemId: b.itemId,
          warehouseId: b.warehouseId,
          onHandQty: round4(onHandQty),
          committedQty: round4(committedQty),
          availableQty: round4(onHandQty - committedQty),
        };
      })
      .filter((r) => r.availableQty <= 0);
  }
}
