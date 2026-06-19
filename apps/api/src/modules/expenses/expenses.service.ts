import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExpenseCategory } from './entities/expense-category.entity';
import { ExpenseClaim, ExpenseClaimStatus } from './entities/expense-claim.entity';
import { ExpenseLine } from './entities/expense-line.entity';
import { ExpensePolicy } from './entities/expense-policy.entity';
import { PaginationDto, PaginatedResponseDto } from '../../common/dto/pagination.dto';
import { GlService } from '../finance/gl/gl.service';
import { JournalSource } from '../finance/gl/entities/journal-entry.entity';

@Injectable()
export class ExpensesService {
  constructor(
    @InjectRepository(ExpenseCategory)
    private readonly categoryRepo: Repository<ExpenseCategory>,
    @InjectRepository(ExpenseClaim)
    private readonly claimRepo: Repository<ExpenseClaim>,
    @InjectRepository(ExpenseLine)
    private readonly lineRepo: Repository<ExpenseLine>,
    @InjectRepository(ExpensePolicy)
    private readonly policyRepo: Repository<ExpensePolicy>,
    private readonly glService: GlService,
  ) {}

  // ─── Categories ───────────────────────────────────────────────

  async createCategory(tenantId: string, dto: Partial<ExpenseCategory>): Promise<ExpenseCategory> {
    const entity = this.categoryRepo.create({ ...dto, tenantId });
    return this.categoryRepo.save(entity);
  }

