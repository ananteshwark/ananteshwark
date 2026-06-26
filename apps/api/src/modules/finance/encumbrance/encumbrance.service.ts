import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Encumbrance, EncumbranceType, EncumbranceStatus } from './entities/encumbrance.entity';
import { BudgetLine } from '../budget/entities/budget-line.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type FundsStatus = 'OK' | 'WARNING' | 'EXCEEDED';

export interface FundsCheckResult {
  status: FundsStatus;
  budget: number;
  committed: number;
  obligated: number;
  expended: number;
  available: number;
  requested: number;
}

@Injectable()
export class EncumbranceService {
  constructor(
    @InjectRepository(Encumbrance) private readonly encRepo: Repository<Encumbrance>,
    @InjectRepository(BudgetLine) private readonly budgetLineRepo: Repository<BudgetLine>,
  ) {}

  // ─── Ph-126: Funds check ──────────────────────────────────────────

  /** Sum appropriation (budget lines) for an account/cost-centre/year. */
  private async budgetFor(tenantId: string, glAccountId: string, fiscalYear: number, costCenterId?: string | null): Promise<number> {
    const qb = this.budgetLineRepo
      .createQueryBuilder('bl')
      .where('bl.tenant_id = :tenantId', { tenantId })
      .andWhere('bl.fiscal_year = :fiscalYear', { fiscalYear })
      .andWhere('bl.gl_account_id = :glAccountId', { glAccountId });
    if (costCenterId) qb.andWhere('bl.cost_center_id = :ccId', { ccId: costCenterId });
    const lines = await qb.getMany();
    return round2(lines.reduce((s, l) => s + Number(l.amount), 0));
  }

  /** Outstanding/expended encumbrance buckets for an account/year. */
  private async bucketsFor(tenantId: string, glAccountId: string, fiscalYear: number, costCenterId?: string | null) {
    const where: any = { tenantId, glAccountId, fiscalYear };
    if (costCenterId) where.costCenterId = costCenterId;
    const all = await this.encRepo.find({ where });
    let committed = 0, obligated = 0, expended = 0;
    for (const e of all) {
      const balance = round2(Number(e.amount) - Number(e.liquidatedAmount));
      if (e.type === EncumbranceType.EXPENDITURE) {
        expended = round2(expended + Number(e.amount));
      } else if (e.status === EncumbranceStatus.OUTSTANDING && balance > 0) {
        if (e.type === EncumbranceType.COMMITMENT) committed = round2(committed + balance);
        else if (e.type === EncumbranceType.OBLIGATION) obligated = round2(obligated + balance);
      }
    }
    return { committed, obligated, expended };
  }

  async fundsCheck(tenantId: string, dto: {
    glAccountId: string; fiscalYear: number; amount: number; costCenterId?: string | null;
  }): Promise<FundsCheckResult> {
    const budget = await this.budgetFor(tenantId, dto.glAccountId, dto.fiscalYear, dto.costCenterId);
    const { committed, obligated, expended } = await this.bucketsFor(tenantId, dto.glAccountId, dto.fiscalYear, dto.costCenterId);
    const used = round2(committed + obligated + expended);
    const available = round2(budget - used);
    const requested = round2(dto.amount);

    let status: FundsStatus = 'OK';
    if (budget > 0) {
      const projected = used + requested;
      if (projected > budget) status = 'EXCEEDED';
      else if (projected > budget * 0.9) status = 'WARNING';
    }
    return { status, budget, committed, obligated, expended, available, requested };
  }

  /** Throw when funds are insufficient — used to block PO/requisition approval. */
  async assertFunds(tenantId: string, dto: {
    glAccountId: string; fiscalYear: number; amount: number; costCenterId?: string | null;
  }): Promise<FundsCheckResult> {
    const result = await this.fundsCheck(tenantId, dto);
    if (result.status === 'EXCEEDED') {
      throw new BadRequestException(
        `Insufficient funds: budget ${result.budget}, already used ${round2(result.budget - result.available)}, requested ${result.requested}, available ${result.available}`,
      );
    }
    return result;
  }

  // ─── Ph-125: Commitment creation ──────────────────────────────────

  async createCommitment(tenantId: string, data: {
    sourceType: string; sourceId: string; sourceLineId?: string;
    glAccountId: string; costCenterId?: string; fiscalYear: number; period?: string;
    amount: number; description?: string; enforceFunds?: boolean;
  }): Promise<Encumbrance> {
    if (!data.glAccountId) throw new BadRequestException('glAccountId is required');
    if (!data.amount || data.amount <= 0) throw new BadRequestException('amount must be > 0');
    if (data.enforceFunds) {
      await this.assertFunds(tenantId, {
        glAccountId: data.glAccountId, fiscalYear: data.fiscalYear, amount: data.amount, costCenterId: data.costCenterId,
      });
    }
    const enc = this.encRepo.create({
      tenantId,
      type: EncumbranceType.COMMITMENT,
      status: EncumbranceStatus.OUTSTANDING,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      sourceLineId: data.sourceLineId ?? null,
      glAccountId: data.glAccountId,
      costCenterId: data.costCenterId ?? null,
      fiscalYear: data.fiscalYear,
      period: data.period ?? null,
      amount: round2(data.amount),
      liquidatedAmount: 0,
      description: data.description ?? null,
    } as any) as unknown as Encumbrance;
    return (this.encRepo.save(enc) as unknown) as Promise<Encumbrance>;
  }

