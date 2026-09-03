import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { ConsolidationGroup } from './entities/consolidation-group.entity';
import {
  ConsolidationRun,
  ConsolidationRunStatus,
} from './entities/consolidation-run.entity';
import { JournalEntry, JournalStatus } from '../gl/entities/journal-entry.entity';
import { JournalLine } from '../gl/entities/journal-line.entity';
import { Account, AccountType } from '../gl/entities/account.entity';
import { IntercompanyService } from '../intercompany/intercompany.service';
import {
  CreateConsolidationGroupDto,
  UpdateConsolidationGroupDto,
  RunConsolidationDto,
} from './dto/consolidation.dto';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class ConsolidationService {
  constructor(
    @InjectRepository(ConsolidationGroup)
    private readonly groupRepo: Repository<ConsolidationGroup>,
    @InjectRepository(ConsolidationRun)
    private readonly runRepo: Repository<ConsolidationRun>,
    @InjectRepository(JournalEntry)
    private readonly journalRepo: Repository<JournalEntry>,
    @InjectRepository(JournalLine)
    private readonly lineRepo: Repository<JournalLine>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    private readonly intercompanyService: IntercompanyService,
  ) {}

  // ─── Groups ─────────────────────────────────────────────────────────────────

  listGroups(tenantId: string): Promise<ConsolidationGroup[]> {
    return this.groupRepo.find({
      where: { tenantId },
      order: { name: 'ASC' },
    });
  }

  async getGroup(tenantId: string, id: string): Promise<ConsolidationGroup> {
    const group = await this.groupRepo.findOne({ where: { id, tenantId } });
    if (!group) throw new NotFoundException(`Consolidation group ${id} not found`);
    return group;
  }

  async createGroup(
    tenantId: string,
    dto: CreateConsolidationGroupDto,
  ): Promise<ConsolidationGroup> {
    const existing = await this.groupRepo.findOne({
      where: { tenantId, code: dto.code },
    });
    if (existing) throw new BadRequestException(`Group code "${dto.code}" already exists`);

    const group = this.groupRepo.create({
      tenantId,
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      reportingCurrency: dto.reportingCurrency ?? 'USD',
      memberEntityIds: dto.memberEntityIds,
      isActive: true,
    });
    return this.groupRepo.save(group);
  }

  async updateGroup(
    tenantId: string,
    id: string,
    dto: UpdateConsolidationGroupDto,
  ): Promise<ConsolidationGroup> {
    const group = await this.getGroup(tenantId, id);
    if (dto.name !== undefined) group.name = dto.name;
    if (dto.description !== undefined) group.description = dto.description;
    if (dto.memberEntityIds !== undefined) group.memberEntityIds = dto.memberEntityIds;
    if (dto.isActive !== undefined) group.isActive = dto.isActive;
    return this.groupRepo.save(group);
  }

  listRuns(tenantId: string, groupId?: string): Promise<ConsolidationRun[]> {
    const where: any = { tenantId };
    if (groupId) where.groupId = groupId;
    return this.runRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async getRun(tenantId: string, id: string): Promise<ConsolidationRun> {
    const run = await this.runRepo.findOne({ where: { id, tenantId } });
    if (!run) throw new NotFoundException(`Consolidation run ${id} not found`);
    return run;
  }

  // ─── Run Consolidation ──────────────────────────────────────────────────────

  async runConsolidation(
    tenantId: string,
    dto: RunConsolidationDto,
    userId: string,
  ): Promise<ConsolidationRun> {
    const group = await this.getGroup(tenantId, dto.groupId);
    if (!group.isActive) throw new BadRequestException('Group is inactive');
    if (!group.memberEntityIds?.length) {
      throw new BadRequestException('Group has no member entities');
    }

    const run = await this.runRepo.save(
      this.runRepo.create({
        tenantId,
        groupId: group.id,
        groupName: group.name,
        periodStart: dto.periodStart,
        periodEnd: dto.periodEnd,
        status: ConsolidationRunStatus.RUNNING,
        runById: userId,
        resultJson: null,
        errorMessage: null,
      }),
    );

    try {
      const result = await this.computeConsolidation(
        tenantId,
        group,
        dto.periodStart,
        dto.periodEnd,
      );

      run.totalRevenue = result.totals.revenue;
      run.totalExpenses = result.totals.expenses;
      run.netIncome = result.totals.netIncome;
      run.totalAssets = result.totals.assets;
      run.totalLiabilities = result.totals.liabilities;
      run.totalEquity = result.totals.equity;
      run.icEliminations = result.totals.icEliminations;
      run.resultJson = result;
      run.status = ConsolidationRunStatus.COMPLETED;
    } catch (err) {
      run.status = ConsolidationRunStatus.FAILED;
      run.errorMessage = err instanceof Error ? err.message : String(err);
    }

    return this.runRepo.save(run);
  }

  private async computeConsolidation(
    tenantId: string,
    group: ConsolidationGroup,
    periodStart: string,
    periodEnd: string,
  ) {
    // Load all posted journal entries in the period for this tenant
    const entries = await this.journalRepo.find({
      where: {
        tenantId,
        status: JournalStatus.POSTED,
        date: Between(periodStart, periodEnd),
      },
    });

    if (!entries.length) {
      return this.emptyResult(group, periodStart, periodEnd);
    }

    const entryIds = entries.map((e) => e.id);

    // Load all lines for these entries
    const lines = await this.lineRepo
      .createQueryBuilder('l')
      .where('l.tenant_id = :tenantId', { tenantId })
      .andWhere('l.journal_entry_id IN (:...ids)', { ids: entryIds })
      .getMany();

    // Load all accounts once
    const accounts = await this.accountRepo.find({ where: { tenantId } });
    const accountMap = new Map(accounts.map((a) => [a.id, a]));

    // Aggregate net debit/credit per account
    const accountTotals = new Map<string, { debit: number; credit: number }>();
    for (const line of lines) {
      const cur = accountTotals.get(line.accountId) ?? { debit: 0, credit: 0 };
      cur.debit = round2(cur.debit + Number(line.debit));
      cur.credit = round2(cur.credit + Number(line.credit));
      accountTotals.set(line.accountId, cur);
    }

    // Get IC eliminations
    const icRecon = await this.intercompanyService.getReconciliation(tenantId);
    const icEliminations = round2(Math.abs(icRecon.summary.totalIcAr));

    // Build account-level summary grouped by type
    const byType: Record<AccountType, { accountId: string; name: string; code: string; net: number }[]> = {
      [AccountType.ASSET]: [],
      [AccountType.LIABILITY]: [],
      [AccountType.EQUITY]: [],
      [AccountType.INCOME]: [],
      [AccountType.EXPENSE]: [],
    };

    for (const [accountId, totals] of accountTotals) {
      const account = accountMap.get(accountId);
      if (!account) continue;
      const net = round2(totals.debit - totals.credit);
      byType[account.type].push({
        accountId,
        name: account.name,
        code: account.code,
        net,
      });
    }

    // P&L
    const totalRevenue = round2(
      byType[AccountType.INCOME].reduce((s, a) => s + Math.abs(a.net), 0),
    );
    const totalExpenses = round2(
      byType[AccountType.EXPENSE].reduce((s, a) => s + Math.abs(a.net), 0),
    );
    const netIncome = round2(totalRevenue - totalExpenses);

    // Balance Sheet
    const totalAssets = round2(
      byType[AccountType.ASSET].reduce((s, a) => s + a.net, 0),
    );
    const totalLiabilities = round2(
      byType[AccountType.LIABILITY].reduce((s, a) => s + Math.abs(a.net), 0),
    );
    const totalEquity = round2(
      byType[AccountType.EQUITY].reduce((s, a) => s + Math.abs(a.net), 0),
    );

    return {
      groupId: group.id,
      groupName: group.name,
      memberEntityIds: group.memberEntityIds,
      periodStart,
      periodEnd,
      totals: {
        revenue: totalRevenue,
        expenses: totalExpenses,
        netIncome,
        assets: totalAssets,
        liabilities: totalLiabilities,
        equity: totalEquity,
        icEliminations,
      },
      icReconciliation: icRecon.summary,
      byType: {
        income: byType[AccountType.INCOME],
        expense: byType[AccountType.EXPENSE],
        asset: byType[AccountType.ASSET],
        liability: byType[AccountType.LIABILITY],
        equity: byType[AccountType.EQUITY],
      },
    };
  }

  private emptyResult(group: ConsolidationGroup, periodStart: string, periodEnd: string) {
    return {
      groupId: group.id,
      groupName: group.name,
      memberEntityIds: group.memberEntityIds,
      periodStart,
      periodEnd,
      totals: {
        revenue: 0,
        expenses: 0,
        netIncome: 0,
        assets: 0,
        liabilities: 0,
        equity: 0,
        icEliminations: 0,
      },
      icReconciliation: { totalIcAr: 0, totalIcAp: 0, netDifference: 0, imbalancedPairs: 0 },
      byType: { income: [], expense: [], asset: [], liability: [], equity: [] },
    };
  }
}
