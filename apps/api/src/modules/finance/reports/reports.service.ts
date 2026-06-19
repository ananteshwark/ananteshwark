import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GlService } from '../gl/gl.service';
import { JournalLine } from '../gl/entities/journal-line.entity';
import { JournalEntry, JournalStatus } from '../gl/entities/journal-entry.entity';
import { Account, AccountType } from '../gl/entities/account.entity';

export interface TrialBalanceResult {
  rows: Array<{
    accountId: string;
    code: string;
    name: string;
    type: AccountType;
    debit: number;
    credit: number;
  }>;
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

export interface ReportLine {
  accountId: string;
  code: string;
  name: string;
  amount: number;
}

export interface ProfitAndLossResult {
  from: string;
  to: string;
  incomeLines: ReportLine[];
  expenseLines: ReportLine[];
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
}

export interface BalanceSheetSection {
  lines: ReportLine[];
  total: number;
}

export interface BalanceSheetResult {
  asOf: string;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
}

export interface GlDetailLine {
  date: string;
  entryNumber: string;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface GlDetailResult {
  accountId: string;
  from: string;
  to: string;
  lines: GlDetailLine[];
  openingBalance: number;
  closingBalance: number;
}

export interface CashFlowResult {
  from: string;
  to: string;
  operatingActivities: {
    netIncome: number;
    total: number;
  };
  total: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(JournalLine) private readonly lineRepo: Repository<JournalLine>,
    @InjectRepository(JournalEntry) private readonly journalRepo: Repository<JournalEntry>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    private readonly glService: GlService,
  ) {}

  async getTrialBalance(
    tenantId: string,
    opts: { periodId?: string; from?: string; to?: string; asOf?: string },
  ): Promise<TrialBalanceResult> {
    return this.glService.getTrialBalance(tenantId, opts);
  }

  async getProfitAndLoss(
    tenantId: string,
    opts: { from: string; to: string; periodId?: string },
  ): Promise<ProfitAndLossResult> {
    const { from, to } = opts;

    const qb = this.lineRepo
      .createQueryBuilder('l')
      .innerJoin(JournalEntry, 'je', 'je.id = l.journal_entry_id')
      .innerJoin(Account, 'a', 'a.id = l.account_id')
      .select('a.id', 'accountId')
      .addSelect('a.code', 'code')
      .addSelect('a.name', 'name')
      .addSelect('a.type', 'type')
      .addSelect('COALESCE(SUM(l.debit), 0)', 'totalDebit')
      .addSelect('COALESCE(SUM(l.credit), 0)', 'totalCredit')
      .where('l.tenant_id = :tenantId', { tenantId })
      .andWhere('je.status = :posted', { posted: JournalStatus.POSTED })
      .andWhere('je.date >= :from', { from })
      .andWhere('je.date <= :to', { to })
      .andWhere('a.type IN (:...types)', { types: [AccountType.INCOME, AccountType.EXPENSE] })
      .groupBy('a.id')
      .addGroupBy('a.code')
      .addGroupBy('a.name')
      .addGroupBy('a.type')
      .orderBy('a.code', 'ASC');

    if (opts.periodId) {
      qb.andWhere('je.period_id = :periodId', { periodId: opts.periodId });
    }

    const raw = await qb.getRawMany<{
      accountId: string;
      code: string;
      name: string;
      type: AccountType;
      totalDebit: string;
      totalCredit: string;
    }>();

    const incomeLines: ReportLine[] = [];
    const expenseLines: ReportLine[] = [];

    for (const r of raw) {
      const debit = parseFloat(r.totalDebit);
      const credit = parseFloat(r.totalCredit);

      if (r.type === AccountType.INCOME) {
        // Revenue = credit - debit (net credit balance)
        incomeLines.push({
          accountId: r.accountId,
          code: r.code,
          name: r.name,
          amount: round2(credit - debit),
        });
      } else if (r.type === AccountType.EXPENSE) {
        // Expense = debit - credit (net debit balance)
        expenseLines.push({
          accountId: r.accountId,
          code: r.code,
          name: r.name,
          amount: round2(debit - credit),
        });
      }
    }

    const totalIncome = round2(incomeLines.reduce((sum, l) => sum + l.amount, 0));
    const totalExpenses = round2(expenseLines.reduce((sum, l) => sum + l.amount, 0));
    const netIncome = round2(totalIncome - totalExpenses);

    return { from, to, incomeLines, expenseLines, totalIncome, totalExpenses, netIncome };
  }

