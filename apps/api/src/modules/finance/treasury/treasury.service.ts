import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { CashPosition } from './entities/cash-position.entity';
import { BankGuarantee, BankGuaranteeStatus } from './entities/bank-guarantee.entity';
import { FinancialInstrument, InstrumentStatus } from './entities/financial-instrument.entity';
import { SweepRule, SweepType } from './entities/sweep-rule.entity';
import { SweepLog } from './entities/sweep-log.entity';
import { BankAccount } from '../bank/entities/bank-account.entity';
import { Bill, BillStatus } from '../ap/entities/bill.entity';
import { Invoice, InvoiceStatus } from '../ar/entities/invoice.entity';
import { GlService } from '../gl/gl.service';

@Injectable()
export class TreasuryService {
  constructor(
    @InjectRepository(CashPosition) private readonly cashPositionRepo: Repository<CashPosition>,
    @InjectRepository(BankGuarantee) private readonly guaranteeRepo: Repository<BankGuarantee>,
    @InjectRepository(FinancialInstrument) private readonly instrumentRepo: Repository<FinancialInstrument>,
    @InjectRepository(SweepRule) private readonly sweepRuleRepo: Repository<SweepRule>,
    @InjectRepository(SweepLog) private readonly sweepLogRepo: Repository<SweepLog>,
    @InjectRepository(BankAccount) private readonly bankAccountRepo: Repository<BankAccount>,
    @InjectRepository(Bill) private readonly billRepo: Repository<Bill>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    private readonly glService: GlService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Cash Position ────────────────────────────────────────────────

  async createCashPosition(tenantId: string, dto: any): Promise<CashPosition> {
    const closing = Number(dto.openingBalance) + Number(dto.inflowForecast ?? 0) - Number(dto.outflowForecast ?? 0);
    const entity = this.cashPositionRepo.create({ ...dto, tenantId, closingBalance: closing } as any);
    return (this.cashPositionRepo.save(entity) as unknown) as Promise<CashPosition>;
  }

  async getCashPositions(tenantId: string, params: { bankAccountId?: string; from?: string; to?: string } = {}): Promise<CashPosition[]> {
    const qb = this.cashPositionRepo.createQueryBuilder('cp').where('cp.tenantId = :tenantId', { tenantId });
    if (params.bankAccountId) qb.andWhere('cp.bankAccountId = :bankAccountId', { bankAccountId: params.bankAccountId });
    if (params.from) qb.andWhere('cp.snapshotDate >= :from', { from: params.from });
    if (params.to) qb.andWhere('cp.snapshotDate <= :to', { to: params.to });
    return qb.orderBy('cp.snapshotDate', 'DESC').getMany();
  }

  async getCashPositionSummary(tenantId: string, date: string): Promise<any[]> {
    const positions = await this.cashPositionRepo.find({ where: { tenantId, snapshotDate: date } });
    const accountIds = positions.map(p => p.bankAccountId);
    const accounts = accountIds.length
      ? await this.bankAccountRepo.findByIds(accountIds)
      : [];
    const accountMap = new Map(accounts.map(a => [a.id, a]));

    const byCurrency: Record<string, { currency: string; totalOpening: number; totalClosing: number; accounts: any[] }> = {};
    for (const pos of positions) {
      const acct = accountMap.get(pos.bankAccountId);
      const currency = pos.currency;
      if (!byCurrency[currency]) byCurrency[currency] = { currency, totalOpening: 0, totalClosing: 0, accounts: [] };
      byCurrency[currency].totalOpening += Number(pos.openingBalance);
      byCurrency[currency].totalClosing += Number(pos.closingBalance);
      byCurrency[currency].accounts.push({ ...pos, bankAccountName: acct?.name });
    }
    return Object.values(byCurrency);
  }

  // ─── Bank Guarantees ──────────────────────────────────────────────

  async createGuarantee(tenantId: string, dto: any): Promise<BankGuarantee> {
    const entity = this.guaranteeRepo.create({ ...dto, tenantId } as any);
    return (this.guaranteeRepo.save(entity) as unknown) as Promise<BankGuarantee>;
  }

  async listGuarantees(tenantId: string, status?: BankGuaranteeStatus): Promise<BankGuarantee[]> {
    const where: any = { tenantId };
    if (status) where.status = status;
    return this.guaranteeRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getGuarantee(tenantId: string, id: string): Promise<BankGuarantee> {
    const g = await this.guaranteeRepo.findOne({ where: { id, tenantId } });
    if (!g) throw new NotFoundException(`Bank guarantee ${id} not found`);
    return g;
  }

  async updateGuaranteeStatus(tenantId: string, id: string, dto: { status: BankGuaranteeStatus; claimedAmount?: number }): Promise<BankGuarantee> {
    const g = await this.getGuarantee(tenantId, id);
    if (g.status !== BankGuaranteeStatus.ACTIVE) {
      throw new BadRequestException('Only ACTIVE guarantees can be transitioned');
    }
    g.status = dto.status;
    if (dto.status === BankGuaranteeStatus.CLAIMED) {
      g.claimedAmount = dto.claimedAmount ?? g.amount;
      g.claimedAt = new Date();
    } else if (dto.status === BankGuaranteeStatus.RELEASED) {
      g.releasedAt = new Date();
    }
    return this.guaranteeRepo.save(g);
  }

  // ─── Financial Instruments ────────────────────────────────────────

  async createInstrument(tenantId: string, dto: any): Promise<FinancialInstrument> {
    const entity = this.instrumentRepo.create({ ...dto, tenantId } as any);
    return (this.instrumentRepo.save(entity) as unknown) as Promise<FinancialInstrument>;
  }

  async listInstruments(tenantId: string, params: { status?: InstrumentStatus; type?: string } = {}): Promise<FinancialInstrument[]> {
    const where: any = { tenantId };
    if (params.status) where.status = params.status;
    if (params.type) where.type = params.type;
    return this.instrumentRepo.find({ where, order: { maturityDate: 'ASC' } });
  }

  async getInstrument(tenantId: string, id: string): Promise<FinancialInstrument> {
    const instr = await this.instrumentRepo.findOne({ where: { id, tenantId } });
    if (!instr) throw new NotFoundException(`Financial instrument ${id} not found`);
    return instr;
  }

  async accrueInterest(tenantId: string, id: string): Promise<FinancialInstrument> {
    const instr = await this.getInstrument(tenantId, id);
    if (instr.status !== InstrumentStatus.ACTIVE) {
      throw new BadRequestException('Can only accrue interest on ACTIVE instruments');
    }
    const today = new Date();
    const lastAccrual = instr.interestAccruedAt ?? new Date(instr.purchaseDate);
    const days = Math.max(0, Math.floor((today.getTime() - lastAccrual.getTime()) / 86400000));
    const dailyRate = Number(instr.interestRate) / 365;
    const accrual = Math.round(Number(instr.faceValue) * dailyRate * days * 100) / 100;
    instr.interestAccrued = Number(instr.interestAccrued) + accrual;
    instr.interestAccruedAt = today;

    const maturityDate = new Date(instr.maturityDate);
    if (maturityDate <= today) instr.status = InstrumentStatus.MATURED;

    return this.instrumentRepo.save(instr);
  }

  async redeemInstrument(tenantId: string, id: string): Promise<FinancialInstrument> {
    const instr = await this.getInstrument(tenantId, id);
    if (instr.status === InstrumentStatus.REDEEMED) {
      throw new BadRequestException('Instrument already redeemed');
    }
    instr.status = InstrumentStatus.REDEEMED;
    return this.instrumentRepo.save(instr);
  }

  // ─── Liquidity Forecast ───────────────────────────────────────────

  async getLiquidityForecast(tenantId: string, from: string, to: string, bucket: 'daily' | 'weekly' = 'daily'): Promise<any[]> {
    const [bills, invoices] = await Promise.all([
      this.billRepo.createQueryBuilder('b')
        .where('b.tenantId = :tenantId', { tenantId })
        .andWhere('b.status IN (:...statuses)', { statuses: [BillStatus.OPEN, BillStatus.PARTIAL] })
        .andWhere('b.dueDate >= :from AND b.dueDate <= :to', { from, to })
        .select(['b.dueDate', 'b.balanceDue'])
        .getMany(),
      this.invoiceRepo.createQueryBuilder('i')
        .where('i.tenantId = :tenantId', { tenantId })
        .andWhere('i.status IN (:...statuses)', { statuses: [InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE] })
        .andWhere('i.dueDate >= :from AND i.dueDate <= :to', { from, to })
        .select(['i.dueDate', 'i.balanceDue'])
        .getMany(),
    ]);

    const bucketKey = (date: string): string => {
      if (bucket === 'daily') return date;
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d.setDate(diff));
      return monday.toISOString().split('T')[0];
    };

    const map = new Map<string, { date: string; payables: number; receivables: number }>();

    for (const b of bills) {
      const key = bucketKey(b.dueDate);
      if (!map.has(key)) map.set(key, { date: key, payables: 0, receivables: 0 });
      map.get(key)!.payables += Number(b.balanceDue);
    }
    for (const inv of invoices) {
      const key = bucketKey(inv.dueDate);
      if (!map.has(key)) map.set(key, { date: key, payables: 0, receivables: 0 });
      map.get(key)!.receivables += Number(inv.balanceDue);
    }

    return Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(row => ({ ...row, net: row.receivables - row.payables }));
  }

  // ─── Sweep Rules & Cash Concentration ────────────────────────────

  async createSweepRule(tenantId: string, dto: any): Promise<SweepRule> {
    const entity = this.sweepRuleRepo.create({ ...dto, tenantId } as any);
    return (this.sweepRuleRepo.save(entity) as unknown) as Promise<SweepRule>;
  }

  async listSweepRules(tenantId: string): Promise<SweepRule[]> {
    return this.sweepRuleRepo.find({ where: { tenantId }, order: { createdAt: 'ASC' } });
  }

  async updateSweepRule(tenantId: string, id: string, dto: any): Promise<SweepRule> {
    const rule = await this.sweepRuleRepo.findOne({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`Sweep rule ${id} not found`);
    Object.assign(rule, dto);
    return this.sweepRuleRepo.save(rule);
  }

  async executeSweep(tenantId: string, ruleId: string, userId?: string): Promise<SweepLog> {
    const rule = await this.sweepRuleRepo.findOne({ where: { id: ruleId, tenantId } });
    if (!rule) throw new NotFoundException(`Sweep rule ${ruleId} not found`);
    if (!rule.isActive) throw new BadRequestException('Sweep rule is inactive');

    const [sourceAcct, targetAcct] = await Promise.all([
      this.bankAccountRepo.findOne({ where: { id: rule.sourceAccountId } }),
      this.bankAccountRepo.findOne({ where: { id: rule.targetAccountId } }),
    ]);
    if (!sourceAcct || !targetAcct) throw new NotFoundException('Bank account not found');

    const sourceBal = Number(sourceAcct.currentBalance);
    const target = rule.sweepType === SweepType.ZERO_BALANCE ? 0 : Number(rule.targetBalance);
    const transferAmount = Math.max(0, sourceBal - target);

    if (transferAmount <= 0) {
      throw new BadRequestException('No amount to sweep (source balance at or below target)');
    }

    const log = await this.dataSource.transaction(async (mgr) => {
      sourceAcct.currentBalance = sourceBal - transferAmount;
      targetAcct.currentBalance = Number(targetAcct.currentBalance) + transferAmount;
      await mgr.save(sourceAcct);
      await mgr.save(targetAcct);

      rule.lastRunAt = new Date();
      await mgr.save(rule);

      const sweepLog = mgr.create(SweepLog, {
        tenantId,
        sweepRuleId: ruleId,
        runAt: new Date(),
        amountTransferred: transferAmount,
        currency: sourceAcct.currency ?? 'USD',
        sourceBalanceBefore: sourceBal,
        sourceBalanceAfter: sourceAcct.currentBalance,
      } as any);
      return mgr.save(sweepLog);
    });

    return (log as unknown) as SweepLog;
  }

  async getSweepLogs(tenantId: string, ruleId?: string): Promise<SweepLog[]> {
    const where: any = { tenantId };
    if (ruleId) where.sweepRuleId = ruleId;
    return this.sweepLogRepo.find({ where, order: { runAt: 'DESC' } });
  }
}
