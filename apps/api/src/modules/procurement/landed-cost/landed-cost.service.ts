import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  LandedCostDoc, LandedCostStatus, AllocationBasis, LandedCharge, LandedAllocation,
} from './landed-cost.entity';
import { Grn } from '../grn/entities/grn.entity';
import { GrnLine } from '../grn/entities/grn-line.entity';
import { PoLine } from '../po/entities/po-line.entity';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

@Injectable()
export class LandedCostService {
  constructor(
    @InjectRepository(LandedCostDoc) private readonly docRepo: Repository<LandedCostDoc>,
    @InjectRepository(Grn) private readonly grnRepo: Repository<Grn>,
    @InjectRepository(GrnLine) private readonly grnLineRepo: Repository<GrnLine>,
    @InjectRepository(PoLine) private readonly poLineRepo: Repository<PoLine>,
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
    lines: Array<{ grnLineId: string; description: string; quantityAccepted: number; unitPrice: number }>,
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

  /** Posting freezes the allocation. (Valuation-layer push is the documented follow-up.) */
  async post(tenantId: string, id: string): Promise<LandedCostDoc> {
    const doc = await this.findOne(tenantId, id);
    if (doc.status !== LandedCostStatus.DRAFT) {
      throw new BadRequestException(`Only DRAFT documents can be posted (current: ${doc.status})`);
    }
    doc.status = LandedCostStatus.POSTED;
    doc.postedAt = new Date();
    return this.docRepo.save(doc);
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
