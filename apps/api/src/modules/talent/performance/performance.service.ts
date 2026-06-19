import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReviewCycle, ReviewCycleStatus } from './entities/review-cycle.entity';
import { ReviewForm, FormType, FormStatus } from './entities/review-form.entity';
import { CalibrationSession, CalibrationStatus } from './entities/calibration-session.entity';
import { CreateReviewCycleDto, LaunchReviewsDto, SubmitReviewDto, CreateCalibrationDto, RecordCalibrationDto } from './dto/performance.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

@Injectable()
export class PerformanceService {
  constructor(
    @InjectRepository(ReviewCycle) private cycleRepo: Repository<ReviewCycle>,
    @InjectRepository(ReviewForm) private formRepo: Repository<ReviewForm>,
    @InjectRepository(CalibrationSession) private calibrationRepo: Repository<CalibrationSession>,
  ) {}

  async createReviewCycle(tenantId: string, dto: CreateReviewCycleDto): Promise<ReviewCycle> {
    const cycle = this.cycleRepo.create({ ...dto, tenantId });
    return this.cycleRepo.save(cycle);
  }

  async listReviewCycles(tenantId: string): Promise<ReviewCycle[]> {
    return this.cycleRepo.find({ where: { tenantId }, order: { startDate: 'DESC' } });
  }

  async getReviewCycle(tenantId: string, id: string): Promise<ReviewCycle> {
    const cycle = await this.cycleRepo.findOne({ where: { id, tenantId } });
    if (!cycle) throw new NotFoundException('Review cycle not found');
    return cycle;
  }

  async launchReviews(tenantId: string, cycleId: string, dto: LaunchReviewsDto): Promise<ReviewForm[]> {
    const cycle = await this.getReviewCycle(tenantId, cycleId);
    const forms: ReviewForm[] = [];
    for (const empId of dto.employeeIds) {
      // Self review
      const selfForm = this.formRepo.create({
        tenantId, cycleId, employeeId: empId, reviewerId: empId,
        type: FormType.SELF, status: FormStatus.PENDING,
        sections: dto.sections || [], responses: {},
      });
      forms.push(await this.formRepo.save(selfForm));
    }
    await this.cycleRepo.update({ id: cycleId, tenantId }, { status: ReviewCycleStatus.SELF_REVIEW });
    return forms;
  }

  async submitReview(tenantId: string, formId: string, dto: SubmitReviewDto): Promise<ReviewForm> {
    const form = await this.formRepo.findOne({ where: { id: formId, tenantId } });
    if (!form) throw new NotFoundException('Review form not found');
    form.responses = dto.responses || {};
    form.overallRating = dto.overallRating || null;
    form.comments = dto.comments || null;
    form.status = FormStatus.SUBMITTED;
    form.submittedAt = new Date();
    return this.formRepo.save(form);
  }

  async listReviewForms(tenantId: string, pagination: PaginationDto, filters?: { cycleId?: string; employeeId?: string; type?: FormType }): Promise<PaginatedResponseDto<ReviewForm>> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 20;
    const where: any = { tenantId };
    if (filters?.cycleId) where.cycleId = filters.cycleId;
    if (filters?.employeeId) where.employeeId = filters.employeeId;
    if (filters?.type) where.type = filters.type;
    const [items, total] = await this.formRepo.findAndCount({ where, order: { createdAt: 'DESC' }, skip: (page - 1) * limit, take: limit });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async createCalibrationSession(tenantId: string, dto: CreateCalibrationDto): Promise<CalibrationSession> {
    const session = this.calibrationRepo.create({ ...dto, tenantId, status: CalibrationStatus.PLANNED, ratings: {}, recommendations: {} });
    return this.calibrationRepo.save(session);
  }

  async recordCalibration(tenantId: string, id: string, dto: RecordCalibrationDto): Promise<CalibrationSession> {
    const session = await this.calibrationRepo.findOne({ where: { id, tenantId } });
    if (!session) throw new NotFoundException('Calibration session not found');
    session.ratings = dto.ratings || session.ratings;
    session.recommendations = dto.recommendations || session.recommendations;
    session.notes = dto.notes || null;
    session.status = CalibrationStatus.IN_PROGRESS;
    return this.calibrationRepo.save(session);
  }

  async completeCalibration(tenantId: string, id: string): Promise<CalibrationSession> {
    const session = await this.calibrationRepo.findOne({ where: { id, tenantId } });
    if (!session) throw new NotFoundException('Calibration session not found');
    session.status = CalibrationStatus.COMPLETED;
    return this.calibrationRepo.save(session);
  }

  async getReviewSummary(tenantId: string, cycleId: string, employeeId: string): Promise<any> {
    const forms = await this.formRepo.find({ where: { cycleId, employeeId, tenantId } });
    const selfReview = forms.find(f => f.type === FormType.SELF);
    const managerReview = forms.find(f => f.type === FormType.MANAGER);
    const calibration = await this.calibrationRepo.findOne({ where: { cycleId, tenantId } });
    return {
      selfRating: selfReview?.overallRating,
      managerRating: managerReview?.overallRating,
      calibratedRating: calibration?.ratings?.[employeeId],
      recommendation: calibration?.recommendations?.[employeeId],
    };
  }
}
