import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnboardingTemplate } from './entities/onboarding-template.entity';
import { OnboardingPlan, OnboardingStatus } from './entities/onboarding-plan.entity';
import { OnboardingTask, TaskStatus } from './entities/onboarding-task.entity';
import { CreateTemplateDto, CreateOnboardingPlanDto, UpdateTaskStatusDto } from './dto/onboarding.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';
import { Employee } from '../../hr/employees/entities/employee.entity';
import { JourneysService } from '../../hr/journeys/journeys.service';
import { JourneyTrigger } from '../../hr/journeys/entities/journey.entity';

@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(OnboardingTemplate) private templateRepo: Repository<OnboardingTemplate>,
    @InjectRepository(OnboardingPlan) private planRepo: Repository<OnboardingPlan>,
    @InjectRepository(OnboardingTask) private taskRepo: Repository<OnboardingTask>,
    @Optional() @InjectRepository(Employee) private employeeRepo?: Repository<Employee>,
    @Optional() private readonly journeys?: JourneysService,
  ) {}

  async createTemplate(tenantId: string, dto: CreateTemplateDto): Promise<OnboardingTemplate> {
    if (dto.isDefault) {
      await this.templateRepo.update({ tenantId, isDefault: true }, { isDefault: false });
    }
    const template = this.templateRepo.create({ ...dto, tenantId });
    return this.templateRepo.save(template);
  }

  async listTemplates(tenantId: string): Promise<OnboardingTemplate[]> {
    return this.templateRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async createPlan(tenantId: string, dto: CreateOnboardingPlanDto): Promise<OnboardingPlan> {
    const plan = this.planRepo.create({ ...dto, tenantId, status: OnboardingStatus.NOT_STARTED, completionPercent: 0 });
    const saved = await this.planRepo.save(plan);

    if (dto.templateId) {
      const template = await this.templateRepo.findOne({ where: { id: dto.templateId, tenantId } });
      if (template && template.tasks?.length) {
        const startDate = new Date(dto.startDate);
        const tasks = template.tasks.map((t: any) => {
          const due = new Date(startDate);
          due.setDate(due.getDate() + (t.dueAfterDays || 7));
          return this.taskRepo.create({
            tenantId,
            planId: saved.id,
            title: t.title,
            description: t.description || null,
            category: t.category || 'OTHER',
            dueDate: due.toISOString().split('T')[0],
            status: TaskStatus.PENDING,
          });
        });
        await this.taskRepo.save(tasks);
      }
    }

    // Handoff: fire every active ONBOARDING journey, anchored on the start
    // date. Best-effort — a journey failure never blocks plan creation.
    const emp = await this.employeeRepo
      ?.findOne({ where: { id: dto.employeeId, tenantId } })
      .catch(() => null);
    await this.journeys
      ?.triggerByEvent(tenantId, JourneyTrigger.ONBOARDING, {
        employeeId: dto.employeeId,
        employeeName: emp ? `${emp.firstName} ${emp.lastName}` : dto.employeeId,
        anchorDate: dto.startDate,
      })
      .catch(() => undefined);

    return saved;
  }

  async updateTaskStatus(tenantId: string, taskId: string, dto: UpdateTaskStatusDto): Promise<OnboardingTask> {
    const task = await this.taskRepo.findOne({ where: { id: taskId, tenantId } });
    if (!task) throw new NotFoundException('Task not found');
    task.status = dto.status as TaskStatus;
    task.notes = dto.notes || null;
    if (dto.status === TaskStatus.COMPLETED) {
      task.completedAt = new Date();
    }
    const saved = await this.taskRepo.save(task);
    await this.recalculatePlanProgress(tenantId, task.planId);
    return saved;
  }

  private async recalculatePlanProgress(tenantId: string, planId: string): Promise<void> {
    const tasks = await this.taskRepo.find({ where: { planId, tenantId } });
    if (!tasks.length) return;
    const completed = tasks.filter(t => t.status === TaskStatus.COMPLETED || t.status === TaskStatus.SKIPPED).length;
    const percent = Math.round((completed / tasks.length) * 100);
    const status = percent === 100 ? OnboardingStatus.COMPLETED : percent > 0 ? OnboardingStatus.IN_PROGRESS : OnboardingStatus.NOT_STARTED;
    await this.planRepo.update({ id: planId, tenantId }, { completionPercent: percent, status });
  }

  async getEmployeeOnboarding(tenantId: string, employeeId: string): Promise<any> {
    const plan = await this.planRepo.findOne({ where: { employeeId, tenantId } });
    if (!plan) throw new NotFoundException('Onboarding plan not found');
    const tasks = await this.taskRepo.find({ where: { planId: plan.id, tenantId }, order: { dueDate: 'ASC' } });
    return { ...plan, tasks };
  }

  async listPlans(tenantId: string, pagination: PaginationDto): Promise<PaginatedResponseDto<OnboardingPlan>> {
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
}
