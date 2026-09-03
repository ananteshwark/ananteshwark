import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SourceList } from './entities/source-list.entity';
import { QuotaArrangement, QuotaArrangementStatus, QuotaItem } from './entities/quota-arrangement.entity';
import {
  CreateSourceListDto,
  UpdateSourceListDto,
  CreateQuotaArrangementDto,
  UpdateQuotaArrangementDto,
} from './dto/source-determination.dto';

export interface SourceProposal {
  rank: number;
  source: 'FIXED' | 'QUOTA' | 'SOURCE_LIST' | 'INFO_RECORD';
  vendorId: string;
  vendorName: string | null;
  quotaPercentage?: number;
  priority?: number;
  infoRecordId?: string | null;
  outlineAgreementId?: string | null;
  leadTimeDays: number;
  minOrderQty: number | null;
  currency: string;
  isFixed: boolean;
  isBlocked: boolean;
  sourceListId?: string;
  quotaArrangementId?: string;
}

export interface SourceDeterminationResult {
  itemId: string;
  date: string;
  proposals: SourceProposal[];
  recommended: SourceProposal | null;
  hasFixed: boolean;
  hasQuota: boolean;
}

@Injectable()
export class SourceDeterminationService {
  constructor(
    @InjectRepository(SourceList)
    private readonly slRepo: Repository<SourceList>,
    @InjectRepository(QuotaArrangement)
    private readonly qaRepo: Repository<QuotaArrangement>,
  ) {}

  // ─── Source List CRUD ────────────────────────────────────────────────────────

  async createSourceList(tenantId: string, dto: CreateSourceListDto): Promise<SourceList> {
    const entry = this.slRepo.create({
      tenantId,
      itemId: dto.itemId,
      itemCode: dto.itemCode ?? null,
      itemDescription: dto.itemDescription ?? null,
      vendorId: dto.vendorId,
      vendorName: dto.vendorName ?? null,
      plant: dto.plant ?? null,
      validFrom: dto.validFrom,
      validTo: dto.validTo ?? null,
      priority: dto.priority ?? 1,
      isFixed: dto.isFixed ?? false,
      isBlocked: dto.isBlocked ?? false,
      infoRecordId: dto.infoRecordId ?? null,
      outlineAgreementId: dto.outlineAgreementId ?? null,
      minOrderQty: dto.minOrderQty ?? null,
      currency: dto.currency ?? 'INR',
      leadTimeDays: dto.leadTimeDays ?? 0,
      notes: dto.notes ?? null,
      isActive: true,
    } as any);
    return (this.slRepo.save(entry as any) as unknown) as Promise<SourceList>;
  }

