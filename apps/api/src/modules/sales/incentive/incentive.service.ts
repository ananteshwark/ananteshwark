import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IcPlan } from './entities/ic-plan.entity';
import { IcTransaction, IcTransactionStatus } from './entities/ic-transaction.entity';
import { IcDispute, DisputeStatus } from './entities/ic-dispute.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class IncentiveService {
  constructor(
    @InjectRepository(IcPlan) private readonly planRepo: Repository<IcPlan>,
    @InjectRepository(IcTransaction) private readonly txnRepo: Repository<IcTransaction>,
    @InjectRepository(IcDispute) private readonly disputeRepo: Repository<IcDispute>,
  ) {}

  // ─── Ph-225: compensation plans ───────────────────────────────────

  listPlans(tenantId: string): Promise<IcPlan[]> {
    return this.planRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async createPlan(tenantId: string, data: Partial<IcPlan>): Promise<IcPlan> {
    if (!data.code?.trim() || !data.name?.trim()) throw new BadRequestException('code and name are required');
    if (!data.tiers?.length) throw new BadRequestException('at least one attainment tier is required');
    const dup = await this.planRepo.findOne({ where: { tenantId, code: data.code } });
    if (dup) throw new BadRequestException('Plan code already exists');
    const p = this.planRepo.create({
      tenantId, code: data.code, name: data.name, tiers: data.tiers,
      accelerators: data.accelerators ?? [], capAmount: data.capAmount ?? null,
      drawAmount: data.drawAmount ?? 0, currency: data.currency ?? 'INR', isActive: true,
    } as any) as unknown as IcPlan;
    return (this.planRepo.save(p) as unknown) as Promise<IcPlan>;
  }

  // ─── Ph-226: commission calculation ───────────────────────────────

  /** Select the tier rate for an attainment %. Falls back to the top tier. */
  private rateForAttainment(plan: IcPlan, attainmentPct: number): number {
    const tier = (plan.tiers ?? []).find((t) => attainmentPct >= t.fromPct && attainmentPct < t.toPct);
    if (tier) return Number(tier.rate);
    // Above all bands → use the highest-band rate.
    const top = [...(plan.tiers ?? [])].sort((a, b) => b.fromPct - a.fromPct)[0];
    return top ? Number(top.rate) : 0;
  }

  /**
   * Calculate a commission transaction: tier rate × booking × credit split ×
   * product accelerator, capped, with the recoverable draw deducted.
   */
  async calculate(tenantId: string, data: {
    planId: string; repId: string; period: string; bookingAmount: number; attainmentPct: number;
    creditPct?: number; productFamily?: string;
  }): Promise<IcTransaction> {
    const plan = await this.planRepo.findOne({ where: { id: data.planId, tenantId } });
    if (!plan) throw new NotFoundException('Plan not found');
    if (!/^\d{4}-\d{2}$/.test(data.period ?? '')) throw new BadRequestException('period must be YYYY-MM');
    if (data.bookingAmount == null || data.bookingAmount < 0) throw new BadRequestException('bookingAmount must be >= 0');
    const creditPct = data.creditPct ?? 100;
    if (creditPct < 0 || creditPct > 100) throw new BadRequestException('creditPct must be 0..100');

    const rate = this.rateForAttainment(plan, Number(data.attainmentPct));
    const accel = (plan.accelerators ?? []).find((a) => data.productFamily && a.productFamily === data.productFamily);
    const acceleratorMult = accel ? Number(accel.multiplier) : 1;
    let gross = round2(Number(data.bookingAmount) * rate * (creditPct / 100) * acceleratorMult);
    if (plan.capAmount != null) gross = Math.min(gross, Number(plan.capAmount));
    const drawRecovered = Math.min(gross, Number(plan.drawAmount));
    const netPayable = round2(gross - drawRecovered);

    const txn = this.txnRepo.create({
      tenantId, planId: data.planId, repId: data.repId, period: data.period,
      bookingAmount: data.bookingAmount, attainmentPct: data.attainmentPct, creditPct,
      appliedRate: rate, acceleratorMult, grossCommission: gross, drawRecovered, netPayable,
      productFamily: data.productFamily ?? null, status: IcTransactionStatus.CALCULATED,
    } as any) as unknown as IcTransaction;
    return (this.txnRepo.save(txn) as unknown) as Promise<IcTransaction>;
  }

  listTransactions(tenantId: string, filters: { repId?: string; period?: string; status?: IcTransactionStatus } = {}): Promise<IcTransaction[]> {
    const where: any = { tenantId };
    if (filters.repId) where.repId = filters.repId;
    if (filters.period) where.period = filters.period;
    if (filters.status) where.status = filters.status;
    return this.txnRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async approveTransaction(tenantId: string, id: string): Promise<IcTransaction> {
    const txn = await this.getTxn(tenantId, id);
    if (txn.status !== IcTransactionStatus.CALCULATED) throw new BadRequestException('Only CALCULATED transactions can be approved');
    txn.status = IcTransactionStatus.APPROVED;
    return (this.txnRepo.save(txn) as unknown) as Promise<IcTransaction>;
  }

  // ─── Ph-227: dispute management ───────────────────────────────────

  async raiseDispute(tenantId: string, data: { transactionId: string; repId: string; reason: string }): Promise<IcDispute> {
    const txn = await this.getTxn(tenantId, data.transactionId);
    if (txn.status === IcTransactionStatus.PAID) throw new BadRequestException('Cannot dispute a paid transaction');
    if (!data.reason?.trim()) throw new BadRequestException('reason is required');
    txn.status = IcTransactionStatus.DISPUTED;
    await this.txnRepo.save(txn);
    const d = this.disputeRepo.create({
      tenantId, transactionId: data.transactionId, repId: data.repId, reason: data.reason,
      status: DisputeStatus.OPEN, adjustmentAmount: 0, reviewedBy: null, resolutionNotes: null,
    } as any) as unknown as IcDispute;
    return (this.disputeRepo.save(d) as unknown) as Promise<IcDispute>;
  }

  /**
   * Resolve a dispute: APPROVE applies an adjustment to the transaction's net
   * payable and re-approves it; REJECT restores the prior CALCULATED state.
   */
  async resolveDispute(tenantId: string, id: string, userId: string, data: { decision: 'APPROVE' | 'REJECT'; adjustmentAmount?: number; notes?: string }): Promise<IcDispute> {
    const dispute = await this.disputeRepo.findOne({ where: { id, tenantId } });
    if (!dispute) throw new NotFoundException('Dispute not found');
    if (dispute.status !== DisputeStatus.OPEN) throw new BadRequestException('Dispute already resolved');
    const txn = await this.getTxn(tenantId, dispute.transactionId);
    if (data.decision === 'APPROVE') {
      const adj = Number(data.adjustmentAmount ?? 0);
      dispute.status = DisputeStatus.RESOLVED;
      dispute.adjustmentAmount = adj;
      txn.netPayable = round2(Number(txn.netPayable) + adj);
      txn.grossCommission = round2(Number(txn.grossCommission) + adj);
      txn.status = IcTransactionStatus.APPROVED;
    } else {
      dispute.status = DisputeStatus.REJECTED;
      txn.status = IcTransactionStatus.CALCULATED;
    }
    dispute.reviewedBy = userId;
    dispute.resolutionNotes = data.notes ?? null;
    await this.txnRepo.save(txn);
    return (this.disputeRepo.save(dispute) as unknown) as Promise<IcDispute>;
  }

  // ─── Ph-228: payroll integration ──────────────────────────────────

  /**
   * Export approved commissions for a period as payroll elements and mark them
   * PAID.
   */
  async exportToPayroll(tenantId: string, period: string): Promise<any> {
    const txns = await this.txnRepo.find({ where: { tenantId, period, status: IcTransactionStatus.APPROVED } });
    const byRep = new Map<string, number>();
    for (const t of txns) byRep.set(t.repId, round2((byRep.get(t.repId) ?? 0) + Number(t.netPayable)));
    for (const t of txns) { t.status = IcTransactionStatus.PAID; await this.txnRepo.save(t); }
    const elements = [...byRep.entries()].map(([repId, amount]) => ({ repId, element: 'COMMISSION', period, amount }));
    return { period, exported: elements.length, totalAmount: round2(elements.reduce((s, e) => s + e.amount, 0)), elements };
  }

  private async getTxn(tenantId: string, id: string): Promise<IcTransaction> {
    const txn = await this.txnRepo.findOne({ where: { id, tenantId } });
    if (!txn) throw new NotFoundException(`Transaction ${id} not found`);
    return txn;
  }
}
