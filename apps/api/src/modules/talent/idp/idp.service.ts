import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdpPlan, IdpItem, IdpStatus, IdpItemStatus, IdpItemType } from './idp.entity';

@Injectable()
export class IdpService {
  constructor(
    @InjectRepository(IdpPlan) private readonly planRepo: Repository<IdpPlan>,
    @InjectRepository(IdpItem) private readonly itemRepo: Repository<IdpItem>,
  ) {}

  async createPlan(
    tenantId: string, createdByUserId: string,
    dto: { employeeId: string; title: string; aspiration?: string; targetDate?: string },
  ): Promise<IdpPlan> {
    if (!dto.employeeId || !dto.title?.trim()) {
      throw new BadRequestException('employeeId and title are required');
    }
    return this.planRepo.save(this.planRepo.create({
      tenantId,
      employeeId: dto.employeeId,
      title: dto.title.trim(),
      aspiration: dto.aspiration ?? null,
      targetDate: dto.targetDate ?? null,
      status: IdpStatus.DRAFT,
      createdByUserId,
    }));
  }

  async listPlans(tenantId: string, employeeId?: string): Promise<IdpPlan[]> {
    const where: any = { tenantId };
    if (employeeId) where.employeeId = employeeId;
    return this.planRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getPlan(tenantId: string, id: string): Promise<IdpPlan & { items: IdpItem[]; progressPct: number }> {
    const plan = await this.planRepo.findOne({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException(`Development plan ${id} not found`);
    const items = await this.itemRepo.find({ where: { tenantId, planId: id }, order: { createdAt: 'ASC' } });
    const done = items.filter((i) => i.status === IdpItemStatus.DONE).length;
    const progressPct = items.length ? Math.round((done / items.length) * 100) : 0;
    return { ...plan, items, progressPct };
  }

  async addItem(
    tenantId: string, planId: string,
    dto: { itemType?: IdpItemType; title: string; description?: string; courseId?: string; skillId?: string; dueDate?: string },
  ): Promise<IdpItem> {
    const plan = await this.planRepo.findOne({ where: { id: planId, tenantId } });
    if (!plan) throw new NotFoundException(`Development plan ${planId} not found`);
    if (plan.status === IdpStatus.COMPLETED || plan.status === IdpStatus.CANCELLED) {
      throw new BadRequestException(`Items cannot be added to a ${plan.status} plan`);
    }
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    return this.itemRepo.save(this.itemRepo.create({
      tenantId,
      planId,
      itemType: dto.itemType ?? IdpItemType.OTHER,
      title: dto.title.trim(),
      description: dto.description ?? null,
      courseId: dto.courseId ?? null,
      skillId: dto.skillId ?? null,
      dueDate: dto.dueDate ?? null,
    }));
  }

  async updateItemStatus(tenantId: string, itemId: string, status: IdpItemStatus, notes?: string): Promise<IdpItem> {
    const item = await this.itemRepo.findOne({ where: { id: itemId, tenantId } });
    if (!item) throw new NotFoundException(`Development item ${itemId} not found`);
    if (!Object.values(IdpItemStatus).includes(status)) {
      throw new BadRequestException(`status must be one of ${Object.values(IdpItemStatus).join(', ')}`);
    }
    item.status = status;
    if (notes !== undefined) item.notes = notes?.trim() || null;
    return this.itemRepo.save(item);
  }

  async activatePlan(tenantId: string, id: string): Promise<IdpPlan> {
    const plan = await this.planRepo.findOne({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException(`Development plan ${id} not found`);
    if (plan.status !== IdpStatus.DRAFT) throw new BadRequestException('Only DRAFT plans can be activated');
    const items = await this.itemRepo.count({ where: { tenantId, planId: id } });
    if (!items) throw new BadRequestException('Add at least one development item before activating');
    plan.status = IdpStatus.ACTIVE;
    return this.planRepo.save(plan);
  }

  async completePlan(tenantId: string, id: string): Promise<IdpPlan> {
    const plan = await this.planRepo.findOne({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException(`Development plan ${id} not found`);
    if (plan.status !== IdpStatus.ACTIVE) throw new BadRequestException('Only ACTIVE plans can be completed');
    const open = await this.itemRepo.count({
      where: { tenantId, planId: id, status: IdpItemStatus.NOT_STARTED },
    });
    if (open) throw new BadRequestException(`${open} item(s) have not been started — finish or remove them first`);
    plan.status = IdpStatus.COMPLETED;
    return this.planRepo.save(plan);
  }
}
