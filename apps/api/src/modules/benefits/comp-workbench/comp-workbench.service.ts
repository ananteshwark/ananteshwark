import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompBudget, AwardType } from './entities/comp-budget.entity';
import { CompAward, AwardStatus } from './entities/comp-award.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Manager → HR → Finance approval chain. */
const APPROVAL_FLOW: Record<string, AwardStatus> = {
  [AwardStatus.SUBMITTED]: AwardStatus.HR_REVIEW,
  [AwardStatus.HR_REVIEW]: AwardStatus.FINANCE_REVIEW,
  [AwardStatus.FINANCE_REVIEW]: AwardStatus.APPROVED,
};

@Injectable()
export class CompWorkbenchService {
  constructor(
    @InjectRepository(CompBudget) private readonly budgetRepo: Repository<CompBudget>,
    @InjectRepository(CompAward) private readonly awardRepo: Repository<CompAward>,
  ) {}

  // ─── Ph-182: budget envelopes ─────────────────────────────────────

  listBudgets(tenantId: string, cycleId?: string): Promise<CompBudget[]> {
    const where: any = { tenantId };
    if (cycleId) where.cycleId = cycleId;
    return this.budgetRepo.find({ where, order: { createdAt: 'ASC' } });
  }

  async createBudget(tenantId: string, data: {
    cycleId: string; orgUnitId: string; awardType: AwardType; budgetAmount: number; currency?: string;
  }): Promise<CompBudget> {
    if (!data.cycleId || !data.orgUnitId) throw new BadRequestException('cycleId and orgUnitId are required');
    if (data.budgetAmount == null || data.budgetAmount < 0) throw new BadRequestException('budgetAmount must be >= 0');
    const dup = await this.budgetRepo.findOne({ where: { tenantId, cycleId: data.cycleId, orgUnitId: data.orgUnitId, awardType: data.awardType } });
    if (dup) throw new BadRequestException('Budget envelope already exists for this org unit + award type');
    const b = this.budgetRepo.create({
      tenantId, cycleId: data.cycleId, orgUnitId: data.orgUnitId, awardType: data.awardType,
      budgetAmount: data.budgetAmount, allocatedAmount: 0, currency: data.currency ?? 'USD',
    } as any) as unknown as CompBudget;
    return (this.budgetRepo.save(b) as unknown) as Promise<CompBudget>;
  }

  // ─── Ph-183: worksheet (awards) ───────────────────────────────────

  async listAwards(tenantId: string, cycleId: string): Promise<CompAward[]> {
    return this.awardRepo.find({ where: { tenantId, cycleId }, order: { currentSalary: 'DESC' } });
  }

  /**
   * Propose an award; blocks if it would exceed the org-unit/award-type budget
   * envelope. Reserves the amount against the envelope.
   */
  async proposeAward(tenantId: string, data: {
    cycleId: string; budgetId: string; employeeId: string; awardType: AwardType;
    currentSalary?: number; performanceRating?: string; amount: number; notes?: string;
  }): Promise<CompAward> {
    const budget = await this.budgetRepo.findOne({ where: { id: data.budgetId, tenantId } });
    if (!budget) throw new NotFoundException(`Budget ${data.budgetId} not found`);
    if (!data.amount || data.amount <= 0) throw new BadRequestException('amount must be > 0');
    const remaining = round2(Number(budget.budgetAmount) - Number(budget.allocatedAmount));
    if (data.amount > remaining) {
      throw new BadRequestException(`Award ${data.amount} exceeds remaining budget ${remaining} for this envelope`);
    }
    const award = (await this.awardRepo.save(this.awardRepo.create({
      tenantId, cycleId: data.cycleId, budgetId: data.budgetId, employeeId: data.employeeId,
      orgUnitId: budget.orgUnitId, awardType: data.awardType, currentSalary: data.currentSalary ?? 0,
      performanceRating: data.performanceRating ?? null, amount: data.amount, status: AwardStatus.DRAFT,
      approvalHistory: [], notes: data.notes ?? null,
    } as any))) as unknown as CompAward;

    budget.allocatedAmount = round2(Number(budget.allocatedAmount) + data.amount);
    await this.budgetRepo.save(budget);
    return award;
  }

