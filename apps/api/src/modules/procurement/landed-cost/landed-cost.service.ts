import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LandedCostDoc, LandedCostStatus, AllocationBasis, LandedCharge, LandedAllocation, ValuationPushRow,
} from './landed-cost.entity';
import { Grn } from '../grn/entities/grn.entity';
import { GrnLine } from '../grn/entities/grn-line.entity';
import { PoLine } from '../po/entities/po-line.entity';
import { Item } from '../../inventory/entities/item.entity';
import { StockBalance } from '../../inventory/entities/stock-balance.entity';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;
const round4 = (n: number) => Math.round(Number(n) * 10000) / 10000;

@Injectable()
export class LandedCostService {
  constructor(
    @InjectRepository(LandedCostDoc) private readonly docRepo: Repository<LandedCostDoc>,
    @InjectRepository(Grn) private readonly grnRepo: Repository<Grn>,
    @InjectRepository(GrnLine) private readonly grnLineRepo: Repository<GrnLine>,
    @InjectRepository(PoLine) private readonly poLineRepo: Repository<PoLine>,
    @Optional() @InjectRepository(Item) private readonly itemRepo?: Repository<Item>,
    @Optional() @InjectRepository(StockBalance) private readonly balanceRepo?: Repository<StockBalance>,
  ) {}