  async updateSourceList(tenantId: string, id: string, dto: UpdateSourceListDto): Promise<SourceList> {
    const entry = await this.slRepo.findOne({ where: { id, tenantId } });
    if (!entry) throw new NotFoundException(`Source list entry ${id} not found`);
    Object.assign(entry, {
      ...(dto.validTo !== undefined && { validTo: dto.validTo }),
      ...(dto.priority !== undefined && { priority: dto.priority }),
      ...(dto.isFixed !== undefined && { isFixed: dto.isFixed }),
      ...(dto.isBlocked !== undefined && { isBlocked: dto.isBlocked }),
      ...(dto.infoRecordId !== undefined && { infoRecordId: dto.infoRecordId }),
      ...(dto.outlineAgreementId !== undefined && { outlineAgreementId: dto.outlineAgreementId }),
      ...(dto.minOrderQty !== undefined && { minOrderQty: dto.minOrderQty }),
      ...(dto.currency !== undefined && { currency: dto.currency }),
      ...(dto.leadTimeDays !== undefined && { leadTimeDays: dto.leadTimeDays }),
      ...(dto.notes !== undefined && { notes: dto.notes }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
    return (this.slRepo.save(entry) as unknown) as Promise<SourceList>;
  }

  async findSourceLists(
    tenantId: string,
    filters: { itemId?: string; vendorId?: string; activeOnly?: boolean; asOf?: string },
  ): Promise<SourceList[]> {
    const qb = this.slRepo
      .createQueryBuilder('sl')
      .where('sl.tenant_id = :tenantId', { tenantId });
    if (filters.itemId) qb.andWhere('sl.item_id = :itemId', { itemId: filters.itemId });
    if (filters.vendorId) qb.andWhere('sl.vendor_id = :vendorId', { vendorId: filters.vendorId });
    if (filters.activeOnly) qb.andWhere('sl.is_active = true');
    if (filters.asOf) {
      qb.andWhere('sl.valid_from <= :asOf', { asOf: filters.asOf });
      qb.andWhere('(sl.valid_to IS NULL OR sl.valid_to >= :asOf)', { asOf: filters.asOf });
    }
    return qb.orderBy('sl.priority', 'ASC').getMany();
  }

  async deleteSourceList(tenantId: string, id: string): Promise<void> {
    const entry = await this.slRepo.findOne({ where: { id, tenantId } });
    if (!entry) throw new NotFoundException(`Source list entry ${id} not found`);
    await this.slRepo.remove(entry);
  }

  // ─── Quota Arrangement CRUD ──────────────────────────────────────────────────

  async createQuotaArrangement(tenantId: string, dto: CreateQuotaArrangementDto): Promise<QuotaArrangement> {
    this.validateQuotaItems(dto.items);
    const items: QuotaItem[] = dto.items.map((qi, i) => ({
      vendorId: qi.vendorId,
      vendorName: qi.vendorName,
      quotaPercentage: qi.quotaPercentage,
      maxQuantity: qi.maxQuantity ?? null,
      allocatedQty: 0,
      priority: qi.priority ?? i + 1,
    }));
    const qa = this.qaRepo.create({
      tenantId,
      itemId: dto.itemId,
      itemCode: dto.itemCode ?? null,
      itemDescription: dto.itemDescription ?? null,
      validFrom: dto.validFrom,
      validTo: dto.validTo ?? null,
      status: QuotaArrangementStatus.ACTIVE,
      items,
      notes: dto.notes ?? null,
    } as any);
    return (this.qaRepo.save(qa as any) as unknown) as Promise<QuotaArrangement>;
  }

  async updateQuotaArrangement(tenantId: string, id: string, dto: UpdateQuotaArrangementDto): Promise<QuotaArrangement> {
    const qa = await this.qaRepo.findOne({ where: { id, tenantId } });
    if (!qa) throw new NotFoundException(`Quota arrangement ${id} not found`);
    if (dto.items) {
      this.validateQuotaItems(dto.items);
      const existingByVendor = new Map(qa.items.map(i => [i.vendorId, i.allocatedQty]));
      qa.items = dto.items.map((qi, i) => ({
        vendorId: qi.vendorId,
        vendorName: qi.vendorName,
        quotaPercentage: qi.quotaPercentage,
        maxQuantity: qi.maxQuantity ?? null,
        allocatedQty: existingByVendor.get(qi.vendorId) ?? 0,
        priority: qi.priority ?? i + 1,
      }));
    }
    if (dto.validTo !== undefined) qa.validTo = dto.validTo;
    if (dto.status !== undefined) qa.status = dto.status;
    if (dto.notes !== undefined) qa.notes = dto.notes;
    return (this.qaRepo.save(qa) as unknown) as Promise<QuotaArrangement>;
  }

  async findQuotaArrangements(
    tenantId: string,
    filters: { itemId?: string; activeOnly?: boolean; asOf?: string },
  ): Promise<QuotaArrangement[]> {
    const qb = this.qaRepo
      .createQueryBuilder('qa')
      .where('qa.tenant_id = :tenantId', { tenantId });
    if (filters.itemId) qb.andWhere('qa.item_id = :itemId', { itemId: filters.itemId });
    if (filters.activeOnly) qb.andWhere('qa.status = :status', { status: QuotaArrangementStatus.ACTIVE });
    if (filters.asOf) {
      qb.andWhere('qa.valid_from <= :asOf', { asOf: filters.asOf });
      qb.andWhere('(qa.valid_to IS NULL OR qa.valid_to >= :asOf)', { asOf: filters.asOf });
    }
    return qb.orderBy('qa.valid_from', 'DESC').getMany();
  }

  async resetQuotaAllocations(tenantId: string, id: string): Promise<QuotaArrangement> {
    const qa = await this.qaRepo.findOne({ where: { id, tenantId } });
    if (!qa) throw new NotFoundException(`Quota arrangement ${id} not found`);
    qa.items = qa.items.map(i => ({ ...i, allocatedQty: 0 }));
    return (this.qaRepo.save(qa) as unknown) as Promise<QuotaArrangement>;
  }

  // ─── Source Determination ────────────────────────────────────────────────────

  async determineSource(
    tenantId: string,
    itemId: string,
    quantity: number,
    requiredDate?: string,
  ): Promise<SourceDeterminationResult> {
    const asOf = requiredDate ?? new Date().toISOString().slice(0, 10);

    const [sourceLists, quotaArrangements] = await Promise.all([
      this.findSourceLists(tenantId, { itemId, activeOnly: true, asOf }),
      this.findQuotaArrangements(tenantId, { itemId, activeOnly: true, asOf }),
    ]);

    const proposals: SourceProposal[] = [];
    let rank = 1;

    // 1. Fixed (mandatory) source list entries
    const fixedEntries = sourceLists.filter(sl => sl.isFixed && !sl.isBlocked);
    for (const sl of fixedEntries) {
      proposals.push({
        rank: rank++,
        source: 'FIXED',
        vendorId: sl.vendorId,
        vendorName: sl.vendorName,
        priority: sl.priority,
        infoRecordId: sl.infoRecordId,
        outlineAgreementId: sl.outlineAgreementId,
        leadTimeDays: sl.leadTimeDays,
        minOrderQty: sl.minOrderQty,
        currency: sl.currency,
        isFixed: true,
        isBlocked: false,
        sourceListId: sl.id,
      });
    }

    // 2. Active quota arrangement — select vendor by quota balance
    for (const qa of quotaArrangements) {
      const activeItems = qa.items.filter(
        qi => !this.isVendorBlockedInSL(sourceLists, qi.vendorId),
      );
      if (!activeItems.length) continue;

      const selected = this.selectByQuota(activeItems, quantity);
      for (const qi of selected) {
        proposals.push({
          rank: rank++,
          source: 'QUOTA',
          vendorId: qi.vendorId,
          vendorName: qi.vendorName,
          quotaPercentage: qi.quotaPercentage,
          priority: qi.priority,
          leadTimeDays: this.leadTimeFromSL(sourceLists, qi.vendorId),
          minOrderQty: null,
          currency: 'INR',
          isFixed: false,
          isBlocked: false,
          quotaArrangementId: qa.id,
        });
      }
    }

    // 3. Regular source list entries (non-fixed, non-blocked)
    const regularEntries = sourceLists.filter(sl => !sl.isFixed && !sl.isBlocked);
    for (const sl of regularEntries) {
      if (proposals.some(p => p.vendorId === sl.vendorId)) continue; // already included
      proposals.push({
        rank: rank++,
        source: 'SOURCE_LIST',
        vendorId: sl.vendorId,
        vendorName: sl.vendorName,
        priority: sl.priority,
        infoRecordId: sl.infoRecordId,
        outlineAgreementId: sl.outlineAgreementId,
        leadTimeDays: sl.leadTimeDays,
        minOrderQty: sl.minOrderQty,
        currency: sl.currency,
        isFixed: false,
        isBlocked: false,
        sourceListId: sl.id,
      });
    }

    // Blocked entries added at end (visibility only)
    const blockedEntries = sourceLists.filter(sl => sl.isBlocked);
    for (const sl of blockedEntries) {
      proposals.push({
        rank: rank++,
        source: 'SOURCE_LIST',
        vendorId: sl.vendorId,
        vendorName: sl.vendorName,
        priority: sl.priority,
        infoRecordId: sl.infoRecordId,
        outlineAgreementId: sl.outlineAgreementId,
        leadTimeDays: sl.leadTimeDays,
        minOrderQty: sl.minOrderQty,
        currency: sl.currency,
        isFixed: sl.isFixed,
        isBlocked: true,
        sourceListId: sl.id,
      });
    }

    const recommended = proposals.find(p => !p.isBlocked) ?? null;

    return {
      itemId,
      date: asOf,
      proposals,
      recommended,
      hasFixed: fixedEntries.length > 0,
      hasQuota: quotaArrangements.length > 0,
    };
  }

  /** After PR approval: attach a vendor proposal to each line that has an itemId */
  async resolveForRequisitionLines(
    tenantId: string,
    lines: Array<{ id: string; itemId?: string | null; quantity: number; requiredDate?: string | null }>,
  ): Promise<Array<{ lineId: string; proposal: SourceProposal | null }>> {
    const results: Array<{ lineId: string; proposal: SourceProposal | null }> = [];
    for (const line of lines) {
      if (!line.itemId) {
        results.push({ lineId: line.id, proposal: null });
        continue;
      }
      const det = await this.determineSource(
        tenantId,
        line.itemId,
        line.quantity,
        line.requiredDate ?? undefined,
      );
      results.push({ lineId: line.id, proposal: det.recommended });
    }
    return results;
  }

  /** Update quota allocation counters after determination is committed */
  async recordQuotaAllocation(
    tenantId: string,
    quotaArrangementId: string,
    vendorId: string,
    quantity: number,
  ): Promise<void> {
    const qa = await this.qaRepo.findOne({ where: { id: quotaArrangementId, tenantId } });
    if (!qa) return;
    qa.items = qa.items.map(qi =>
      qi.vendorId === vendorId ? { ...qi, allocatedQty: qi.allocatedQty + quantity } : qi,
    );
    await (this.qaRepo.save(qa) as unknown);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private validateQuotaItems(items: Array<{ quotaPercentage: number }>): void {
    const total = items.reduce((s, i) => s + i.quotaPercentage, 0);
    if (Math.abs(total - 100) > 0.01) {
      throw new BadRequestException(`Quota percentages must sum to 100 (got ${total})`);
    }
  }

  private isVendorBlockedInSL(sourceLists: SourceList[], vendorId: string): boolean {
    return sourceLists.some(sl => sl.vendorId === vendorId && sl.isBlocked);
  }

  private leadTimeFromSL(sourceLists: SourceList[], vendorId: string): number {
    return sourceLists.find(sl => sl.vendorId === vendorId)?.leadTimeDays ?? 0;
  }

  /**
   * Select vendor(s) from quota items using proportional allocation.
   * Primary: vendor with highest remaining quota ratio (actual% below target%).
   * Returns single best-fit vendor.
   */
  private selectByQuota(items: QuotaItem[], quantity: number): QuotaItem[] {
    const totalAllocated = items.reduce((s, i) => s + i.allocatedQty, 0);
    // Score: how far below their target percentage each vendor is
    const scored = items
      .filter(qi => qi.maxQuantity == null || qi.allocatedQty + quantity <= qi.maxQuantity)
      .map(qi => {
        const currentPct = totalAllocated > 0 ? (qi.allocatedQty / totalAllocated) * 100 : 0;
        const deficit = qi.quotaPercentage - currentPct;
        return { qi, deficit };
      })
      .sort((a, b) => b.deficit - a.deficit || a.qi.priority - b.qi.priority);

    if (!scored.length) {
      // All capped — fall back to highest-percentage vendor
      return items.sort((a, b) => b.quotaPercentage - a.quotaPercentage).slice(0, 1);
    }
    return [scored[0].qi];
  }
}
