import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InspectionPlan } from './entities/inspection-plan.entity';
import { InspectionLot, InspectionLotStatus, UsageDecision } from './entities/inspection-lot.entity';
import { NonConformance, NcrStatus } from './entities/non-conformance.entity';
import {
  CreateInspectionPlanDto, CreateInspectionLotDto, RecordResultsDto,
  CreateNcrDto, ResolveNcrDto,
} from './dto/quality.dto';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';

@Injectable()
export class QualityService {
  constructor(
    @InjectRepository(InspectionPlan) private readonly planRepo: Repository<InspectionPlan>,
    @InjectRepository(InspectionLot) private readonly lotRepo: Repository<InspectionLot>,
    @InjectRepository(NonConformance) private readonly ncrRepo: Repository<NonConformance>,
  ) {}

  // ---- Inspection Plans ----
  async createPlan(tenantId: string, dto: CreateInspectionPlanDto): Promise<InspectionPlan> {
    return this.planRepo.save(this.planRepo.create({ ...dto, tenantId }));
  }

  async listPlans(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<InspectionPlan>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.planRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findPlan(tenantId: string, id: string): Promise<InspectionPlan> {
    const plan = await this.planRepo.findOne({ where: { tenantId, id } });
    if (!plan) throw new NotFoundException(`Inspection plan ${id} not found`);
    return plan;
  }

  // ---- Inspection Lots ----
  private async nextLotNumber(tenantId: string): Promise<string> {
    const row = await this.lotRepo
      .createQueryBuilder('l')
      .select(`MAX(CAST(NULLIF(regexp_replace(l.lot_number, '\\D', '', 'g'), '') AS INTEGER))`, 'mx')
      .where('l.tenantId = :tenantId', { tenantId })
      .getRawOne();
    return `QM-LOT-${String((row?.mx ?? 0) + 1).padStart(6, '0')}`;
  }

  async createLot(tenantId: string, dto: CreateInspectionLotDto): Promise<InspectionLot> {
    const lotNumber = await this.nextLotNumber(tenantId);
    return this.lotRepo.save(this.lotRepo.create({ ...dto, tenantId, lotNumber }));
  }

  async listLots(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<InspectionLot>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.lotRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findLot(tenantId: string, id: string): Promise<InspectionLot> {
    const lot = await this.lotRepo.findOne({ where: { tenantId, id } });
    if (!lot) throw new NotFoundException(`Inspection lot ${id} not found`);
    return lot;
  }

  async recordResults(tenantId: string, lotId: string, dto: RecordResultsDto): Promise<InspectionLot> {
    const lot = await this.findLot(tenantId, lotId);
    if (lot.status === InspectionLotStatus.PASSED || lot.status === InspectionLotStatus.FAILED) {
      throw new BadRequestException('Results already recorded for this lot');
    }
    lot.results = dto.results;
    lot.usageDecision = dto.usageDecision;
    lot.remarks = dto.remarks ?? null;
    if (dto.usageDecision === UsageDecision.REJECT) {
      lot.status = InspectionLotStatus.FAILED;
    } else {
      lot.status = InspectionLotStatus.PASSED;
    }
    return this.lotRepo.save(lot);
  }

  // ---- NCRs ----
  private async nextNcrNumber(tenantId: string): Promise<string> {
    const row = await this.ncrRepo
      .createQueryBuilder('n')
      .select(`MAX(CAST(NULLIF(regexp_replace(n.ncr_number, '\\D', '', 'g'), '') AS INTEGER))`, 'mx')
      .where('n.tenantId = :tenantId', { tenantId })
      .getRawOne();
    return `NCR-${String((row?.mx ?? 0) + 1).padStart(6, '0')}`;
  }

  async createNcr(tenantId: string, dto: CreateNcrDto): Promise<NonConformance> {
    const ncrNumber = await this.nextNcrNumber(tenantId);
    return this.ncrRepo.save(this.ncrRepo.create({ ...dto, tenantId, ncrNumber }));
  }

  async listNcrs(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<NonConformance>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.ncrRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async resolveNcr(tenantId: string, id: string, dto: ResolveNcrDto): Promise<NonConformance> {
    const ncr = await this.ncrRepo.findOne({ where: { tenantId, id } });
    if (!ncr) throw new NotFoundException(`NCR ${id} not found`);
    ncr.rootCause = dto.rootCause;
    ncr.correctiveAction = dto.correctiveAction;
    ncr.preventiveAction = dto.preventiveAction ?? null;
    ncr.status = NcrStatus.RESOLVED;
    ncr.resolvedAt = new Date();
    return this.ncrRepo.save(ncr);
  }

  async closeNcr(tenantId: string, id: string): Promise<NonConformance> {
    const ncr = await this.ncrRepo.findOne({ where: { tenantId, id } });
    if (!ncr) throw new NotFoundException(`NCR ${id} not found`);
    if (ncr.status !== NcrStatus.RESOLVED) {
      throw new BadRequestException('NCR must be RESOLVED before closing');
    }
    ncr.status = NcrStatus.CLOSED;
    return this.ncrRepo.save(ncr);
  }
}
