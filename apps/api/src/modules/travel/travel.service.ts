import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TravelRequest, TravelRequestStatus, TravelerType, AccommodationLeg } from './entities/travel-request.entity';
import { TravelComment } from './entities/travel-comment.entity';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { AutomationService } from '../automation/automation.service';

@Injectable()
export class TravelService {
  constructor(
    @InjectRepository(TravelRequest) private readonly requestRepo: Repository<TravelRequest>,
    @Optional() private readonly automation?: AutomationService,
    @Optional() @InjectRepository(TravelComment)
    private readonly commentRepo?: Repository<TravelComment>,
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
    const travelerType = dto.travelerType ?? TravelerType.SELF;
    // Guest trips carry a guest name instead of an employee record.
    if (travelerType === TravelerType.GUEST) {
      if (!dto.guestName?.trim()) throw new BadRequestException('guestName is required for guest travel');
    } else if (!dto.employeeId) {
      throw new BadRequestException('employeeId is required');
    }
    if (!dto.purpose?.trim()) throw new BadRequestException('Purpose is required');
    if (!dto.startDate || !dto.endDate) throw new BadRequestException('Start and end dates are required');
    if (dto.endDate < dto.startDate) throw new BadRequestException('End date cannot be before start date');
    if ((dto.advanceRequested ?? 0) < 0 || (dto.estimatedCost ?? 0) < 0) {
      throw new BadRequestException('Amounts cannot be negative');
    }
    // Validate any accommodation legs.
    for (const leg of dto.accommodation ?? []) {
      if (!leg.city?.trim() || !leg.checkIn || !leg.checkOut) {
        throw new BadRequestException('Each accommodation leg needs city, checkIn and checkOut');
      }
      if (leg.checkOut < leg.checkIn) throw new BadRequestException('Accommodation checkOut cannot precede checkIn');
    }
    const { submit, ...fields } = dto;
    const tripNumber = await this.nextTripNumber(tenantId);
    const request = this.requestRepo.create({
      ...fields,
      travelerType,
      guestName: travelerType === TravelerType.GUEST ? dto.guestName!.trim() : null,
      accommodation: dto.accommodation ?? [],
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

  async submit(tenantId: string, id: string, options: { exceptionJustification?: string } = {}): Promise<TravelRequest> {
    const request = await this.findOne(tenantId, id);
    if (request.status !== TravelRequestStatus.DRAFT) {
      throw new BadRequestException(`Only DRAFT requests can be submitted (current: ${request.status})`);
    }
    // Budget-breach exception: estimated cost over the trip's budget limit
    // requires a justification and marks the request as an exception.
    if (request.budgetLimit != null && Number(request.estimatedCost) > Number(request.budgetLimit)) {
      const justification = options.exceptionJustification ?? request.exceptionJustification;
      if (!justification?.trim()) {
        throw new BadRequestException(
          `Estimated cost ${request.estimatedCost} exceeds the budget of ${request.budgetLimit} — an exception justification is required to submit`,
        );
      }
      request.exceptionJustification = justification.trim();
      request.isException = true;
    }
    request.status = TravelRequestStatus.SUBMITTED;
    const saved = await this.requestRepo.save(request);
    await this.automation?.emit(tenantId, 'travel.submitted', {
      travelRequestId: saved.id, tripNumber: saved.tripNumber, employeeId: saved.employeeId,
      destination: saved.destination, estimatedCost: Number(saved.estimatedCost),
      advanceRequested: Number(saved.advanceRequested), isException: saved.isException,
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

  async cancel(tenantId: string, id: string, reason?: string): Promise<TravelRequest> {
    const request = await this.findOne(tenantId, id);
    if (![TravelRequestStatus.DRAFT, TravelRequestStatus.SUBMITTED, TravelRequestStatus.APPROVED].includes(request.status)) {
      throw new BadRequestException(`Cannot cancel a ${request.status} request`);
    }
    // Cancelling an already-approved trip records a reason for the audit trail.
    if (request.status === TravelRequestStatus.APPROVED && !reason?.trim()) {
      throw new BadRequestException('A cancellation reason is required to cancel an approved trip');
    }
    request.status = TravelRequestStatus.CANCELLED;
    request.cancellationReason = reason?.trim() || null;
    return this.requestRepo.save(request);
  }

  // ---- Accommodation legs ----
  async setAccommodation(tenantId: string, id: string, legs: AccommodationLeg[]): Promise<TravelRequest> {
    const request = await this.findOne(tenantId, id);
    if (![TravelRequestStatus.DRAFT, TravelRequestStatus.SUBMITTED, TravelRequestStatus.APPROVED].includes(request.status)) {
      throw new BadRequestException(`Cannot change accommodation on a ${request.status} trip`);
    }
    for (const leg of legs ?? []) {
      if (!leg.city?.trim() || !leg.checkIn || !leg.checkOut) {
        throw new BadRequestException('Each accommodation leg needs city, checkIn and checkOut');
      }
      if (leg.checkOut < leg.checkIn) throw new BadRequestException('Accommodation checkOut cannot precede checkIn');
    }
    request.accommodation = legs ?? [];
    return this.requestRepo.save(request);
  }

  // ---- Admin/agent ↔ employee chat ----
  async addComment(
    tenantId: string, requestId: string,
    author: { userId: string; name: string; role?: string }, body: string,
  ): Promise<TravelComment> {
    if (!this.commentRepo) throw new BadRequestException('Travel chat is not available in this deployment');
    if (!body?.trim()) throw new BadRequestException('Comment body is required');
    await this.findOne(tenantId, requestId); // ensure the trip exists + tenant scope
    return this.commentRepo.save(this.commentRepo.create({
      tenantId, requestId,
      authorUserId: author.userId, authorName: author.name,
      authorRole: author.role ?? 'EMPLOYEE', body: body.trim(),
    }));
  }

  async listComments(tenantId: string, requestId: string): Promise<TravelComment[]> {
    if (!this.commentRepo) return [];
    return this.commentRepo.find({ where: { tenantId, requestId }, order: { createdAt: 'ASC' } });
  }
}
