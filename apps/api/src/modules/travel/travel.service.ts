import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TravelRequest, TravelRequestStatus } from './entities/travel-request.entity';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { AutomationService } from '../automation/automation.service';

@Injectable()
export class TravelService {
  constructor(
    @InjectRepository(TravelRequest) private readonly requestRepo: Repository<TravelRequest>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  private async nextTripNumber(tenantId: string): Promise<string> {
    const row = await this.requestRepo
      .createQueryBuilder('t')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(t.trip_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('t.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `TRV-${String(next).padStart(6, '0')}`;
  }

  async createRequest(
    tenantId: string, createdByUserId: string, dto: Partial<TravelRequest> & { submit?: boolean },
  ): Promise<TravelRequest> {
    if (!dto.employeeId) throw new BadRequestException('employeeId is required');
    if (!dto.purpose?.trim()) throw new BadRequestException('Purpose is required');
    if (!dto.startDate || !dto.endDate) throw new BadRequestException('Start and end dates are required');
    if (dto.endDate < dto.startDate) throw new BadRequestException('End date cannot be before start date');
    if ((dto.advanceRequested ?? 0) < 0 || (dto.estimatedCost ?? 0) < 0) {
      throw new BadRequestException('Amounts cannot be negative');
    }
    const { submit, ...fields } = dto;
    const tripNumber = await this.nextTripNumber(tenantId);
    const request = this.requestRepo.create({
      ...fields,
      tenantId,
      tripNumber,
      createdByUserId,
      status: TravelRequestStatus.DRAFT,
    });
    const saved = await this.requestRepo.save(request);
    return submit ? this.submit(tenantId, saved.id) : saved;
  }

  async findAll(
    tenantId: string, pagination: PaginationDto,
    filters: { status?: TravelRequestStatus; employeeId?: string } = {},
  ): Promise<PaginatedResponseDto<TravelRequest>> {
    const { page = 1, limit = 20 } = pagination;
    const where: any = { tenantId };
    if (filters.status) where.status = filters.status;
    if (filters.employeeId) where.employeeId = filters.employeeId;
    const [items, total] = await this.requestRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findOne(tenantId: string, id: string): Promise<TravelRequest> {
    const request = await this.requestRepo.findOne({ where: { id, tenantId } });
    if (!request) throw new NotFoundException(`Travel request ${id} not found`);
    return request;
  }

  async submit(tenantId: string, id: string): Promise<TravelRequest> {
    const request = await this.findOne(tenantId, id);
    if (request.status !== TravelRequestStatus.DRAFT) {
      throw new BadRequestException(`Only DRAFT requests can be submitted (current: ${request.status})`);
    }
    request.status = TravelRequestStatus.SUBMITTED;
    const saved = await this.requestRepo.save(request);
    await this.automation?.emit(tenantId, 'travel.submitted', {
      travelRequestId: saved.id, tripNumber: saved.tripNumber, employeeId: saved.employeeId,
      destination: saved.destination, estimatedCost: Number(saved.estimatedCost),
      advanceRequested: Number(saved.advanceRequested),
    });
    return saved;
  }

  async approve(tenantId: string, id: string, approvedById: string): Promise<TravelRequest> {
    const request = await this.findOne(tenantId, id);
    if (request.status !== TravelRequestStatus.SUBMITTED) {
      throw new BadRequestException(`Only SUBMITTED requests can be approved (current: ${request.status})`);
    }
    request.status = TravelRequestStatus.APPROVED;
    request.approvedById = approvedById;
    request.approvedAt = new Date();
    const saved = await this.requestRepo.save(request);
    await this.automation?.emit(tenantId, 'travel.approved', {
      travelRequestId: saved.id, tripNumber: saved.tripNumber, employeeId: saved.employeeId,
      destination: saved.destination, approvedById,
    });
    return saved;
  }

  async reject(tenantId: string, id: string, reason: string): Promise<TravelRequest> {
    const request = await this.findOne(tenantId, id);
    if (request.status !== TravelRequestStatus.SUBMITTED) {
      throw new BadRequestException(`Only SUBMITTED requests can be rejected (current: ${request.status})`);
    }
    if (!reason?.trim()) throw new BadRequestException('A rejection reason is required');
    request.status = TravelRequestStatus.REJECTED;
    request.rejectionReason = reason.trim();
    const saved = await this.requestRepo.save(request);
    await this.automation?.emit(tenantId, 'travel.rejected', {
      travelRequestId: saved.id, tripNumber: saved.tripNumber, employeeId: saved.employeeId, reason: reason.trim(),
    });
    return saved;
  }

  /** Mark the trip as taken; optionally link the post-trip expense claim. */
  async complete(tenantId: string, id: string, expenseClaimId?: string): Promise<TravelRequest> {
    const request = await this.findOne(tenantId, id);
    if (request.status !== TravelRequestStatus.APPROVED) {
      throw new BadRequestException(`Only APPROVED trips can be completed (current: ${request.status})`);
    }
    request.status = TravelRequestStatus.COMPLETED;
    if (expenseClaimId) request.expenseClaimId = expenseClaimId;
    return this.requestRepo.save(request);
  }

  async cancel(tenantId: string, id: string): Promise<TravelRequest> {
    const request = await this.findOne(tenantId, id);
    if (![TravelRequestStatus.DRAFT, TravelRequestStatus.SUBMITTED, TravelRequestStatus.APPROVED].includes(request.status)) {
      throw new BadRequestException(`Cannot cancel a ${request.status} request`);
    }
    request.status = TravelRequestStatus.CANCELLED;
    return this.requestRepo.save(request);
  }
}
