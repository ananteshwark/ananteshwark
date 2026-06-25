import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ledger, AccountingPrinciple } from './entities/ledger.entity';
import { LedgerGroup } from './entities/ledger-group.entity';
import { LedgerPostingRule } from './entities/ledger-posting-rule.entity';
import { JournalEntry, JournalStatus, JournalSource } from '../gl/entities/journal-entry.entity';
import { AccountingPeriod } from '../gl/entities/accounting-period.entity';
import { ReportsService } from '../reports/reports.service';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ReconciliationRow {
  accountId: string;
  code: string;
  name: string;
  balances: Record<string, number>;
  differences: Record<string, number>;
  hasDifference: boolean;
}

@Injectable()
export class LedgersService {
  constructor(
    @InjectRepository(Ledger) private readonly ledgerRepo: Repository<Ledger>,
    @InjectRepository(LedgerGroup) private readonly groupRepo: Repository<LedgerGroup>,
    @InjectRepository(LedgerPostingRule) private readonly ruleRepo: Repository<LedgerPostingRule>,
    @InjectRepository(JournalEntry) private readonly journalRepo: Repository<JournalEntry>,
    @InjectRepository(AccountingPeriod) private readonly periodRepo: Repository<AccountingPeriod>,
    private readonly reportsService: ReportsService,
  ) {}

  // ─── Ledgers ────────────────────────────────────────────────────────────────

  async listLedgers(tenantId: string): Promise<Ledger[]> {
    return this.ledgerRepo.find({ where: { tenantId }, order: { isLeading: 'DESC', code: 'ASC' } });
  }

  async createLedger(tenantId: string, dto: Partial<Ledger>): Promise<Ledger> {
    if (!dto.code) throw new BadRequestException('Ledger code is required');
    const existing = await this.ledgerRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new BadRequestException(`Ledger ${dto.code} already exists`);
    if (dto.isLeading) await this.clearLeading(tenantId);
    const ledger = this.ledgerRepo.create({ ...dto, tenantId } as any);
    return (this.ledgerRepo.save(ledger) as unknown) as Promise<Ledger>;
  }

  async updateLedger(tenantId: string, id: string, dto: Partial<Ledger>): Promise<Ledger> {
    const ledger = await this.ledgerRepo.findOne({ where: { id, tenantId } });
    if (!ledger) throw new NotFoundException(`Ledger ${id} not found`);
    if (dto.isLeading && !ledger.isLeading) await this.clearLeading(tenantId);
    Object.assign(ledger, dto);
    return this.ledgerRepo.save(ledger);
  }

  private async clearLeading(tenantId: string): Promise<void> {
    await this.ledgerRepo.update({ tenantId, isLeading: true }, { isLeading: false });
  }

  /** Seed the standard MAIN (leading) + IFRS + TAX parallel ledgers. */
  async seedDefaultLedgers(tenantId: string): Promise<Ledger[]> {
    const defaults: Partial<Ledger>[] = [
      { code: 'MAIN', name: 'Leading Ledger (Local GAAP)', accountingPrinciple: AccountingPrinciple.LOCAL_GAAP, isLeading: true },
      { code: 'IFRS', name: 'IFRS Ledger', accountingPrinciple: AccountingPrinciple.IFRS, isLeading: false },
      { code: 'TAX', name: 'Tax Ledger', accountingPrinciple: AccountingPrinciple.TAX, isLeading: false },
    ];
    const created: Ledger[] = [];
    for (const d of defaults) {
      const existing = await this.ledgerRepo.findOne({ where: { tenantId, code: d.code } });
      if (existing) { created.push(existing); continue; }
      const l = this.ledgerRepo.create({ ...d, tenantId } as any);
      created.push((await this.ledgerRepo.save(l)) as unknown as Ledger);
    }
    return created;
  }

  // ─── Ledger groups ──────────────────────────────────────────────────────────

  async listGroups(tenantId: string): Promise<LedgerGroup[]> {
    return this.groupRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }

