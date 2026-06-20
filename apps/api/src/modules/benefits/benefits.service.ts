import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BenefitPlan } from './entities/benefit-plan.entity';
import { BenefitEnrollment, EnrollmentStatus } from './entities/benefit-enrollment.entity';
import { SalaryBand } from './entities/salary-band.entity';
import { MeritCycle, MeritCycleStatus } from './entities/merit-cycle.entity';
import { MeritAllocation, AllocationStatus } from './entities/merit-allocation.entity';
import {
  CreateBenefitPlanDto, CreateEnrollmentDto, TerminateEnrollmentDto,
  CreateSalaryBandDto, CreateMeritCycleDto, UpdateCycleStatusDto,
  BulkAllocateDto, ApproveAllocationDto,
} from './dto/benefits.dto';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';

@Injectable()
export class BenefitsService {
  constructor(
    @InjectRepository(BenefitPlan) private readonly planRepo: Repository<BenefitPlan>,
    @InjectRepository(BenefitEnrollment) private readonly enrollmentRepo: Repository<BenefitEnrollment>,
    @InjectRepository(SalaryBand) private readonly bandRepo: Repository<SalaryBand>,
    @InjectRepository(MeritCycle) private readonly cycleRepo: Repository<MeritCycle>,
    @InjectRepository(MeritAllocation) private readonly allocationRepo: Repository<MeritAllocation>,
  ) {}

  // ---- Benefit Plans ----
  async createPlan(tenantId: string, dto: CreateBenefitPlanDto): Promise<BenefitPlan> {
    return this.planRepo.save(this.planRepo.create({ ...dto, tenantId }));
  }

  async listPlans(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<BenefitPlan>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.planRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  // ---- Enrollments ----
  async enrollEmployee(tenantId: string, dto: CreateEnrollmentDto): Promise<BenefitEnrollment> {
    const plan = await this.planRepo.findOne({ where: { tenantId, id: dto.planId } });
    if (!plan) throw new NotFoundException(`Benefit plan ${dto.planId} not found`);
    const existing = await this.enrollmentRepo.findOne({ where: { tenantId, employeeId: dto.employeeId, planId: dto.planId } });
    if (existing && existing.status === EnrollmentStatus.ACTIVE) {
      throw new BadRequestException('Employee is already enrolled in this plan');
    }
    const enrollment = this.enrollmentRepo.create({ ...dto, tenantId, status: EnrollmentStatus.ACTIVE });
    return this.enrollmentRepo.save(enrollment);
  }

  async listEnrollments(tenantId: string, employeeId?: string): Promise<BenefitEnrollment[]> {
    const where: any = { tenantId };
    if (employeeId) where.employeeId = employeeId;
    return this.enrollmentRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async terminateEnrollment(tenantId: string, id: string, dto: TerminateEnrollmentDto): Promise<BenefitEnrollment> {
    const enrollment = await this.enrollmentRepo.findOne({ where: { tenantId, id } });
    if (!enrollment) throw new NotFoundException(`Enrollment ${id} not found`);
    if (enrollment.status !== EnrollmentStatus.ACTIVE) {
      throw new BadRequestException('Enrollment is not active');
    }
    enrollment.status = EnrollmentStatus.TERMINATED;
    enrollment.terminationDate = dto.terminationDate;
    if (dto.notes) enrollment.notes = dto.notes;
    return this.enrollmentRepo.save(enrollment);
  }

  // ---- Salary Bands ----
  async createBand(tenantId: string, dto: CreateSalaryBandDto): Promise<SalaryBand> {
    return this.bandRepo.save(this.bandRepo.create({ ...dto, tenantId }));
  }

  async listBands(tenantId: string): Promise<SalaryBand[]> {
    return this.bandRepo.find({ where: { tenantId }, order: { grade: 'ASC', level: 'ASC' } });
  }

  async findBandForEmployee(tenantId: string, grade: string, level: string): Promise<SalaryBand | null> {
    return this.bandRepo.findOne({ where: { tenantId, grade, level } });
  }

  // ---- Merit Cycles ----
  async createCycle(tenantId: string, dto: CreateMeritCycleDto): Promise<MeritCycle> {
    return this.cycleRepo.save(this.cycleRepo.create({ ...dto, tenantId }));
  }

  async listCycles(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<MeritCycle>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.cycleRepo.findAndCount({
      where: { tenantId },
      order: { year: 'DESC', startDate: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async updateCycleStatus(tenantId: string, id: string, dto: UpdateCycleStatusDto): Promise<MeritCycle> {
    const cycle = await this.cycleRepo.findOne({ where: { tenantId, id } });
    if (!cycle) throw new NotFoundException(`Merit cycle ${id} not found`);
    cycle.status = dto.status;
    return this.cycleRepo.save(cycle);
  }

  // ---- Merit Allocations ----
  async bulkAllocate(tenantId: string, cycleId: string, dto: BulkAllocateDto): Promise<MeritAllocation[]> {
    const cycle = await this.cycleRepo.findOne({ where: { tenantId, id: cycleId } });
    if (!cycle) throw new NotFoundException(`Merit cycle ${cycleId} not found`);
    if (cycle.status !== MeritCycleStatus.OPEN) {
      throw new BadRequestException('Merit cycle must be OPEN to add allocations');
    }
    const allocations = dto.lines.map(line => {
      const newSalary = line.currentSalary * (1 + line.proposedIncreasePct / 100);
      return this.allocationRepo.create({
        tenantId, cycleId,
        employeeId: line.employeeId,
        currentSalary: line.currentSalary,
        proposedIncreasePct: line.proposedIncreasePct,
        newSalary: Math.round(newSalary * 100) / 100,
      });
    });
    return this.allocationRepo.save(allocations);
  }

  async listAllocations(tenantId: string, cycleId: string): Promise<MeritAllocation[]> {
    return this.allocationRepo.find({ where: { tenantId, cycleId }, order: { createdAt: 'ASC' } });
  }

  async approveAllocation(tenantId: string, id: string, approverId: string, dto: ApproveAllocationDto): Promise<MeritAllocation> {
    const allocation = await this.allocationRepo.findOne({ where: { tenantId, id } });
    if (!allocation) throw new NotFoundException(`Allocation ${id} not found`);
    allocation.status = dto.status;
    if (dto.comments) allocation.comments = dto.comments;
    if (dto.status === AllocationStatus.APPROVED) {
      allocation.approvedById = approverId;
      allocation.approvedAt = new Date();
    }
    return this.allocationRepo.save(allocation);
  }
}
