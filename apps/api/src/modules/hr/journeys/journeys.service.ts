import { Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import {
  JourneyTemplate, JourneyTrigger, JourneyInstance, JourneyStatus,
  JourneyStepInstance, JourneyStepStatus,
} from './entities/journey.entity';
import { AutomationService } from '../../automation/automation.service';

/** Add a (possibly negative) number of days to a YYYY-MM-DD date string. */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class JourneysService {
  constructor(
    @InjectRepository(JourneyTemplate) private readonly templateRepo: Repository<JourneyTemplate>,
    @InjectRepository(JourneyInstance) private readonly instanceRepo: Repository<JourneyInstance>,
    @InjectRepository(JourneyStepInstance) private readonly stepRepo: Repository<JourneyStepInstance>,
    @Optional() private readonly automation?: AutomationService,
  ) {}

  // ─── Templates ────────────────────────────────────────────────

  async createTemplate(tenantId: string, dto: { name: string; triggerEvent?: JourneyTrigger; steps?: any[] }): Promise<JourneyTemplate> {
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    return this.templateRepo.save(this.templateRepo.create({
      tenantId, name: dto.name.trim(), triggerEvent: dto.triggerEvent ?? JourneyTrigger.CUSTOM,
      steps: this.normaliseSteps(dto.steps ?? []), active: true,
    }));
  }

  private normaliseSteps(steps: any[]): JourneyTemplate['steps'] {
    return (steps ?? [])
      .filter((s) => s && s.key?.trim() && s.title?.trim())
      .map((s) => ({
        key: String(s.key).trim(), title: String(s.title).trim(),
        ownerRole: s.ownerRole ?? undefined, offsetDays: s.offsetDays != null ? Number(s.offsetDays) : 0,
        mandatory: s.mandatory !== false, instructions: s.instructions ?? undefined,
      }));
  }

  listTemplates(tenantId: string, triggerEvent?: JourneyTrigger): Promise<JourneyTemplate[]> {
    const where: any = { tenantId };
    if (triggerEvent) where.triggerEvent = triggerEvent;
    return this.templateRepo.find({ where, order: { name: 'ASC' } });
  }

  async updateTemplate(tenantId: string, id: string, dto: { name?: string; active?: boolean; steps?: any[] }): Promise<JourneyTemplate> {
    const tpl = await this.templateRepo.findOne({ where: { id, tenantId } });
    if (!tpl) throw new NotFoundException(`Journey template ${id} not found`);
    if (dto.name !== undefined) tpl.name = dto.name.trim();
    if (dto.active !== undefined) tpl.active = dto.active;
    if (dto.steps !== undefined) tpl.steps = this.normaliseSteps(dto.steps);
    return this.templateRepo.save(tpl);
  }

  // ─── Instantiation ────────────────────────────────────────────

  async triggerTemplate(tenantId: string, templateId: string, dto: { employeeId: string; employeeName: string; anchorDate: string }): Promise<{ instance: JourneyInstance; steps: JourneyStepInstance[] }> {
    const tpl = await this.templateRepo.findOne({ where: { id: templateId, tenantId } });
    if (!tpl) throw new NotFoundException(`Journey template ${templateId} not found`);
    return this.instantiate(tenantId, tpl, dto);
  }

  /**
   * Fire every active template registered for an event. Returns one entry per
   * instantiated journey — the event-triggered entry point.
   */
  async triggerByEvent(tenantId: string, event: JourneyTrigger, dto: { employeeId: string; employeeName: string; anchorDate: string }): Promise<Array<{ instance: JourneyInstance; steps: JourneyStepInstance[] }>> {
    const templates = await this.templateRepo.find({ where: { tenantId, triggerEvent: event, active: true } });
    const out = [];
    for (const tpl of templates) out.push(await this.instantiate(tenantId, tpl, dto));
    return out;
  }

  private async instantiate(tenantId: string, tpl: JourneyTemplate, dto: { employeeId: string; employeeName: string; anchorDate: string }): Promise<{ instance: JourneyInstance; steps: JourneyStepInstance[] }> {
    if (!dto.employeeId || !dto.anchorDate) throw new BadRequestException('employeeId and anchorDate are required');
    const instance = await this.instanceRepo.save(this.instanceRepo.create({
      tenantId, templateId: tpl.id, name: tpl.name, triggerEvent: tpl.triggerEvent,
      employeeId: dto.employeeId, employeeName: dto.employeeName, anchorDate: dto.anchorDate,
      status: JourneyStatus.ACTIVE,
    }));
    const steps = await this.stepRepo.save(tpl.steps.map((s) => this.stepRepo.create({
      tenantId, instanceId: instance.id, key: s.key, title: s.title,
      ownerRole: s.ownerRole ?? null, dueDate: addDays(dto.anchorDate, s.offsetDays ?? 0),
      mandatory: s.mandatory !== false, instructions: s.instructions ?? null, status: JourneyStepStatus.PENDING,
    })));
    await this.automation?.emit(tenantId, 'journey.started', {
      instanceId: instance.id, templateId: tpl.id, triggerEvent: tpl.triggerEvent, employeeId: dto.employeeId, steps: steps.length,
    });
    return { instance, steps };
  }

  // ─── Instances & steps ────────────────────────────────────────

  listInstances(tenantId: string, filter: { employeeId?: string; status?: JourneyStatus }): Promise<JourneyInstance[]> {
    const where: any = { tenantId };
    if (filter.employeeId) where.employeeId = filter.employeeId;
    if (filter.status) where.status = filter.status;
    return this.instanceRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getInstance(tenantId: string, id: string): Promise<{ instance: JourneyInstance; steps: JourneyStepInstance[] }> {
    const instance = await this.instanceRepo.findOne({ where: { id, tenantId } });
    if (!instance) throw new NotFoundException(`Journey instance ${id} not found`);
    const steps = await this.stepRepo.find({ where: { tenantId, instanceId: id }, order: { dueDate: 'ASC' } });
    return { instance, steps };
  }

  async completeStep(tenantId: string, stepId: string, ownerUserId?: string): Promise<JourneyStepInstance> {
    return this.setStepStatus(tenantId, stepId, JourneyStepStatus.DONE, ownerUserId);
  }

  async skipStep(tenantId: string, stepId: string): Promise<JourneyStepInstance> {
    const step = await this.stepRepo.findOne({ where: { id: stepId, tenantId } });
    if (!step) throw new NotFoundException(`Journey step ${stepId} not found`);
    if (step.mandatory) throw new BadRequestException('Mandatory steps cannot be skipped');
    return this.setStepStatus(tenantId, stepId, JourneyStepStatus.SKIPPED);
  }

  private async setStepStatus(tenantId: string, stepId: string, status: JourneyStepStatus, ownerUserId?: string): Promise<JourneyStepInstance> {
    const step = await this.stepRepo.findOne({ where: { id: stepId, tenantId } });
    if (!step) throw new NotFoundException(`Journey step ${stepId} not found`);
    step.status = status;
    if (status === JourneyStepStatus.DONE) { step.completedAt = new Date(); if (ownerUserId) step.ownerUserId = ownerUserId; }
    const saved = await this.stepRepo.save(step);
    await this.maybeComplete(tenantId, step.instanceId);
    return saved;
  }

  /** Auto-complete the instance once every mandatory step is done or skipped. */
  private async maybeComplete(tenantId: string, instanceId: string): Promise<void> {
    const instance = await this.instanceRepo.findOne({ where: { id: instanceId, tenantId } });
    if (!instance || instance.status !== JourneyStatus.ACTIVE) return;
    const steps = await this.stepRepo.find({ where: { tenantId, instanceId } });
    const outstanding = steps.filter((s) => s.mandatory && s.status === JourneyStepStatus.PENDING);
    if (outstanding.length) return;
    instance.status = JourneyStatus.COMPLETED;
    instance.completedAt = new Date();
    await this.instanceRepo.save(instance);
    await this.automation?.emit(tenantId, 'journey.completed', {
      instanceId, employeeId: instance.employeeId, triggerEvent: instance.triggerEvent,
    });
  }

  async cancelInstance(tenantId: string, id: string): Promise<JourneyInstance> {
    const instance = await this.instanceRepo.findOne({ where: { id, tenantId } });
    if (!instance) throw new NotFoundException(`Journey instance ${id} not found`);
    if (instance.status === JourneyStatus.COMPLETED) throw new BadRequestException('Completed journeys cannot be cancelled');
    instance.status = JourneyStatus.CANCELLED;
    return this.instanceRepo.save(instance);
  }

  /** Pending steps past their due date across active journeys. */
  async overdueSteps(tenantId: string, asOf: string): Promise<JourneyStepInstance[]> {
    return this.stepRepo.find({ where: { tenantId, status: JourneyStepStatus.PENDING, dueDate: LessThan(asOf) }, order: { dueDate: 'ASC' } });
  }
}