  async getGroup(tenantId: string, code: string): Promise<LedgerGroup> {
    const group = await this.groupRepo.findOne({ where: { tenantId, code } });
    if (!group) throw new NotFoundException(`Ledger group ${code} not found`);
    return group;
  }

  async createGroup(tenantId: string, dto: Partial<LedgerGroup>): Promise<LedgerGroup> {
    if (!dto.code) throw new BadRequestException('Group code is required');
    const existing = await this.groupRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new BadRequestException(`Ledger group ${dto.code} already exists`);
    const members = dto.memberLedgers ?? [];
    const group = this.groupRepo.create({
      ...dto,
      tenantId,
      memberLedgers: members,
      leadingLedger: dto.leadingLedger ?? members[0] ?? null,
    } as any);
    return (this.groupRepo.save(group) as unknown) as Promise<LedgerGroup>;
  }

  async updateGroup(tenantId: string, id: string, dto: Partial<LedgerGroup>): Promise<LedgerGroup> {
    const group = await this.groupRepo.findOne({ where: { id, tenantId } });
    if (!group) throw new NotFoundException(`Ledger group ${id} not found`);
    Object.assign(group, dto);
    if (dto.memberLedgers && !dto.leadingLedger && !group.leadingLedger) {
      group.leadingLedger = dto.memberLedgers[0] ?? null;
    }
    return this.groupRepo.save(group);
  }

  // ─── Posting rules ──────────────────────────────────────────────────────────

  async listPostingRules(tenantId: string): Promise<LedgerPostingRule[]> {
    return this.ruleRepo.find({ where: { tenantId }, order: { source: 'ASC' } });
  }

  async upsertPostingRule(
    tenantId: string,
    dto: { source: JournalSource; ledgerCodes: string[]; description?: string; isActive?: boolean },
  ): Promise<LedgerPostingRule> {
    let rule = await this.ruleRepo.findOne({ where: { tenantId, source: dto.source } });
    if (!rule) {
      rule = this.ruleRepo.create({ tenantId, source: dto.source } as any) as unknown as LedgerPostingRule;
    }
    rule.ledgerCodes = dto.ledgerCodes ?? [];
    if (dto.description !== undefined) rule.description = dto.description;
    if (dto.isActive !== undefined) rule.isActive = dto.isActive;
    return this.ruleRepo.save(rule);
  }

  /**
   * Resolve which ledger codes a source posts into. Falls back to the leading
   * ledger (or 'MAIN') when no active rule is configured.
   */
  async resolveLedgersForSource(tenantId: string, source: JournalSource): Promise<string[]> {
    const rule = await this.ruleRepo.findOne({ where: { tenantId, source, isActive: true } });
    if (rule && rule.ledgerCodes?.length) return rule.ledgerCodes;
    const leading = await this.ledgerRepo.findOne({ where: { tenantId, isLeading: true } });
    return [leading?.code ?? 'MAIN'];
  }

  // ─── Ledger-filtered reports ──────────────────────────────────────────────────

  async getTrialBalance(tenantId: string, ledgerCode: string, opts: { periodId?: string; from?: string; to?: string; asOf?: string }) {
    return this.reportsService.getTrialBalance(tenantId, { ...opts, ledgerCode });
  }

  async getProfitAndLoss(tenantId: string, ledgerCode: string, opts: { from: string; to: string; periodId?: string }) {
    return this.reportsService.getProfitAndLoss(tenantId, { ...opts, ledgerCode });
  }

  async getBalanceSheet(tenantId: string, ledgerCode: string, opts: { asOf: string }) {
    return this.reportsService.getBalanceSheet(tenantId, { ...opts, ledgerCode });
  }

  // ─── Reconciliation matrix ────────────────────────────────────────────────────