  async findCategories(
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<ExpenseCategory>> {
    const { page = 1, limit = 20 } = pagination;
    const [items, total] = await this.categoryRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async updateCategory(
    tenantId: string,
    id: string,
    dto: Partial<ExpenseCategory>,
  ): Promise<ExpenseCategory> {
    const cat = await this.categoryRepo.findOne({ where: { id, tenantId } });
    if (!cat) throw new NotFoundException(`Expense category ${id} not found`);
    Object.assign(cat, dto);
    return this.categoryRepo.save(cat);
  }

  // ─── Claim Number Helper ──────────────────────────────────────

  private async nextClaimNumber(tenantId: string): Promise<string> {
    const row = await this.claimRepo
      .createQueryBuilder('e')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(e.claim_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('e.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `EXP-${String(next).padStart(6, '0')}`;
  }

  // ─── Claims ───────────────────────────────────────────────────

  async createClaim(
    tenantId: string,
    employeeId: string,
    dto: any,
  ): Promise<ExpenseClaim & { lines: ExpenseLine[] }> {
    const claimNumber = await this.nextClaimNumber(tenantId);
    const lines: any[] = dto.lines ?? [];
    const totalAmount = lines.reduce(
      (sum: number, l: any) => sum + (parseFloat(l.amount) || 0),
      0,
    );

    const claim = this.claimRepo.create({
      tenantId,
      employeeId,
      claimNumber,
      title: dto.title,
      claimDate: dto.claimDate,
      currency: dto.currency ?? 'INR',
      status: ExpenseClaimStatus.DRAFT,
      totalAmount,
    });
    const saved = await this.claimRepo.save(claim);

    const lineEntities = lines.map((l: any, idx: number) =>
      this.lineRepo.create({
        tenantId,
        claimId: saved.id,
        lineNumber: idx + 1,
        categoryId: l.categoryId ?? null,
        description: l.description,
        expenseDate: l.expenseDate,
        amount: l.amount,
        currency: l.currency ?? dto.currency ?? 'INR',
        receiptUrl: l.receiptUrl ?? null,
        taxAmount: l.taxAmount ?? 0,
        projectId: l.projectId ?? null,
        notes: l.notes ?? null,
      }),
    );
    await this.lineRepo.save(lineEntities);
    return this.findClaim(tenantId, saved.id);
  }

  async findClaims(
    tenantId: string,
    pagination: PaginationDto,
    filters?: { employeeId?: string; status?: ExpenseClaimStatus },
  ): Promise<PaginatedResponseDto<ExpenseClaim>> {
    const { page = 1, limit = 20 } = pagination;
    const qb = this.claimRepo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId });
    if (filters?.employeeId)
      qb.andWhere('c.employeeId = :employeeId', { employeeId: filters.employeeId });
    if (filters?.status)
      qb.andWhere('c.status = :status', { status: filters.status });
    qb.orderBy('c.createdAt', 'DESC').skip((page - 1) * limit).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findClaim(
    tenantId: string,
    id: string,
  ): Promise<ExpenseClaim & { lines: ExpenseLine[] }> {
    const claim = await this.claimRepo.findOne({ where: { id, tenantId } });
    if (!claim) throw new NotFoundException(`Expense claim ${id} not found`);
    const lines = await this.lineRepo.find({
      where: { claimId: id, tenantId },
      order: { lineNumber: 'ASC' },
    });
    return { ...claim, lines } as any;
  }

  private async transitionClaim(
    tenantId: string,
    id: string,
    from: ExpenseClaimStatus,
    to: ExpenseClaimStatus,
    extra?: Partial<ExpenseClaim>,
  ): Promise<ExpenseClaim> {
    const claim = await this.claimRepo.findOne({ where: { id, tenantId } });
    if (!claim) throw new NotFoundException(`Expense claim ${id} not found`);
    if (claim.status !== from) {
      throw new BadRequestException(
        `Cannot transition from ${claim.status} to ${to}`,
      );
    }
    claim.status = to;
    if (extra) Object.assign(claim, extra);
    return this.claimRepo.save(claim);
  }

  async submitClaim(tenantId: string, id: string): Promise<ExpenseClaim> {
    return this.transitionClaim(tenantId, id, ExpenseClaimStatus.DRAFT, ExpenseClaimStatus.SUBMITTED);
  }

  async approveClaim(tenantId: string, id: string, approvedById: string): Promise<ExpenseClaim> {
    return this.transitionClaim(tenantId, id, ExpenseClaimStatus.SUBMITTED, ExpenseClaimStatus.APPROVED, {
      approvedById,
      approvedAt: new Date(),
    });
  }

  async rejectClaim(
    tenantId: string,
    id: string,
    approvedById: string,
    reason: string,
  ): Promise<ExpenseClaim> {
    return this.transitionClaim(tenantId, id, ExpenseClaimStatus.SUBMITTED, ExpenseClaimStatus.REJECTED, {
      approvedById,
      approvedAt: new Date(),
      rejectionReason: reason,
    });
  }

  async markPaid(tenantId: string, id: string, userId: string): Promise<ExpenseClaim> {
    const claim = await this.findClaim(tenantId, id);
    if (claim.status !== ExpenseClaimStatus.APPROVED) {
      throw new BadRequestException('Only approved claims can be marked paid');
    }

    // Best-effort GL posting: look up a catch-all "Expenses" account by code prefix
    const expenseAccount = await this.glService.findAccounts(tenantId, { limit: 1, page: 1, sortBy: 'code', sortOrder: 'ASC' }, { search: '6000' }).catch(() => null);
    if (expenseAccount?.items?.length) {
      const acctId = expenseAccount.items[0].id;
      const amount = Number(claim.totalAmount);
      const je = await this.glService.postJournalEntry(
        tenantId,
        {
          date: new Date().toISOString().split('T')[0],
          description: `Expense reimbursement — ${claim.claimNumber}`,
          reference: claim.claimNumber,
          source: JournalSource.MANUAL,
          currency: claim.currency,
          lines: [
            { accountId: acctId, description: `Expense ${claim.claimNumber}`, debit: amount, credit: 0 },
            { accountId: acctId, description: `Reimbursement ${claim.claimNumber}`, debit: 0, credit: amount },
          ],
        },
        userId,
      ).catch(() => null);
      if (je) claim.journalEntryId = je.id;
    }

    claim.status = ExpenseClaimStatus.PAID;
    claim.paidAt = new Date();
    return this.claimRepo.save(claim);
  }

  // ─── Policies ─────────────────────────────────────────────────

  async createPolicy(tenantId: string, dto: Partial<ExpensePolicy>): Promise<ExpensePolicy> {
    const entity = this.policyRepo.create({ ...dto, tenantId });
    return this.policyRepo.save(entity);
  }

  async findPolicies(tenantId: string): Promise<ExpensePolicy[]> {
    return this.policyRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async updatePolicy(tenantId: string, id: string, dto: Partial<ExpensePolicy>): Promise<ExpensePolicy> {
    const policy = await this.policyRepo.findOne({ where: { id, tenantId } });
    if (!policy) throw new NotFoundException(`Expense policy ${id} not found`);
    Object.assign(policy, dto);
    return this.policyRepo.save(policy);
  }
}