  async getBalanceSheet(
    tenantId: string,
    opts: { asOf: string },
  ): Promise<BalanceSheetResult> {
    const { asOf } = opts;

    const qb = this.lineRepo
      .createQueryBuilder('l')
      .innerJoin(JournalEntry, 'je', 'je.id = l.journal_entry_id')
      .innerJoin(Account, 'a', 'a.id = l.account_id')
      .select('a.id', 'accountId')
      .addSelect('a.code', 'code')
      .addSelect('a.name', 'name')
      .addSelect('a.type', 'type')
      .addSelect('COALESCE(SUM(l.debit), 0)', 'totalDebit')
      .addSelect('COALESCE(SUM(l.credit), 0)', 'totalCredit')
      .where('l.tenant_id = :tenantId', { tenantId })
      .andWhere('je.status = :posted', { posted: JournalStatus.POSTED })
      .andWhere('je.date <= :asOf', { asOf })
      .andWhere('a.type IN (:...types)', {
        types: [AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY],
      })
      .groupBy('a.id')
      .addGroupBy('a.code')
      .addGroupBy('a.name')
      .addGroupBy('a.type')
      .orderBy('a.code', 'ASC');

    const raw = await qb.getRawMany<{
      accountId: string;
      code: string;
      name: string;
      type: AccountType;
      totalDebit: string;
      totalCredit: string;
    }>();

    const assetLines: ReportLine[] = [];
    const liabilityLines: ReportLine[] = [];
    const equityLines: ReportLine[] = [];

    for (const r of raw) {
      const debit = parseFloat(r.totalDebit);
      const credit = parseFloat(r.totalCredit);

      if (r.type === AccountType.ASSET) {
        // Assets: debit - credit (debit-normal)
        assetLines.push({
          accountId: r.accountId,
          code: r.code,
          name: r.name,
          amount: round2(debit - credit),
        });
      } else if (r.type === AccountType.LIABILITY) {
        // Liabilities: credit - debit (credit-normal)
        liabilityLines.push({
          accountId: r.accountId,
          code: r.code,
          name: r.name,
          amount: round2(credit - debit),
        });
      } else if (r.type === AccountType.EQUITY) {
        // Equity: credit - debit (credit-normal)
        equityLines.push({
          accountId: r.accountId,
          code: r.code,
          name: r.name,
          amount: round2(credit - debit),
        });
      }
    }

    const assetTotal = round2(assetLines.reduce((sum, l) => sum + l.amount, 0));
    const liabilityTotal = round2(liabilityLines.reduce((sum, l) => sum + l.amount, 0));
    const equityTotal = round2(equityLines.reduce((sum, l) => sum + l.amount, 0));

    return {
      asOf,
      assets: { lines: assetLines, total: assetTotal },
      liabilities: { lines: liabilityLines, total: liabilityTotal },
      equity: { lines: equityLines, total: equityTotal },
    };
  }

  async getGlDetail(
    tenantId: string,
    opts: { accountId: string; from: string; to: string; periodId?: string },
  ): Promise<GlDetailResult> {
    const { accountId, from, to } = opts;

    // Get opening balance (all posted lines before 'from')
    const openingBalance = await this.glService.getAccountBalance(
      tenantId,
      accountId,
      // Day before 'from': subtract 1 day
      (() => {
        const d = new Date(from);
        d.setDate(d.getDate() - 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      })(),
    );

    const qb = this.lineRepo
      .createQueryBuilder('l')
      .innerJoin(JournalEntry, 'je', 'je.id = l.journal_entry_id')
      .select('je.date', 'date')
      .addSelect('je.entry_number', 'entryNumber')
      .addSelect('COALESCE(l.description, je.description, \'\')', 'description')
      .addSelect('l.debit', 'debit')
      .addSelect('l.credit', 'credit')
      .where('l.tenant_id = :tenantId', { tenantId })
      .andWhere('l.account_id = :accountId', { accountId })
      .andWhere('je.status = :posted', { posted: JournalStatus.POSTED })
      .andWhere('je.date >= :from', { from })
      .andWhere('je.date <= :to', { to })
      .orderBy('je.date', 'ASC')
      .addOrderBy('je.entry_number', 'ASC');

    if (opts.periodId) {
      qb.andWhere('je.period_id = :periodId', { periodId: opts.periodId });
    }

    const raw = await qb.getRawMany<{
      date: string;
      entryNumber: string;
      description: string;
      debit: string;
      credit: string;
    }>();

    let runningBalance = openingBalance;
    const lines: GlDetailLine[] = raw.map((r) => {
      const debit = parseFloat(r.debit || '0');
      const credit = parseFloat(r.credit || '0');
      runningBalance = round2(runningBalance + debit - credit);
      return {
        date: r.date,
        entryNumber: r.entryNumber,
        description: r.description,
        debit,
        credit,
        runningBalance,
      };
    });

    const closingBalance = lines.length > 0 ? lines[lines.length - 1].runningBalance : openingBalance;

    return { accountId, from, to, lines, openingBalance, closingBalance };
  }

  async getCashFlow(
    tenantId: string,
    opts: { from: string; to: string },
  ): Promise<CashFlowResult> {
    const { from, to } = opts;

    const qb = this.lineRepo
      .createQueryBuilder('l')
      .innerJoin(JournalEntry, 'je', 'je.id = l.journal_entry_id')
      .innerJoin(Account, 'a', 'a.id = l.account_id')
      .select('a.type', 'type')
      .addSelect('COALESCE(SUM(l.debit), 0)', 'totalDebit')
      .addSelect('COALESCE(SUM(l.credit), 0)', 'totalCredit')
      .where('l.tenant_id = :tenantId', { tenantId })
      .andWhere('je.status = :posted', { posted: JournalStatus.POSTED })
      .andWhere('je.date >= :from', { from })
      .andWhere('je.date <= :to', { to })
      .andWhere('a.type IN (:...types)', { types: [AccountType.INCOME, AccountType.EXPENSE] })
      .groupBy('a.type');

    const raw = await qb.getRawMany<{
      type: AccountType;
      totalDebit: string;
      totalCredit: string;
    }>();

    let totalIncome = 0;
    let totalExpenses = 0;

    for (const r of raw) {
      const debit = parseFloat(r.totalDebit);
      const credit = parseFloat(r.totalCredit);
      if (r.type === AccountType.INCOME) {
        totalIncome = round2(credit - debit);
      } else if (r.type === AccountType.EXPENSE) {
        totalExpenses = round2(debit - credit);
      }
    }

    const netIncome = round2(totalIncome - totalExpenses);
    const operatingTotal = netIncome;

    return {
      from,
      to,
      operatingActivities: {
        netIncome,
        total: operatingTotal,
      },
      total: operatingTotal,
    };
  }
}
