import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { Account, AccountType, NormalBalance } from './entities/account.entity';
import { CostCenter } from './entities/cost-center.entity';
import { FiscalYear, FiscalYearStatus } from './entities/fiscal-year.entity';
import { AccountingPeriod, PeriodStatus } from './entities/accounting-period.entity';
import {
  JournalEntry,
  JournalSource,
  JournalStatus,
} from './entities/journal-entry.entity';
import { JournalLine } from './entities/journal-line.entity';
import {
  CreateAccountDto,
  UpdateAccountDto,
} from './dto/account.dto';
import { CreateCostCenterDto, UpdateCostCenterDto } from './dto/cost-center.dto';
import {
  CreateFiscalYearDto,
  UpdateFiscalYearDto,
  CreatePeriodDto,
  UpdatePeriodDto,
} from './dto/fiscal-year.dto';
import {
  CreateJournalEntryDto,
  UpdateJournalEntryDto,
  JournalEntryFilterDto,
  JournalLineDto,
} from './dto/journal-entry.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface PostJournalEntryInput {
  date: string;
  description?: string;
  reference?: string;
  source: JournalSource;
  currency?: string;
  periodId?: string;
  lines: JournalLineDto[];
}

@Injectable()
export class GlService {
  constructor(
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(CostCenter)
    private readonly costCenterRepo: Repository<CostCenter>,
    @InjectRepository(FiscalYear)
    private readonly fiscalYearRepo: Repository<FiscalYear>,
    @InjectRepository(AccountingPeriod)
    private readonly periodRepo: Repository<AccountingPeriod>,
    @InjectRepository(JournalEntry)
    private readonly journalRepo: Repository<JournalEntry>,
    @InjectRepository(JournalLine)
    private readonly lineRepo: Repository<JournalLine>,
    private readonly dataSource: DataSource,
  ) {}

  // ---------------------------------------------------------------------------
  // Accounts (Chart of Accounts)
  // ---------------------------------------------------------------------------

  async createAccount(tenantId: string, dto: CreateAccountDto): Promise<Account> {
    const existing = await this.accountRepo.findOne({
      where: { tenantId, code: dto.code },
    });
    if (existing) throw new ConflictException(`Account code ${dto.code} already exists`);

    if (dto.parentId) await this.findAccount(tenantId, dto.parentId);

    const account = this.accountRepo.create({ ...dto, tenantId });
    return this.accountRepo.save(account);
  }