  /**
   * Build a per-account matrix of net balances across all member ledgers of a
   * group, with differences relative to the group's leading ledger.
   */
  async getReconciliationMatrix(
    tenantId: string,
    groupCode: string,
    opts: { periodId?: string; from?: string; to?: string; asOf?: string },
  ): Promise<{
    group: string;
    leadingLedger: string;
    ledgers: string[];
    rows: ReconciliationRow[];
    totals: Record<string, number>;
    differenceTotals: Record<string, number>;
    inBalance: boolean;
  }> {
    const group = await this.getGroup(tenantId, groupCode);
    const ledgers = group.memberLedgers ?? [];
    if (ledgers.length === 0) {
      throw new BadRequestException(`Ledger group ${groupCode} has no member ledgers`);
    }
    const leading = group.leadingLedger ?? ledgers[0];

    // accountId -> { code, name, balances per ledger }
    const accounts = new Map<string, { code: string; name: string; balances: Record<string, number> }>();
    const totals: Record<string, number> = {};

    for (const code of ledgers) {
      totals[code] = 0;
      const tb = await this.reportsService.getTrialBalance(tenantId, { ...opts, ledgerCode: code });
      for (const r of tb.rows) {
        const net = round2(Number(r.debit) - Number(r.credit));
        let acct = accounts.get(r.accountId);
        if (!acct) {
          acct = { code: r.code, name: r.name, balances: {} };
          accounts.set(r.accountId, acct);
        }
        acct.balances[code] = net;
        totals[code] = round2(totals[code] + net);
      }
    }

    const rows: ReconciliationRow[] = [];
    const differenceTotals: Record<string, number> = {};
    for (const code of ledgers) if (code !== leading) differenceTotals[code] = 0;

    for (const [accountId, acct] of accounts) {
      const balances: Record<string, number> = {};
      const differences: Record<string, number> = {};
      const leadingNet = acct.balances[leading] ?? 0;
      let hasDifference = false;
      for (const code of ledgers) {
        const net = acct.balances[code] ?? 0;
        balances[code] = net;
        if (code !== leading) {
          const diff = round2(net - leadingNet);
          differences[code] = diff;
          differenceTotals[code] = round2(differenceTotals[code] + diff);
          if (Math.abs(diff) >= 0.01) hasDifference = true;
        }
      }
      rows.push({ accountId, code: acct.code, name: acct.name, balances, differences, hasDifference });
    }

    rows.sort((a, b) => a.code.localeCompare(b.code));
    const inBalance = Object.values(differenceTotals).every((d) => Math.abs(d) < 0.01);

    return { group: groupCode, leadingLedger: leading, ledgers, rows, totals, differenceTotals, inBalance };
  }

  // ─── Group period-close cockpit ───────────────────────────────────────────────

  /** Run a close checklist for each member ledger of a group within a period. */
  async getGroupCloseCockpit(
    tenantId: string,
    groupCode: string,
    periodId: string,
  ): Promise<{
    group: string;
    period: AccountingPeriod;
    ledgers: Array<{
      ledgerCode: string;
      draftCount: number;
      balanced: boolean;
      totalDebit: number;
      totalCredit: number;
      canClose: boolean;
    }>;
    canCloseAll: boolean;
  }> {
    const group = await this.getGroup(tenantId, groupCode);
    const period = await this.periodRepo.findOne({ where: { id: periodId, tenantId } });
    if (!period) throw new NotFoundException(`Period ${periodId} not found`);

    const ledgers: any[] = [];
    for (const code of group.memberLedgers ?? []) {
      const draftCount = await this.journalRepo.count({
        where: { tenantId, periodId, status: JournalStatus.DRAFT, ledgerCode: code },
      });
      const tb = await this.reportsService.getTrialBalance(tenantId, { periodId, ledgerCode: code });
      const balanced = Math.abs(round2(tb.totalDebit - tb.totalCredit)) < 0.01;
      ledgers.push({
        ledgerCode: code,
        draftCount,
        balanced,
        totalDebit: tb.totalDebit,
        totalCredit: tb.totalCredit,
        canClose: draftCount === 0 && balanced,
      });
    }

    return {
      group: groupCode,
      period,
      ledgers,
      canCloseAll: ledgers.every((l) => l.canClose),
    };
  }
}