  private async nextDocNumber(tenantId: string): Promise<string> {
    const row = await this.docRepo
      .createQueryBuilder('d')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(d.doc_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('d.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `LC-${String(next).padStart(6, '0')}`;
  }

  /**
   * Spread total charges over receipt lines. Every line except the last gets
   * its rounded proportional share; the last line takes the remainder so the
   * allocations always add up to the charge total exactly.
   */
  allocate(
    lines: Array<{ grnLineId: string; description: string; quantityAccepted: number; unitPrice: number; itemCode?: string | null }>,
    totalCharges: number,
    basis: AllocationBasis,
  ): LandedAllocation[] {
    const eligible = lines.filter((l) => Number(l.quantityAccepted) > 0);
    if (!eligible.length) throw new BadRequestException('No accepted quantities to allocate against');

    const basisOf = (l: typeof eligible[number]) =>
      basis === AllocationBasis.QUANTITY
        ? Number(l.quantityAccepted)
        : round2(Number(l.quantityAccepted) * Number(l.unitPrice));
    const totalBasis = eligible.reduce((sum, l) => sum + basisOf(l), 0);
    if (totalBasis <= 0) throw new BadRequestException('Allocation basis totals zero — check PO prices/quantities');

    let allocatedSoFar = 0;
    return eligible.map((l, i) => {
      const isLast = i === eligible.length - 1;
      const allocated = isLast
        ? round2(totalCharges - allocatedSoFar)
        : round2((basisOf(l) / totalBasis) * totalCharges);
      allocatedSoFar = round2(allocatedSoFar + allocated);
      return {
        grnLineId: l.grnLineId,
        description: l.description,
        quantityAccepted: Number(l.quantityAccepted),
        basisValue: basisOf(l),
        allocatedAmount: allocated,
        unitCostDelta: round2(allocated / Number(l.quantityAccepted)),
        itemCode: l.itemCode ?? null,
      };
    });
  }

  async create(
    tenantId: string,
    dto: { grnId: string; charges: LandedCharge[]; allocationBasis?: AllocationBasis },
  ): Promise<LandedCostDoc> {
    const charges = (dto.charges ?? []).filter((c) => Number(c.amount) > 0);
    if (!charges.length) throw new BadRequestException('At least one charge with a positive amount is required');
    const grn = await this.grnRepo.findOne({ where: { id: dto.grnId, tenantId } });
    if (!grn) throw new NotFoundException(`GRN ${dto.grnId} not found`);
    const grnLines = await this.grnLineRepo.find({ where: { tenantId, grnId: grn.id } });
    if (!grnLines.length) throw new BadRequestException('GRN has no lines');

    const poLines = await this.poLineRepo.find({ where: { tenantId, poId: (grn as any).poId } });
    const poLineMap = new Map(poLines.map((l) => [l.id, l]));

    const basis = dto.allocationBasis ?? AllocationBasis.VALUE;
    const totalCharges = round2(charges.reduce((sum, c) => sum + Number(c.amount), 0));
    const allocations = this.allocate(
      grnLines.map((l) => {
        const poLine = poLineMap.get((l as any).poLineId);
        return {
          grnLineId: l.id,
          description: (poLine as any)?.description ?? `Line ${(l as any).lineNumber}`,
          quantityAccepted: Number((l as any).quantityAccepted),
          unitPrice: Number((poLine as any)?.unitPrice ?? 0),
          itemCode: (poLine as any)?.itemCode ?? null,
        };
      }),
      totalCharges,
      basis,
    );

    const doc = this.docRepo.create({
      tenantId,
      docNumber: await this.nextDocNumber(tenantId),
      grnId: grn.id,
      grnNumber: (grn as any).grnNumber ?? null,
      status: LandedCostStatus.DRAFT,
      allocationBasis: basis,
      charges,
      totalCharges,
      allocations,
    });
    return this.docRepo.save(doc);
  }

  async findAll(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<LandedCostDoc>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.docRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findOne(tenantId: string, id: string): Promise<LandedCostDoc> {
    const doc = await this.docRepo.findOne({ where: { id, tenantId } });
    if (!doc) throw new NotFoundException(`Landed cost document ${id} not found`);
    return doc;
  }

  /**
   * Posting freezes the allocation and pushes it into stock valuation: each
   * line's allocated charge is absorbed into the item's moving average across
   * its on-hand balances. Charges that can't be absorbed (unknown item, zero
   * on-hand) are reported as expensed instead of silently dropped.
   */
  async post(tenantId: string, id: string): Promise<LandedCostDoc> {
    const doc = await this.findOne(tenantId, id);
    if (doc.status !== LandedCostStatus.DRAFT) {
      throw new BadRequestException(`Only DRAFT documents can be posted (current: ${doc.status})`);
    }
    doc.valuationResult = await this.pushToValuation(tenantId, doc.allocations);
    doc.status = LandedCostStatus.POSTED;
    doc.postedAt = new Date();
    return this.docRepo.save(doc);
  }

  private async pushToValuation(tenantId: string, allocations: LandedAllocation[]): Promise<ValuationPushRow[] | null> {
    if (!this.itemRepo || !this.balanceRepo) return null; // valuation layer not wired in this deployment
    const rows: ValuationPushRow[] = [];
    for (const alloc of allocations) {
      const amount = Number(alloc.allocatedAmount);
      if (!alloc.itemCode) {
        rows.push({ grnLineId: alloc.grnLineId, itemCode: null, applied: 0, expensed: amount, reason: 'PO line has no item code' });
        continue;
      }
      const item = await this.itemRepo.findOne({ where: { tenantId, code: alloc.itemCode } as any });
      if (!item) {
        rows.push({ grnLineId: alloc.grnLineId, itemCode: alloc.itemCode, applied: 0, expensed: amount, reason: `No item master for code ${alloc.itemCode}` });
        continue;
      }
      const balances = await this.balanceRepo.find({ where: { tenantId, itemId: item.id } as any });
      const onHand = balances.reduce((s, b) => s + Number(b.qtyOnHand), 0);
      if (onHand <= 0) {
        rows.push({ grnLineId: alloc.grnLineId, itemCode: alloc.itemCode, applied: 0, expensed: amount, reason: 'No stock on hand to absorb the charge' });
        continue;
      }
      // Spread over balances proportional to on-hand qty; the moving average
      // rises by (share / qty) per warehouse, so total value rises by exactly
      // the allocated amount.
      let appliedSoFar = 0;
      const withStock = balances.filter((b) => Number(b.qtyOnHand) > 0);
      for (let i = 0; i < withStock.length; i++) {
        const b = withStock[i];
        const isLast = i === withStock.length - 1;
        const share = isLast ? round2(amount - appliedSoFar) : round2((Number(b.qtyOnHand) / onHand) * amount);
        appliedSoFar = round2(appliedSoFar + share);
        const qty = Number(b.qtyOnHand);
        const newAvg = round4((qty * Number(b.avgCost) + share) / qty);
        b.avgCost = newAvg;
        b.unitCost = newAvg;
        b.totalCost = round4(qty * newAvg);
        b.totalValue = round2(qty * newAvg);
        await this.balanceRepo.save(b);
      }
      rows.push({ grnLineId: alloc.grnLineId, itemCode: alloc.itemCode, applied: amount, expensed: 0 });
    }
    return rows;
  }

  async cancel(tenantId: string, id: string): Promise<LandedCostDoc> {
    const doc = await this.findOne(tenantId, id);
    if (doc.status === LandedCostStatus.POSTED) {
      throw new BadRequestException('Posted landed costs cannot be cancelled — reverse via a new document');
    }
    doc.status = LandedCostStatus.CANCELLED;
    return this.docRepo.save(doc);
  }
}
