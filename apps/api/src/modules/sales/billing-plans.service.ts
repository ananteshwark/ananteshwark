import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BillingPlan, BillingMilestoneStatus, BillingPlanType } from './entities/billing-plan.entity';

@Injectable()
export class BillingPlansService {
  constructor(
    @InjectRepository(BillingPlan)
    private readonly planRepo: Repository<BillingPlan>,
  ) {}

  async createBillingPlan(tenantId: string, dto: any): Promise<BillingPlan> {
    if (!dto.salesOrderId) throw new BadRequestException('salesOrderId is required');
    if (!dto.orderTotal) throw new BadRequestException('orderTotal is required');

    const milestones = (dto.milestones ?? []).map((m: any, i: number) => ({
      milestoneNumber: i + 1,
      description: m.description ?? `Milestone ${i + 1}`,
      billingDate: m.billingDate,
      percentage: m.percentage,
      amount: (Number(dto.orderTotal) * m.percentage) / 100,
      status: BillingMilestoneStatus.PENDING,
    }));

    const totalPct = milestones.reduce((s: number, m: any) => s + m.percentage, 0);
    if (milestones.length > 0 && Math.abs(totalPct - 100) > 0.01) {
      throw new BadRequestException(`Milestone percentages must sum to 100 (got ${totalPct})`);
    }

    const plan = this.planRepo.create({
      tenantId,
      salesOrderId: dto.salesOrderId,
      orderTotal: dto.orderTotal,
      planType: dto.planType ?? BillingPlanType.MILESTONE,
      milestones,
      notes: dto.notes ?? null,
    });
    return this.planRepo.save(plan);
  }

  async getBillingPlan(tenantId: string, salesOrderId: string): Promise<BillingPlan | null> {
    return this.planRepo.findOne({ where: { tenantId, salesOrderId } });
  }

  async getBillingPlanById(tenantId: string, id: string): Promise<BillingPlan> {
    const plan = await this.planRepo.findOne({ where: { id, tenantId } });
    if (!plan) throw new NotFoundException(`Billing plan ${id} not found`);
    return plan;
  }

  async listBillingPlans(tenantId: string): Promise<BillingPlan[]> {
    return this.planRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async billMilestone(
    tenantId: string,
    planId: string,
    milestoneNumber: number,
    invoiceId?: string,
  ): Promise<BillingPlan> {
    const plan = await this.getBillingPlanById(tenantId, planId);
    const milestone = plan.milestones.find(m => m.milestoneNumber === milestoneNumber);
    if (!milestone) throw new NotFoundException(`Milestone ${milestoneNumber} not found`);
    if (milestone.status !== BillingMilestoneStatus.PENDING) {
      throw new BadRequestException(`Milestone ${milestoneNumber} is already ${milestone.status}`);
    }
    milestone.status = BillingMilestoneStatus.BILLED;
    if (invoiceId) milestone.invoiceId = invoiceId;
    plan.milestones = [...plan.milestones];
    return this.planRepo.save(plan);
  }

  async markMilestonePaid(
    tenantId: string,
    planId: string,
    milestoneNumber: number,
  ): Promise<BillingPlan> {
    const plan = await this.getBillingPlanById(tenantId, planId);
    const milestone = plan.milestones.find(m => m.milestoneNumber === milestoneNumber);
    if (!milestone) throw new NotFoundException(`Milestone ${milestoneNumber} not found`);
    milestone.status = BillingMilestoneStatus.PAID;
    plan.milestones = [...plan.milestones];
    return this.planRepo.save(plan);
  }

  async getUpcomingBillings(tenantId: string, daysAhead = 30): Promise<any[]> {
    const plans = await this.planRepo.find({ where: { tenantId } });
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysAhead);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    const upcoming: any[] = [];
    for (const plan of plans) {
      for (const m of plan.milestones) {
        if (m.status === BillingMilestoneStatus.PENDING && m.billingDate >= today && m.billingDate <= cutoffStr) {
          upcoming.push({
            planId: plan.id,
            salesOrderId: plan.salesOrderId,
            milestoneNumber: m.milestoneNumber,
            description: m.description,
            billingDate: m.billingDate,
            amount: m.amount,
            percentage: m.percentage,
          });
        }
      }
    }
    return upcoming.sort((a, b) => a.billingDate.localeCompare(b.billingDate));
  }
}
