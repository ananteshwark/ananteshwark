import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BankAccount, BankAccountStatus } from './entities/bank-account.entity';
import { BankTransaction } from './entities/bank-transaction.entity';
import { BankReconciliation, ReconciliationStatus } from './entities/bank-reconciliation.entity';
import { GlService } from '../gl/gl.service';
import { JournalSource } from '../gl/entities/journal-entry.entity';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
  CreateTransactionDto,
  ReconcileDto,
} from './dto/bank.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

@Injectable()
export class BankService {
  constructor(
    @InjectRepository(BankAccount)
    private readonly bankAccountRepo: Repository<BankAccount>,
    @InjectRepository(BankTransaction)
    private readonly transactionRepo: Repository<BankTransaction>,
    @InjectRepository(BankReconciliation)
    private readonly reconciliationRepo: Repository<BankReconciliation>,
    private readonly glService: GlService,
    private readonly dataSource: DataSource,
  ) {}

  // -------------------- Bank Accounts --------------------

  async createBankAccount(tenantId: string, dto: CreateBankAccountDto): Promise<BankAccount> {
    await this.glService.findAccount(tenantId, dto.glAccountId);
    const openingBalance = dto.openingBalance ?? 0;
    const account = this.bankAccountRepo.create({
      ...dto,
      tenantId,
      openingBalance,
      currentBalance: openingBalance,
      status: BankAccountStatus.ACTIVE,
    });
    return this.bankAccountRepo.save(account);
  }

  async findBankAccounts(
    tenantId: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResponseDto<BankAccount>> {
    const { page = 1, limit = 20, sortBy = 'name', sortOrder = 'ASC' } = pagination;
    const validSort = ['name', 'bankName', 'currency', 'currentBalance', 'createdAt'];
    const [items, total] = await this.bankAccountRepo.findAndCount({
      where: { tenantId },
      order: { [validSort.includes(sortBy) ? sortBy : 'name']: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findBankAccount(tenantId: string, id: string): Promise<BankAccount> {
    const account = await this.bankAccountRepo.findOne({ where: { id, tenantId } });
    if (!account) throw new NotFoundException(`Bank account ${id} not found`);
    return account;
  }

  async updateBankAccount(
    tenantId: string,
    id: string,
    dto: UpdateBankAccountDto,
  ): Promise<BankAccount> {
    const account = await this.findBankAccount(tenantId, id);
    Object.assign(account, dto);
    return this.bankAccountRepo.save(account);
  }

  // -------------------- Transactions --------------------

  async createTransaction(
    tenantId: string,
    dto: CreateTransactionDto,
    userId: string,
  ): Promise<BankTransaction> {
    return this.dataSource.transaction(async (manager) => {
      const bankAccount = await manager.findOne(BankAccount, {
        where: { id: dto.bankAccountId, tenantId },
      });
      if (!bankAccount) throw new NotFoundException(`Bank account ${dto.bankAccountId} not found`);

      await this.glService.findAccount(tenantId, dto.offsetAccountId);

      const isDeposit = dto.amount > 0;
      const absAmount = Math.abs(dto.amount);

      // Deposit: Dr bank GL account, Cr offset account
      // Withdrawal: Dr offset account, Cr bank GL account
      const jeLines = isDeposit
        ? [
            { accountId: bankAccount.glAccountId, debit: absAmount, credit: 0 },
            { accountId: dto.offsetAccountId, debit: 0, credit: absAmount },
          ]
        : [
            { accountId: dto.offsetAccountId, debit: absAmount, credit: 0 },
            { accountId: bankAccount.glAccountId, debit: 0, credit: absAmount },
          ];

      const je = await this.glService.postJournalEntry(
        tenantId,
        {
          date: dto.date,
          description: dto.description,
          reference: dto.reference,
          source: JournalSource.BANK,
          currency: bankAccount.currency,
          lines: jeLines,
        },
        userId,
        manager,
      );

      const txn = manager.create(BankTransaction, {
        tenantId,
        bankAccountId: dto.bankAccountId,
        date: dto.date,
        description: dto.description,
        amount: dto.amount,
        reference: dto.reference,
        isReconciled: false,
        reconciledAt: null,
        journalEntryId: je.id,
        reconciliationId: null,
      });
      const savedTxn = await manager.save(txn);

      bankAccount.currentBalance = bankAccount.currentBalance + dto.amount;
      await manager.save(bankAccount);

      return savedTxn;
    });
  }

  async findTransactions(
    tenantId: string,
    pagination: PaginationDto,
    bankAccountId?: string,
  ): Promise<PaginatedResponseDto<BankTransaction>> {
    const { page = 1, limit = 20, sortBy = 'date', sortOrder = 'DESC' } = pagination;
    const validSort = ['date', 'amount', 'createdAt'];
    const qb = this.transactionRepo
      .createQueryBuilder('t')
      .where('t.tenantId = :tenantId', { tenantId });
    if (bankAccountId) {
      qb.andWhere('t.bankAccountId = :bankAccountId', { bankAccountId });
    }
    qb.orderBy(`t.${validSort.includes(sortBy) ? sortBy : 'date'}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  // -------------------- Reconciliation --------------------

  async reconcile(
    tenantId: string,
    dto: ReconcileDto,
    userId: string,
  ): Promise<BankReconciliation> {
    return this.dataSource.transaction(async (manager) => {
      const bankAccount = await manager.findOne(BankAccount, {
        where: { id: dto.bankAccountId, tenantId },
      });
      if (!bankAccount) throw new NotFoundException(`Bank account ${dto.bankAccountId} not found`);

      const bookBalance = bankAccount.currentBalance;
      const difference = dto.statementBalance - bookBalance;
      const now = new Date();

      if (dto.transactionIds?.length) {
        await manager
          .createQueryBuilder()
          .update(BankTransaction)
          .set({ isReconciled: true, reconciledAt: now })
          .where('id IN (:...ids)', { ids: dto.transactionIds })
          .andWhere('tenantId = :tenantId', { tenantId })
          .andWhere('bankAccountId = :bankAccountId', { bankAccountId: dto.bankAccountId })
          .execute();
      }

      const reconciliation = manager.create(BankReconciliation, {
        tenantId,
        bankAccountId: dto.bankAccountId,
        statementDate: dto.statementDate,
        statementBalance: dto.statementBalance,
        bookBalance,
        difference,
        status: ReconciliationStatus.COMPLETED,
        reconciledById: userId,
        completedAt: now,
      });

      return manager.save(reconciliation);
    });
  }

  async findReconciliations(
    tenantId: string,
    bankAccountId: string,
  ): Promise<BankReconciliation[]> {
    return this.reconciliationRepo.find({
      where: { tenantId, bankAccountId },
      order: { statementDate: 'DESC' },
    });
  }
}
