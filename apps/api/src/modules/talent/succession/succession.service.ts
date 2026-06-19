import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SuccessionPlan } from './entities/succession-plan.entity';
import { SuccessorCandidate } from './entities/successor-candidate.entity';
import { CreateSuccessionPlanDto, AddCandidateDto } from './dto/succession.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

@Injectable()
export class SuccessionService {
  constructor(
    @InjectRepository(SuccessionPlan) private planRepo: Repository<SuccessionPlan>,
    @InjectRepository(SuccessorCandidate) private candidateRepo: Repository<SuccessorCandidate>,
  ) {}

  async createPlan(tenantId: string, dto: CreateSuccessionPlanDto): Promise<SuccessionPlan> {
    const plan = this.planRepo.create({ ...dto, tenantId });
    return this.planRepo.save(plan);
  }

  async listPlans(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<SuccessionPlan>> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const [items, total] = await this.planRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async getPlan(tenantId: string, id: string): Promise<any> {
    const plan = await this.planRepo.findOne({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException('Succession plan not found');
    const candidates = await this.candidateRepo.find({ where: { planId: id, tenantId } });
    return { ...plan, candidates };
  }

  async addCandidate(tenantId: string, dto: AddCandidateDto): Promise<SuccessorCandidate> {
    const candidate = this.candidateRepo.create({ ...dto, tenantId });
    return this.candidateRepo.save(candidate);
  }
}
