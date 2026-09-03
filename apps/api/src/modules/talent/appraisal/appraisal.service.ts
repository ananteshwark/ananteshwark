import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppraisalResult, AppraisalResultStatus } from './entities/appraisal-result.entity';
import { CreateAppraisalResultDto } from './dto/appraisal.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

@Injectable()
export class AppraisalService {
  constructor(
    @InjectRepository(AppraisalResult) private resultRepo: Repository<AppraisalResult>,
  ) {}

  async createAppraisalResult(tenantId: string, dto: CreateAppraisalResultDto): Promise<AppraisalResult> {
    const result = this.resultRepo.create({ ...dto, tenantId, status: AppraisalResultStatus.DRAFT });
    return this.resultRepo.save(result);
  }

  async approveAppraisalResult(tenantId: string, id: string, approverId: string): Promise<AppraisalResult> {
    const result = await this.resultRepo.findOne({ where: { id, tenantId } });
    if (!result) throw new NotFoundException('Appraisal result not found');
    result.status = AppraisalResultStatus.APPROVED;
    result.approvedById = approverId;
    result.approvedAt = new Date();
    return this.resultRepo.save(result);
  }

  async listAppraisalResults(tenantId: string, pagination: PaginationDto, reviewCycleId?: string): Promise<PaginatedResponseDto<AppraisalResult>> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const where: any = { tenantId };
    if (reviewCycleId) where.reviewCycleId = reviewCycleId;
    const [items, total] = await this.resultRepo.findAndCount({ where, order: { createdAt: 'DESC' }, skip: (page - 1) * limit, take: limit });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getEmployeeAppraisalHistory(tenantId: string, employeeId: string): Promise<AppraisalResult[]> {
    return this.resultRepo.find({ where: { tenantId, employeeId }, order: { createdAt: 'DESC' } });
  }
}
