import { NotFoundException } from '@nestjs/common';
import { BankService } from './bank.service';
import { BankAccountStatus } from './entities/bank-account.entity';
import { ReconciliationStatus } from './entities/bank-reconciliation.entity';

/**
 * Bank: account creation validates the GL link and seeds the balance,
 * transactions post balanced JEs (deposit vs withdrawal sides) and move the
 * running balance, reconciliation marks selected transactions and records
 * statement-vs-book difference.
 */
describe('BankService', () => {
  let service: BankService;
  let bankAccountRepo: any, transactionRepo: any, reconciliationRepo: any, glService: any, dataSource: any;
  let manager: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(() => {
    bankAccountRepo = mockRepo(); transactionRepo = mockRepo(); reconciliationRepo = mockRepo();
    glService = {
      findAccount: jest.fn().mockResolvedValue({ id: 'gl-1' }),
      postJournalEntry: jest.fn().mockResolvedValue({ id: 'je-1' }),
    };
    manager = {
      findOne: jest.fn(),
      save: jest.fn((x: any) => Promise.resolve(x)),
      create: jest.fn((_cls: any, x: any) => ({ id: 'txn-1', ...x })),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({}),
      })),
    };
    dataSource = { transaction: jest.fn(async (cb: any) => cb(manager)) };
    service = new BankService(bankAccountRepo, transactionRepo, reconciliationRepo, glService, dataSource);
  });

  it('createBankAccount validates the GL account and seeds current = opening balance', async () => {
    const a = await service.createBankAccount('t1', { name: 'Main', glAccountId: 'gl-1', openingBalance: 5000 } as any);
    expect(glService.findAccount).toHaveBeenCalledWith('t1', 'gl-1');
    expect(a.currentBalance).toBe(5000);
    expect(a.status).toBe(BankAccountStatus.ACTIVE);
  });

  it('a deposit debits the bank GL account and credits the offset, and raises the balance', async () => {
    const account: any = { id: 'ba1', tenantId: 't1', glAccountId: 'gl-bank', currentBalance: 100, currency: 'INR' };
    manager.findOne.mockResolvedValue(account);
    await service.createTransaction('t1', {
      bankAccountId: 'ba1', offsetAccountId: 'gl-rev', amount: 250, date: '2026-07-01', description: 'customer receipt',
    } as any, 'u1');
    const [, jeDto] = glService.postJournalEntry.mock.calls[0];
    expect(jeDto.lines).toEqual([
      { accountId: 'gl-bank', debit: 250, credit: 0 },
      { accountId: 'gl-rev', debit: 0, credit: 250 },
    ]);
    expect(account.currentBalance).toBe(350);
  });

  it('a withdrawal flips the JE sides and lowers the balance', async () => {
    const account: any = { id: 'ba1', tenantId: 't1', glAccountId: 'gl-bank', currentBalance: 100, currency: 'INR' };
    manager.findOne.mockResolvedValue(account);
    await service.createTransaction('t1', {
      bankAccountId: 'ba1', offsetAccountId: 'gl-exp', amount: -40, date: '2026-07-01', description: 'bank fee',
    } as any, 'u1');
    const [, jeDto] = glService.postJournalEntry.mock.calls[0];
    expect(jeDto.lines).toEqual([
      { accountId: 'gl-exp', debit: 40, credit: 0 },
      { accountId: 'gl-bank', debit: 0, credit: 40 },
    ]);
    expect(account.currentBalance).toBe(60);
  });

  it('reconcile marks the chosen transactions and records the statement difference', async () => {
    manager.findOne.mockResolvedValue({ id: 'ba1', tenantId: 't1', currentBalance: 900 });
    const rec = await service.reconcile('t1', {
      bankAccountId: 'ba1', statementDate: '2026-06-30', statementBalance: 1000, transactionIds: ['x1', 'x2'],
    } as any, 'u1');
    expect(rec.difference).toBe(100); // statement 1000 - book 900
    expect(rec.status).toBe(ReconciliationStatus.COMPLETED);
    expect(manager.createQueryBuilder).toHaveBeenCalled(); // txns flagged reconciled
  });

  it('transactions against an unknown bank account 404 tenant-scoped', async () => {
    manager.findOne.mockResolvedValue(null);
    await expect(
      service.createTransaction('t2', { bankAccountId: 'ghost', offsetAccountId: 'x', amount: 1, date: 'd', description: 'x' } as any, 'u1'),
    ).rejects.toThrow(NotFoundException);
  });
});