  // ─── Ph-127: Liquidation ──────────────────────────────────────────

  /**
   * Liquidate an outstanding encumbrance (or part of it) and create the next
   * lifecycle stage. COMMITMENT → OBLIGATION (on GRN); OBLIGATION → EXPENDITURE
   * (on invoice). Net available funds are unchanged by a liquidation.
   */
  async liquidate(tenantId: string, encumbranceId: string, data: {
    amount: number; nextSourceType: string; nextSourceId: string;
  }): Promise<{ liquidated: Encumbrance; next: Encumbrance | null }> {
    const enc = await this.encRepo.findOne({ where: { id: encumbranceId, tenantId } });
    if (!enc) throw new NotFoundException(`Encumbrance ${encumbranceId} not found`);
    if (enc.type === EncumbranceType.EXPENDITURE) throw new BadRequestException('Expenditures cannot be liquidated');
    if (enc.status === EncumbranceStatus.LIQUIDATED) throw new BadRequestException('Encumbrance already fully liquidated');

    const balance = round2(Number(enc.amount) - Number(enc.liquidatedAmount));
    const amount = round2(data.amount);
    if (amount <= 0) throw new BadRequestException('amount must be > 0');
    if (amount > balance) throw new BadRequestException(`Liquidation ${amount} exceeds outstanding balance ${balance}`);

    enc.liquidatedAmount = round2(Number(enc.liquidatedAmount) + amount);
    if (round2(Number(enc.amount) - Number(enc.liquidatedAmount)) <= 0) {
      enc.status = EncumbranceStatus.LIQUIDATED;
    }
    await this.encRepo.save(enc);

    const nextType = enc.type === EncumbranceType.COMMITMENT
      ? EncumbranceType.OBLIGATION
      : EncumbranceType.EXPENDITURE;

    const next = this.encRepo.create({
      tenantId,
      type: nextType,
      status: nextType === EncumbranceType.EXPENDITURE ? EncumbranceStatus.LIQUIDATED : EncumbranceStatus.OUTSTANDING,
      sourceType: data.nextSourceType,
      sourceId: data.nextSourceId,
      parentId: enc.id,
      glAccountId: enc.glAccountId,
      costCenterId: enc.costCenterId,
      fiscalYear: enc.fiscalYear,
      period: enc.period,
      amount,
      liquidatedAmount: nextType === EncumbranceType.EXPENDITURE ? amount : 0,
      description: `${nextType} from ${enc.type} ${enc.sourceType} ${enc.sourceId}`,
    } as any) as unknown as Encumbrance;
    const saved = (await this.encRepo.save(next)) as unknown as Encumbrance;
    return { liquidated: enc, next: saved };
  }

  /** Liquidate all outstanding commitments for a PO (e.g. on full GRN). */
  async liquidateBySource(tenantId: string, sourceType: string, sourceId: string, nextSourceType: string, nextSourceId: string): Promise<number> {
    const encs = await this.encRepo.find({
      where: { tenantId, sourceType, sourceId, status: EncumbranceStatus.OUTSTANDING },
    });
    let count = 0;
    for (const e of encs) {
      const balance = round2(Number(e.amount) - Number(e.liquidatedAmount));
      if (balance > 0 && e.type !== EncumbranceType.EXPENDITURE) {
        await this.liquidate(tenantId, e.id, { amount: balance, nextSourceType, nextSourceId });
        count++;
      }
    }
    return count;
  }

  // ─── Queries / reporting ──────────────────────────────────────────

  async list(tenantId: string, params: { type?: EncumbranceType; status?: EncumbranceStatus; sourceId?: string } = {}): Promise<Encumbrance[]> {
    const where: any = { tenantId };
    if (params.type) where.type = params.type;
    if (params.status) where.status = params.status;
    if (params.sourceId) where.sourceId = params.sourceId;
    return this.encRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  /** Encumbrance balance report by account for a fiscal year. */
  async balanceReport(tenantId: string, fiscalYear: number): Promise<any[]> {
    const encs = await this.encRepo.find({ where: { tenantId, fiscalYear } });
    const budgetLines = await this.budgetLineRepo.find({ where: { tenantId, fiscalYear } });
    const budgetByAcct = new Map<string, number>();
    for (const bl of budgetLines) {
      if (!bl.glAccountId) continue;
      budgetByAcct.set(bl.glAccountId, round2((budgetByAcct.get(bl.glAccountId) ?? 0) + Number(bl.amount)));
    }
    const rows = new Map<string, any>();
    const ensure = (acct: string) => {
      if (!rows.has(acct)) rows.set(acct, { glAccountId: acct, budget: budgetByAcct.get(acct) ?? 0, committed: 0, obligated: 0, expended: 0 });
      return rows.get(acct);
    };
    for (const acct of budgetByAcct.keys()) ensure(acct);
    for (const e of encs) {
      const row = ensure(e.glAccountId);
      const balance = round2(Number(e.amount) - Number(e.liquidatedAmount));
      if (e.type === EncumbranceType.EXPENDITURE) row.expended = round2(row.expended + Number(e.amount));
      else if (e.status === EncumbranceStatus.OUTSTANDING && balance > 0) {
        if (e.type === EncumbranceType.COMMITMENT) row.committed = round2(row.committed + balance);
        else row.obligated = round2(row.obligated + balance);
      }
    }
    return [...rows.values()].map((r) => ({
      ...r,
      available: round2(r.budget - r.committed - r.obligated - r.expended),
    }));
  }
}