  async updateAward(tenantId: string, id: string, amount: number): Promise<CompAward> {
    const award = await this.getAward(tenantId, id);
    if (![AwardStatus.DRAFT, AwardStatus.REJECTED].includes(award.status)) {
      throw new BadRequestException('Only DRAFT/REJECTED awards can be edited');
    }
    const budget = await this.budgetRepo.findOne({ where: { id: award.budgetId, tenantId } });
    if (!budget) throw new NotFoundException('Budget not found');
    const others = round2(Number(budget.allocatedAmount) - Number(award.amount));
    const remaining = round2(Number(budget.budgetAmount) - others);
    if (amount > remaining) throw new BadRequestException(`Award ${amount} exceeds remaining budget ${remaining}`);
    budget.allocatedAmount = round2(others + amount);
    await this.budgetRepo.save(budget);
    award.amount = round2(amount);
    return (this.awardRepo.save(award) as unknown) as Promise<CompAward>;
  }

  // ─── Ph-184: approval workflow ────────────────────────────────────

  async submit(tenantId: string, id: string, userId: string): Promise<CompAward> {
    const award = await this.getAward(tenantId, id);
    if (![AwardStatus.DRAFT, AwardStatus.REJECTED].includes(award.status)) {
      throw new BadRequestException('Only DRAFT/REJECTED awards can be submitted');
    }
    award.status = AwardStatus.SUBMITTED;
    award.approvalHistory = [...(award.approvalHistory ?? []), { stage: 'SUBMIT', userId, action: 'submitted', at: new Date().toISOString() }];
    return (this.awardRepo.save(award) as unknown) as Promise<CompAward>;
  }

  async approve(tenantId: string, id: string, userId: string): Promise<CompAward> {
    const award = await this.getAward(tenantId, id);
    const next = APPROVAL_FLOW[award.status];
    if (!next) throw new BadRequestException(`Cannot approve an award in status ${award.status}`);
    award.status = next;
    award.approvalHistory = [...(award.approvalHistory ?? []), { stage: award.status, userId, action: 'approved', at: new Date().toISOString() }];
    return (this.awardRepo.save(award) as unknown) as Promise<CompAward>;
  }

  async reject(tenantId: string, id: string, userId: string, reason?: string): Promise<CompAward> {
    const award = await this.getAward(tenantId, id);
    if (![AwardStatus.SUBMITTED, AwardStatus.HR_REVIEW, AwardStatus.FINANCE_REVIEW].includes(award.status)) {
      throw new BadRequestException('Only in-review awards can be rejected');
    }
    award.status = AwardStatus.REJECTED;
    award.notes = reason ?? award.notes;
    award.approvalHistory = [...(award.approvalHistory ?? []), { stage: 'REJECT', userId, action: 'rejected', at: new Date().toISOString() }];
    return (this.awardRepo.save(award) as unknown) as Promise<CompAward>;
  }

  // ─── Ph-185: salary change execution ──────────────────────────────

  /**
   * Execute an APPROVED merit award into an assignment change record (id passed
   * in by the HR assignment service). Locks the award by recording the link.
   */
  async execute(tenantId: string, id: string, assignmentChangeId: string): Promise<CompAward> {
    const award = await this.getAward(tenantId, id);
    if (award.status !== AwardStatus.APPROVED) throw new BadRequestException('Only APPROVED awards can be executed');
    if (award.assignmentChangeId) throw new BadRequestException('Award already executed');
    award.assignmentChangeId = assignmentChangeId;
    return (this.awardRepo.save(award) as unknown) as Promise<CompAward>;
  }

  // ─── Ph-186: total compensation statement ─────────────────────────

  /**
   * Total compensation statement for an employee: base salary (cash) + approved
   * awards by type + employer benefit contributions (passed in).
   */
  async totalCompStatement(tenantId: string, employeeId: string, baseSalary = 0, employerBenefits = 0): Promise<any> {
    const awards = await this.awardRepo.find({ where: { tenantId, employeeId, status: AwardStatus.APPROVED } });
    const byType: Record<string, number> = { MERIT: 0, BONUS: 0, EQUITY: 0 };
    for (const a of awards) byType[a.awardType] = round2((byType[a.awardType] ?? 0) + Number(a.amount));
    const cash = round2(baseSalary + byType.MERIT + byType.BONUS);
    const total = round2(cash + byType.EQUITY + employerBenefits);
    return {
      employeeId,
      baseSalary: round2(baseSalary),
      meritIncrease: byType.MERIT,
      bonus: byType.BONUS,
      equityValue: byType.EQUITY,
      employerBenefits: round2(employerBenefits),
      totalCash: cash,
      totalCompensation: total,
    };
  }

  private async getAward(tenantId: string, id: string): Promise<CompAward> {
    const award = await this.awardRepo.findOne({ where: { id, tenantId } });
    if (!award) throw new NotFoundException(`Award ${id} not found`);
    return award;
  }
}
