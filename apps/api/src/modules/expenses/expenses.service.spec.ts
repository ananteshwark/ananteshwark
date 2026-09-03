import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpenseClaimStatus } from './entities/expense-claim.entity';

/**
 * Expense claim lifecycle: create (totals + numbering), the
 * DRAFT → SUBMITTED → APPROVED → PAID state machine (with rejection),
 * and tenant-scoped lookups. GL posting on markPaid is best-effort.
 */
describe('ExpensesService', () => {
  let service: ExpensesService;
  let categoryRepo: any, claimRepo: any, lineRepo: any, policyRepo: any, glService: any;

  const mockRepo = () => ({
    create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
    save: jest.fn((x) => Promise.resolve(Array.isArray(x) ? x : { id: 'gen-1', ...x })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn(),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    createQueryBuilder: jest.fn(),
  });

  beforeEach(() => {
    categoryRepo = mockRepo();
    claimRepo = mockRepo();
    lineRepo = mockRepo();
    policyRepo = mockRepo();
    glService = {
      findAccounts: jest.fn().mockResolvedValue({ items: [{ id: 'acct-6000' }] }),
      postJournalEntry: jest.fn().mockResolvedValue({ id: 'je-1' }),
    };
    claimRepo.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: '41' }),
    });
    service = new ExpensesService(categoryRepo, claimRepo, lineRepo, policyRepo, glService);
  });

  it('createClaim sums line amounts, numbers the claim, and starts in DRAFT', async () => {
    claimRepo.findOne.mockResolvedValue({ id: 'gen-1', tenantId: 't1', status: ExpenseClaimStatus.DRAFT });
    lineRepo.find.mockResolvedValue([{ lineNumber: 1 }, { lineNumber: 2 }]);
    await service.createClaim('t1', 'emp1', {
      title: 'Trip',
      lines: [{ amount: '100.50', description: 'taxi' }, { amount: '49.50', description: 'meal' }],
    });
    expect(claimRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        claimNumber: 'EXP-000042', // max existing 41 + 1
        status: ExpenseClaimStatus.DRAFT,
        totalAmount: 150,
        employeeId: 'emp1',
      }),
    );
    expect(lineRepo.save).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ lineNumber: 1 }), expect.objectContaining({ lineNumber: 2 })]),
    );
  });

  it('submitClaim moves DRAFT → SUBMITTED', async () => {
    claimRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: ExpenseClaimStatus.DRAFT });
    const c = await service.submitClaim('t1', 'c1');
    expect(c.status).toBe(ExpenseClaimStatus.SUBMITTED);
  });

  it('approveClaim requires SUBMITTED (skipping submit is rejected)', async () => {
    claimRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: ExpenseClaimStatus.DRAFT });
    await expect(service.approveClaim('t1', 'c1', 'mgr1')).rejects.toThrow(BadRequestException);
  });

  it('approveClaim stamps approver and timestamp', async () => {
    claimRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: ExpenseClaimStatus.SUBMITTED });
    const c = await service.approveClaim('t1', 'c1', 'mgr1');
    expect(c.status).toBe(ExpenseClaimStatus.APPROVED);
    expect(c.approvedById).toBe('mgr1');
    expect(c.approvedAt).toBeInstanceOf(Date);
  });

  it('rejectClaim records the reason', async () => {
    claimRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: ExpenseClaimStatus.SUBMITTED });
    const c = await service.rejectClaim('t1', 'c1', 'mgr1', 'no receipt');
    expect(c.status).toBe(ExpenseClaimStatus.REJECTED);
    expect(c.rejectionReason).toBe('no receipt');
  });

  it('markPaid only pays APPROVED claims', async () => {
    claimRepo.findOne.mockResolvedValue({ id: 'c1', tenantId: 't1', status: ExpenseClaimStatus.SUBMITTED, totalAmount: 100 });
    lineRepo.find.mockResolvedValue([]);
    await expect(service.markPaid('t1', 'c1', 'u1')).rejects.toThrow(BadRequestException);
  });

  it('markPaid posts a balanced GL entry and stamps PAID', async () => {
    claimRepo.findOne.mockResolvedValue({
      id: 'c1', tenantId: 't1', status: ExpenseClaimStatus.APPROVED,
      totalAmount: 150, claimNumber: 'EXP-000042', currency: 'INR',
    });
    lineRepo.find.mockResolvedValue([]);
    const c = await service.markPaid('t1', 'c1', 'u1');
    expect(c.status).toBe(ExpenseClaimStatus.PAID);
    expect(c.paidAt).toBeInstanceOf(Date);
    expect(c.journalEntryId).toBe('je-1');
    const [, jeDto] = glService.postJournalEntry.mock.calls[0];
    const debits = jeDto.lines.reduce((s: number, l: any) => s + l.debit, 0);
    const credits = jeDto.lines.reduce((s: number, l: any) => s + l.credit, 0);
    expect(debits).toBe(credits); // balanced
  });

  it('markPaid still pays when GL posting fails (best-effort)', async () => {
    glService.postJournalEntry.mockRejectedValue(new Error('GL down'));
    claimRepo.findOne.mockResolvedValue({
      id: 'c1', tenantId: 't1', status: ExpenseClaimStatus.APPROVED,
      totalAmount: 150, claimNumber: 'EXP-000042', currency: 'INR',
    });
    lineRepo.find.mockResolvedValue([]);
    const c = await service.markPaid('t1', 'c1', 'u1');
    expect(c.status).toBe(ExpenseClaimStatus.PAID);
    expect(c.journalEntryId).toBeUndefined();
  });

  it('findClaim is tenant-scoped and 404s on a foreign claim', async () => {
    claimRepo.findOne.mockResolvedValue(null);
    await expect(service.findClaim('t2', 'c1')).rejects.toThrow(NotFoundException);
    expect(claimRepo.findOne).toHaveBeenCalledWith({ where: { id: 'c1', tenantId: 't2' } });
  });

  it('updateCategory / updatePolicy 404 on missing rows', async () => {
    categoryRepo.findOne.mockResolvedValue(null);
    policyRepo.findOne.mockResolvedValue(null);
    await expect(service.updateCategory('t1', 'x', {})).rejects.toThrow(NotFoundException);
    await expect(service.updatePolicy('t1', 'x', {})).rejects.toThrow(NotFoundException);
  });
});