  async findAccounts(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { search?: string; type?: AccountType; isActive?: boolean },
  ): Promise<PaginatedResponseDto<Account>> {
    const { page = 1, limit = 20, sortBy = 'code', sortOrder = 'ASC' } = pagination;
    const qb = this.accountRepo
      .createQueryBuilder('account')
      .where('account.tenantId = :tenantId', { tenantId });

    if (filters?.search) {
      qb.andWhere('(account.code ILIKE :s OR account.name ILIKE :s)', {
        s: `%${filters.search}%`,
      });
    }
    if (filters?.type) qb.andWhere('account.type = :type', { type: filters.type });
    if (filters?.isActive !== undefined)
      qb.andWhere('account.isActive = :active', { active: filters.isActive });

    const validSort = ['code', 'name', 'type', 'createdAt'];
    const orderField = validSort.includes(sortBy) ? sortBy : 'code';
    qb.orderBy(`account.${orderField}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findAccount(tenantId: string, id: string): Promise<Account> {
    const account = await this.accountRepo.findOne({ where: { id, tenantId } });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    return account;
  }

  async getAccountTree(tenantId: string): Promise<any[]> {
    const accounts = await this.accountRepo.find({
      where: { tenantId },
      order: { code: 'ASC' },
    });
    const map = new Map<string, any>();
    accounts.forEach((a) => map.set(a.id, { ...a, children: [] }));
    const roots: any[] = [];
    for (const a of accounts) {
      const node = map.get(a.id);
      if (a.parentId && map.has(a.parentId)) {
        map.get(a.parentId).children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async updateAccount(
    tenantId: string,
    id: string,
    dto: UpdateAccountDto,
  ): Promise<Account> {
    const account = await this.findAccount(tenantId, id);
    if (account.isSystem && dto.isActive === false) {
      throw new BadRequestException('System accounts cannot be deactivated');
    }
    if (dto.parentId) await this.findAccount(tenantId, dto.parentId);
    Object.assign(account, dto);
    return this.accountRepo.save(account);
  }

  // ---------------------------------------------------------------------------
  // Cost Centers
  // ---------------------------------------------------------------------------

  async createCostCenter(
    tenantId: string,
    dto: CreateCostCenterDto,
  ): Promise<CostCenter> {
    const existing = await this.costCenterRepo.findOne({
      where: { tenantId, code: dto.code },
    });
    if (existing) throw new ConflictException(`Cost center code ${dto.code} already exists`);
    const cc = this.costCenterRepo.create({ ...dto, tenantId });
    return this.costCenterRepo.save(cc);
  }

  async findCostCenters(
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<CostCenter>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.costCenterRepo.findAndCount({
      where: { tenantId },
      order: { code: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findCostCenter(tenantId: string, id: string): Promise<CostCenter> {
    const cc = await this.costCenterRepo.findOne({ where: { id, tenantId } });
    if (!cc) throw new NotFoundException(`Cost center ${id} not found`);
    return cc;
  }

  async updateCostCenter(
    tenantId: string,
    id: string,
    dto: UpdateCostCenterDto,
  ): Promise<CostCenter> {
    const cc = await this.findCostCenter(tenantId, id);
    Object.assign(cc, dto);
    return this.costCenterRepo.save(cc);
  }

  // ---------------------------------------------------------------------------
  // Fiscal Years & Periods
  // ---------------------------------------------------------------------------

  async createFiscalYear(
    tenantId: string,
    dto: CreateFiscalYearDto,
  ): Promise<FiscalYear> {
    const fy = this.fiscalYearRepo.create({
      tenantId,
      name: dto.name,
      startDate: dto.startDate,
      endDate: dto.endDate,
      status: FiscalYearStatus.OPEN,
    });
    const saved = await this.fiscalYearRepo.save(fy);

    if (dto.generatePeriods !== false) {
      await this.generateMonthlyPeriods(tenantId, saved);
    }
    return saved;
  }

  private async generateMonthlyPeriods(
    tenantId: string,
    fy: FiscalYear,
  ): Promise<void> {
    const start = new Date(fy.startDate);
    const periods: AccountingPeriod[] = [];
    for (let i = 0; i < 12; i++) {
      const periodStart = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const periodEnd = new Date(start.getFullYear(), start.getMonth() + i + 1, 0);
      const yyyy = periodStart.getFullYear();
      const mm = String(periodStart.getMonth() + 1).padStart(2, '0');
      periods.push(
        this.periodRepo.create({
          tenantId,
          fiscalYearId: fy.id,
          name: `${yyyy}-${mm}`,
          startDate: this.toDateString(periodStart),
          endDate: this.toDateString(periodEnd),
          status: PeriodStatus.OPEN,
        }),
      );
    }
    await this.periodRepo.save(periods);
  }

  private toDateString(d: Date): string {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  async findFiscalYears(tenantId: string): Promise<FiscalYear[]> {
    return this.fiscalYearRepo.find({
      where: { tenantId },
      order: { startDate: 'DESC' },
    });
  }

  async updateFiscalYear(
    tenantId: string,
    id: string,
    dto: UpdateFiscalYearDto,
  ): Promise<FiscalYear> {
    const fy = await this.fiscalYearRepo.findOne({ where: { id, tenantId } });
    if (!fy) throw new NotFoundException(`Fiscal year ${id} not found`);
    Object.assign(fy, dto);
    return this.fiscalYearRepo.save(fy);
  }

  async createPeriod(tenantId: string, dto: CreatePeriodDto): Promise<AccountingPeriod> {
    const fy = await this.fiscalYearRepo.findOne({
      where: { id: dto.fiscalYearId, tenantId },
    });
    if (!fy) throw new NotFoundException('Fiscal year not found');
    const period = this.periodRepo.create({ ...dto, tenantId, status: PeriodStatus.OPEN });
    return this.periodRepo.save(period);
  }

  async findPeriods(
    tenantId: string,
    pagination: PaginationDto,
    fiscalYearId?: string,
  ): Promise<PaginatedResponseDto<AccountingPeriod>> {
    const { page = 1, limit = 50 } = pagination;
    const where: any = { tenantId };
    if (fiscalYearId) where.fiscalYearId = fiscalYearId;
    const [items, total] = await this.periodRepo.findAndCount({
      where,
      order: { startDate: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findPeriod(tenantId: string, id: string): Promise<AccountingPeriod> {
    const period = await this.periodRepo.findOne({ where: { id, tenantId } });
    if (!period) throw new NotFoundException(`Period ${id} not found`);
    return period;
  }

  async updatePeriod(
    tenantId: string,
    id: string,
    dto: UpdatePeriodDto,
  ): Promise<AccountingPeriod> {
    const period = await this.findPeriod(tenantId, id);
    Object.assign(period, dto);
    return this.periodRepo.save(period);
  }

  async closePeriod(tenantId: string, id: string): Promise<AccountingPeriod> {
    const period = await this.findPeriod(tenantId, id);
    if (period.status === PeriodStatus.LOCKED) {
      throw new BadRequestException('Period is locked and cannot be changed');
    }
    // reject if draft entries remain in the period
    const draftCount = await this.journalRepo.count({
      where: { tenantId, periodId: id, status: JournalStatus.DRAFT },
    });
    if (draftCount > 0) {
      throw new BadRequestException(
        `Cannot close period: ${draftCount} draft journal entr${draftCount === 1 ? 'y' : 'ies'} must be posted or deleted first`,
      );
    }
    period.status = PeriodStatus.CLOSED;
    return this.periodRepo.save(period);
  }

  async reopenPeriod(tenantId: string, id: string): Promise<AccountingPeriod> {
    const period = await this.findPeriod(tenantId, id);
    if (period.status === PeriodStatus.LOCKED) {
      throw new BadRequestException('Locked periods cannot be reopened');
    }
    period.status = PeriodStatus.OPEN;
    return this.periodRepo.save(period);
  }

  /** Resolve the period that contains a given date (if any). */
  async resolvePeriodForDate(
    tenantId: string,
    date: string,
  ): Promise<AccountingPeriod | null> {
    return this.periodRepo
      .createQueryBuilder('p')
      .where('p.tenantId = :tenantId', { tenantId })
      .andWhere('p.startDate <= :date AND p.endDate >= :date', { date })
      .getOne();
  }

  private assertPeriodPostable(period: AccountingPeriod | null) {
    if (period && period.status !== PeriodStatus.OPEN) {
      throw new BadRequestException(
        `Accounting period ${period.name} is ${period.status}; postings are not allowed`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Journal Entries
  // ---------------------------------------------------------------------------

  /** Generate the next sequential entry number per tenant (JE-000001). */
  private async nextEntryNumber(
    tenantId: string,
    manager = this.journalRepo.manager,
  ): Promise<string> {
    const row = await manager
      .createQueryBuilder(JournalEntry, 'je')
      .select(
        "MAX(CAST(NULLIF(regexp_replace(je.entry_number, '\\D', '', 'g'), '') AS INTEGER))",
        'max',
      )
      .where('je.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `JE-${String(next).padStart(6, '0')}`;
  }

  /** Validate balance + per-line debit/credit exclusivity. Returns totals. */
  private validateLines(lines: JournalLineDto[]): {
    totalDebit: number;
    totalCredit: number;
  } {
    if (!lines || lines.length < 2) {
      throw new BadRequestException('A journal entry requires at least two lines');
    }
    let totalDebit = 0;
    let totalCredit = 0;
    for (const [i, line] of lines.entries()) {
      const debit = round2(line.debit || 0);
      const credit = round2(line.credit || 0);
      if (debit < 0 || credit < 0) {
        throw new BadRequestException(`Line ${i + 1}: amounts cannot be negative`);
      }
      if (debit > 0 && credit > 0) {
        throw new BadRequestException(
          `Line ${i + 1}: a line must have either a debit or a credit, not both`,
        );
      }
      if (debit === 0 && credit === 0) {
        throw new BadRequestException(`Line ${i + 1}: must have a non-zero debit or credit`);
      }
      totalDebit = round2(totalDebit + debit);
      totalCredit = round2(totalCredit + credit);
    }
    if (round2(totalDebit) !== round2(totalCredit)) {
      throw new BadRequestException(
        `Journal entry is out of balance: debits (${totalDebit.toFixed(2)}) do not equal credits (${totalCredit.toFixed(2)})`,
      );
    }
    return { totalDebit, totalCredit };
  }

  private async validateAccountsExist(
    tenantId: string,
    lines: JournalLineDto[],
  ): Promise<void> {
    const accountIds = [...new Set(lines.map((l) => l.accountId))];
    const found = await this.accountRepo.count({
      where: { id: In(accountIds), tenantId },
    });
    if (found !== accountIds.length) {
      throw new BadRequestException('One or more accounts do not exist in this tenant');
    }
  }

  /** Create a DRAFT journal entry (not posted). */
  async createJournalEntry(
    tenantId: string,
    dto: CreateJournalEntryDto,
  ): Promise<JournalEntry> {
    const { totalDebit, totalCredit } = this.validateLines(dto.lines);
    await this.validateAccountsExist(tenantId, dto.lines);

    let periodId = dto.periodId;
    const period = periodId
      ? await this.findPeriod(tenantId, periodId)
      : await this.resolvePeriodForDate(tenantId, dto.date);
    this.assertPeriodPostable(period);
    periodId = period?.id ?? null;

    return this.dataSource.transaction(async (manager) => {
      const entryNumber = await this.nextEntryNumber(tenantId, manager);
      const entry = manager.create(JournalEntry, {
        tenantId,
        entryNumber,
        date: dto.date,
        periodId,
        description: dto.description,
        reference: dto.reference,
        source: dto.source || JournalSource.MANUAL,
        status: JournalStatus.DRAFT,
        totalDebit,
        totalCredit,
        currency: dto.currency || 'USD',
      });
      const savedEntry = await manager.save(entry);
      await this.persistLines(manager, tenantId, savedEntry.id, dto.lines);
      return this.findJournalEntry(tenantId, savedEntry.id, manager);
    });
  }

  private async persistLines(
    manager: any,
    tenantId: string,
    journalEntryId: string,
    lines: JournalLineDto[],
  ): Promise<void> {
    const entities = lines.map((l, idx) =>
      manager.create(JournalLine, {
        tenantId,
        journalEntryId,
        lineNumber: idx + 1,
        accountId: l.accountId,
        description: l.description,
        debit: round2(l.debit || 0),
        credit: round2(l.credit || 0),
        costCenterId: l.costCenterId || null,
      }),
    );
    await manager.save(entities);
  }

  async findJournalEntries(
    tenantId: string,
    pagination: PaginationDto,
    filters: JournalEntryFilterDto,
  ): Promise<PaginatedResponseDto<JournalEntry>> {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'DESC' } = pagination;
    const qb = this.journalRepo
      .createQueryBuilder('je')
      .where('je.tenantId = :tenantId', { tenantId });

    if (filters.status) qb.andWhere('je.status = :status', { status: filters.status });
    if (filters.source) qb.andWhere('je.source = :source', { source: filters.source });
    if (filters.periodId) qb.andWhere('je.periodId = :periodId', { periodId: filters.periodId });
    if (filters.from) qb.andWhere('je.date >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('je.date <= :to', { to: filters.to });

    const validSort = ['date', 'entryNumber', 'createdAt', 'status'];
    const orderField = validSort.includes(sortBy) ? sortBy : 'date';
    qb.orderBy(`je.${orderField}`, sortOrder)
      .addOrderBy('je.entryNumber', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findJournalEntry(
    tenantId: string,
    id: string,
    manager = this.journalRepo.manager,
  ): Promise<JournalEntry & { lines: JournalLine[] }> {
    const entry = await manager.findOne(JournalEntry, { where: { id, tenantId } });
    if (!entry) throw new NotFoundException(`Journal entry ${id} not found`);
    const lines = await manager.find(JournalLine, {
      where: { journalEntryId: id, tenantId },
      order: { lineNumber: 'ASC' },
    });
    return { ...entry, lines } as JournalEntry & { lines: JournalLine[] };
  }

  async updateJournalEntry(
    tenantId: string,
    id: string,
    dto: UpdateJournalEntryDto,
  ): Promise<JournalEntry> {
    const entry = await this.journalRepo.findOne({ where: { id, tenantId } });
    if (!entry) throw new NotFoundException(`Journal entry ${id} not found`);
    if (entry.status !== JournalStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT journal entries can be edited');
    }

    return this.dataSource.transaction(async (manager) => {
      if (dto.lines) {
        const { totalDebit, totalCredit } = this.validateLines(dto.lines);
        await this.validateAccountsExist(tenantId, dto.lines);
        entry.totalDebit = totalDebit;
        entry.totalCredit = totalCredit;
        await manager.delete(JournalLine, { journalEntryId: id, tenantId });
        await this.persistLines(manager, tenantId, id, dto.lines);
      }
      if (dto.date !== undefined) entry.date = dto.date;
      if (dto.description !== undefined) entry.description = dto.description;
      if (dto.reference !== undefined) entry.reference = dto.reference;
      if (dto.periodId !== undefined) {
        const period = await this.findPeriod(tenantId, dto.periodId);
        this.assertPeriodPostable(period);
        entry.periodId = dto.periodId;
      }
      await manager.save(entry);
      return this.findJournalEntry(tenantId, id, manager);
    });
  }

  async deleteJournalEntry(tenantId: string, id: string): Promise<void> {
    const entry = await this.journalRepo.findOne({ where: { id, tenantId } });
    if (!entry) throw new NotFoundException(`Journal entry ${id} not found`);
    if (entry.status !== JournalStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT journal entries can be deleted');
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(JournalLine, { journalEntryId: id, tenantId });
      await manager.delete(JournalEntry, { id, tenantId });
    });
  }

  /** Post a DRAFT entry: re-validate balance + period, mark POSTED, immutable thereafter. */
  async postJournalEntryById(
    tenantId: string,
    id: string,
    userId: string,
  ): Promise<JournalEntry> {
    return this.dataSource.transaction(async (manager) => {
      const entry = await manager.findOne(JournalEntry, { where: { id, tenantId } });
      if (!entry) throw new NotFoundException(`Journal entry ${id} not found`);
      if (entry.status === JournalStatus.POSTED) {
        throw new BadRequestException('Journal entry is already posted');
      }
      if (entry.status === JournalStatus.REVERSED) {
        throw new BadRequestException('Reversed journal entries cannot be posted');
      }

      const lines = await manager.find(JournalLine, {
        where: { journalEntryId: id, tenantId },
      });
      this.validateLines(
        lines.map((l) => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
        })),
      );

      const period = entry.periodId
        ? await manager.findOne(AccountingPeriod, {
            where: { id: entry.periodId, tenantId },
          })
        : await this.resolvePeriodForDate(tenantId, entry.date);
      this.assertPeriodPostable(period);

      entry.status = JournalStatus.POSTED;
      entry.postedById = userId;
      entry.postedAt = new Date();
      return manager.save(entry);
    });
  }

  /**
   * Reusable posting method for other modules (AR/AP/Bank): creates an
   * already-POSTED journal entry in one shot. Enforces balance + period rules.
   */
  async postJournalEntry(
    tenantId: string,
    input: PostJournalEntryInput,
    userId: string | null,
    manager?: any,
  ): Promise<JournalEntry> {
    const exec = async (m: any): Promise<JournalEntry> => {
      const { totalDebit, totalCredit } = this.validateLines(input.lines);
      await this.validateAccountsExist(tenantId, input.lines);

      const period = input.periodId
        ? await m.findOne(AccountingPeriod, { where: { id: input.periodId, tenantId } })
        : await this.resolvePeriodForDate(tenantId, input.date);
      this.assertPeriodPostable(period);

      const entryNumber = await this.nextEntryNumber(tenantId, m);
      const entry = m.create(JournalEntry, {
        tenantId,
        entryNumber,
        date: input.date,
        periodId: period?.id ?? null,
        description: input.description,
        reference: input.reference,
        source: input.source,
        status: JournalStatus.POSTED,
        totalDebit,
        totalCredit,
        currency: input.currency || 'USD',
        postedById: userId,
        postedAt: new Date(),
      });
      const saved = await m.save(entry);
      await this.persistLines(m, tenantId, saved.id, input.lines);
      return saved;
    };

    if (manager) return exec(manager);
    return this.dataSource.transaction(exec);
  }

  /** Reverse a POSTED entry: create a mirror (swap dr/cr), link both ways. */
  async reverseJournalEntry(
    tenantId: string,
    id: string,
    userId: string,
    reversalDate?: string,
  ): Promise<JournalEntry> {
    return this.dataSource.transaction(async (manager) => {
      const original = await manager.findOne(JournalEntry, { where: { id, tenantId } });
      if (!original) throw new NotFoundException(`Journal entry ${id} not found`);
      if (original.status !== JournalStatus.POSTED) {
        throw new BadRequestException('Only POSTED journal entries can be reversed');
      }

      const lines = await manager.find(JournalLine, {
        where: { journalEntryId: id, tenantId },
        order: { lineNumber: 'ASC' },
      });

      const date = reversalDate || this.toDateString(new Date());
      const period = await this.resolvePeriodForDate(tenantId, date);
      this.assertPeriodPostable(period);

      const entryNumber = await this.nextEntryNumber(tenantId, manager);
      const reversal = manager.create(JournalEntry, {
        tenantId,
        entryNumber,
        date,
        periodId: period?.id ?? original.periodId,
        description: `Reversal of ${original.entryNumber}${
          original.description ? ` - ${original.description}` : ''
        }`,
        reference: original.reference,
        source: original.source,
        status: JournalStatus.POSTED,
        totalDebit: original.totalCredit,
        totalCredit: original.totalDebit,
        currency: original.currency,
        postedById: userId,
        postedAt: new Date(),
        reversedEntryId: original.id,
      });
      const savedReversal = await manager.save(reversal);

      const mirrored = lines.map((l, idx) =>
        manager.create(JournalLine, {
          tenantId,
          journalEntryId: savedReversal.id,
          lineNumber: idx + 1,
          accountId: l.accountId,
          description: l.description,
          debit: l.credit,
          credit: l.debit,
          costCenterId: l.costCenterId,
        }),
      );
      await manager.save(mirrored);

      original.status = JournalStatus.REVERSED;
      original.reversedEntryId = savedReversal.id;
      await manager.save(original);

      return this.findJournalEntry(tenantId, savedReversal.id, manager);
    });
  }

  // ---------------------------------------------------------------------------
  // Balance / reporting helpers (aggregate POSTED lines only)
  // ---------------------------------------------------------------------------

  /** Net balance for an account in its natural sign (debit-normal positive on debit side). */
  async getAccountBalance(
    tenantId: string,
    accountId: string,
    asOfDate?: string,
  ): Promise<number> {
    const account = await this.findAccount(tenantId, accountId);
    const qb = this.lineRepo
      .createQueryBuilder('l')
      .innerJoin(JournalEntry, 'je', 'je.id = l.journal_entry_id')
      .select('COALESCE(SUM(l.debit), 0)', 'debit')
      .addSelect('COALESCE(SUM(l.credit), 0)', 'credit')
      .where('l.tenant_id = :tenantId', { tenantId })
      .andWhere('l.account_id = :accountId', { accountId })
      .andWhere('je.status = :posted', { posted: JournalStatus.POSTED });
    if (asOfDate) qb.andWhere('je.date <= :asOf', { asOf: asOfDate });

    const row = await qb.getRawOne<{ debit: string; credit: string }>();
    const debit = parseFloat(row?.debit || '0');
    const credit = parseFloat(row?.credit || '0');
    return account.normalBalance === NormalBalance.DEBIT
      ? round2(debit - credit)
      : round2(credit - debit);
  }

  /**
   * Trial balance: per-account debit/credit totals from POSTED entries.
   * Filter by periodId OR a date range (from/to) OR asOf.
   */
  async getTrialBalance(
    tenantId: string,
    opts: { periodId?: string; from?: string; to?: string; asOf?: string },
  ): Promise<{
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
  }> {
    const qb = this.lineRepo
      .createQueryBuilder('l')
      .innerJoin(JournalEntry, 'je', 'je.id = l.journal_entry_id')
      .innerJoin(Account, 'a', 'a.id = l.account_id')
      .select('a.id', 'accountId')
      .addSelect('a.code', 'code')
      .addSelect('a.name', 'name')
      .addSelect('a.type', 'type')
      .addSelect('a.normal_balance', 'normalBalance')
      .addSelect('COALESCE(SUM(l.debit), 0)', 'debit')
      .addSelect('COALESCE(SUM(l.credit), 0)', 'credit')
      .where('l.tenant_id = :tenantId', { tenantId })
      .andWhere('je.status = :posted', { posted: JournalStatus.POSTED });

    if (opts.periodId) qb.andWhere('je.period_id = :periodId', { periodId: opts.periodId });
    if (opts.from) qb.andWhere('je.date >= :from', { from: opts.from });
    if (opts.to) qb.andWhere('je.date <= :to', { to: opts.to });
    if (opts.asOf) qb.andWhere('je.date <= :asOf', { asOf: opts.asOf });

    qb.groupBy('a.id')
      .addGroupBy('a.code')
      .addGroupBy('a.name')
      .addGroupBy('a.type')
      .addGroupBy('a.normal_balance')
      .orderBy('a.code', 'ASC');

    const raw = await qb.getRawMany();
    let totalDebit = 0;
    let totalCredit = 0;
    const rows = raw.map((r) => {
      const debitSum = parseFloat(r.debit);
      const creditSum = parseFloat(r.credit);
      const net = round2(debitSum - creditSum);
      // Present net balance on the correct side
      const debit = net > 0 ? net : 0;
      const credit = net < 0 ? Math.abs(net) : 0;
      totalDebit = round2(totalDebit + debit);
      totalCredit = round2(totalCredit + credit);
      return {
        accountId: r.accountId,
        code: r.code,
        name: r.name,
        type: r.type as AccountType,
        debit,
        credit,
      };
    });

    return {
      rows,
      totalDebit,
      totalCredit,
      balanced: round2(totalDebit) === round2(totalCredit),
    };
  }

  // ---------------------------------------------------------------------------
  // Phase 25 — CO-CCA helpers
  // ---------------------------------------------------------------------------

  /**
   * Returns net activity (debit − credit) on all POSTED journal lines for a
   * cost center within a date range.
   */
  async sumLinesByCostCenter(
    tenantId: string,
    costCenterId: string,
    fromDate: string,
    toDate: string,
  ): Promise<number> {
    const result = await this.lineRepo
      .createQueryBuilder('l')
      .innerJoin('fin_journal_entries', 'je', 'je.id = l.journal_entry_id')
      .where('l.tenant_id = :tenantId', { tenantId })
      .andWhere('l.cost_center_id = :costCenterId', { costCenterId })
      .andWhere('je.date >= :fromDate', { fromDate })
      .andWhere('je.date <= :toDate', { toDate })
      .andWhere('je.status = :status', { status: 'POSTED' })
      .select('COALESCE(SUM(l.debit - l.credit), 0)', 'net')
      .getRawOne();
    return parseFloat(result?.net ?? '0');
  }

  /**
   * Returns revenue and expense totals for a profit center within a date range.
   * Revenue = net credit on REVENUE accounts; Expenses = net debit on EXPENSE accounts.
   */
  async sumLinesByProfitCenter(
    tenantId: string,
    profitCenterId: string,
    fromDate: string,
    toDate: string,
  ): Promise<{ revenues: number; expenses: number }> {
    const rows = await this.lineRepo
      .createQueryBuilder('l')
      .innerJoin('fin_journal_entries', 'je', 'je.id = l.journal_entry_id')
      .innerJoin('fin_accounts', 'a', 'a.id = l.account_id')
      .where('l.tenant_id = :tenantId', { tenantId })
      .andWhere('l.profit_center_id = :profitCenterId', { profitCenterId })
      .andWhere('je.date >= :fromDate', { fromDate })
      .andWhere('je.date <= :toDate', { toDate })
      .andWhere('je.status = :status', { status: 'POSTED' })
      .select('a.type', 'type')
      .addSelect('COALESCE(SUM(l.credit - l.debit), 0)', 'net')
      .groupBy('a.type')
      .getRawMany();

    let revenues = 0;
    let expenses = 0;
    for (const r of rows) {
      if (r.type === 'REVENUE') revenues = parseFloat(r.net ?? '0');
      if (r.type === 'EXPENSE') expenses = Math.abs(parseFloat(r.net ?? '0'));
    }
    return { revenues, expenses };
  }
}
