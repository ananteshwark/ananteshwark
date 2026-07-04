import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { LeaveApplicationStatus } from './entities/leave-application.entity';

/**
 * Complements leave-approve-recheck.spec: the apply-side balance/overlap
 * checks, cancel-with-refund, withdraw guard, and the computed balance view.
 * (Approval re-check is covered separately.)
 */
describe('LeaveService — apply / cancel / balance', () => {
  let service: LeaveService;
  let leaveTypeRepo: any, balanceRepo: any, applicationRepo: any, accrualLogRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn(),
  });

  const conflictQb = (rows: any[]) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  });

  beforeEach(() => {
    leaveTypeRepo = mockRepo(); balanceRepo = mockRepo();
    applicationRepo = mockRepo(); accrualLogRepo = mockRepo();
    service = new LeaveService(leaveTypeRepo, balanceRepo, applicationRepo, accrualLogRepo);
  });

  const balance = (over: any = {}) => ({
    openingBalance: 10, accrued: 2, taken: 4, adjusted: 0, ...over, // available 8
  });

  const applyDto = (over: any = {}) => ({
    employeeId: 'e1', leaveTypeId: 'lt1', fromDate: '2026-07-10', toDate: '2026-07-12', days: 3, ...over,
  });

  it('applyLeave submits when balance suffices and no overlap exists', async () => {
    balanceRepo.findOne.mockResolvedValue(balance());
    applicationRepo.createQueryBuilder.mockReturnValue(conflictQb([]));
    const app = await service.applyLeave('t1', applyDto() as any);
    expect(app.status).toBe(LeaveApplicationStatus.SUBMITTED);
    expect(app.appliedAt).toBeInstanceOf(Date);
  });

  it('applyLeave rejects when the requested days exceed the available balance', async () => {
    balanceRepo.findOne.mockResolvedValue(balance({ taken: 10 })); // available 2
    await expect(service.applyLeave('t1', applyDto({ days: 3 }) as any)).rejects.toThrow(BadRequestException);
  });

  it('applyLeave rejects with zero balance when none exists at all', async () => {
    balanceRepo.findOne.mockResolvedValue(null);
    await expect(service.applyLeave('t1', applyDto({ days: 1 }) as any)).rejects.toThrow(BadRequestException);
  });

  it('applyLeave rejects overlapping SUBMITTED/APPROVED applications', async () => {
    balanceRepo.findOne.mockResolvedValue(balance());
    applicationRepo.createQueryBuilder.mockReturnValue(conflictQb([{ id: 'existing' }]));
    await expect(service.applyLeave('t1', applyDto() as any)).rejects.toThrow('conflicts');
  });

  it('cancelLeave refunds taken days for an APPROVED application', async () => {
    applicationRepo.findOne.mockResolvedValue({
      id: 'a1', tenantId: 't1', employeeId: 'e1', leaveTypeId: 'lt1',
      status: LeaveApplicationStatus.APPROVED, fromDate: '2026-07-10', days: 3,
    });
    const bal: any = balance({ taken: 7 });
    balanceRepo.findOne.mockResolvedValue(bal);
    const app = await service.cancelLeave('t1', 'a1', 'e1');
    expect(app.status).toBe(LeaveApplicationStatus.CANCELLED);
    expect(bal.taken).toBe(4); // 7 - 3
  });

  it('cancelLeave does not touch the balance for a SUBMITTED application', async () => {
    applicationRepo.findOne.mockResolvedValue({
      id: 'a1', tenantId: 't1', employeeId: 'e1', status: LeaveApplicationStatus.SUBMITTED, fromDate: '2026-07-10', days: 3,
    });
    await service.cancelLeave('t1', 'a1', 'e1');
    expect(balanceRepo.save).not.toHaveBeenCalled();
  });

  it('cancelLeave is scoped to the owning employee', async () => {
    applicationRepo.findOne.mockResolvedValue(null);
    await expect(service.cancelLeave('t1', 'a1', 'someone-else')).rejects.toThrow(NotFoundException);
    expect(applicationRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: 't1', id: 'a1', employeeId: 'someone-else' } });
  });

  it('withdrawLeave only works on SUBMITTED applications', async () => {
    applicationRepo.findOne.mockResolvedValue({ id: 'a1', status: LeaveApplicationStatus.APPROVED });
    await expect(service.withdrawLeave('t1', 'a1', 'e1')).rejects.toThrow(BadRequestException);

    applicationRepo.findOne.mockResolvedValue({ id: 'a1', status: LeaveApplicationStatus.SUBMITTED });
    const app = await service.withdrawLeave('t1', 'a1', 'e1');
    expect(app.status).toBe(LeaveApplicationStatus.WITHDRAWN);
  });

  it('getBalance computes closing balance per active leave type', async () => {
    leaveTypeRepo.find.mockResolvedValue([{ id: 'lt1', name: 'Casual' }, { id: 'lt2', name: 'Sick' }]);
    balanceRepo.find.mockResolvedValue([{ leaveTypeId: 'lt1', openingBalance: 10, accrued: 2, taken: 4, adjusted: 1 }]);
    const rows = await service.getBalance('t1', 'e1', 2026);
    expect(rows[0].closingBalance).toBe(9); // 10+2-4+1
    expect(rows[1].closingBalance).toBe(0); // no balance row yet
  });

  it('accrueLeave creates the balance row on first accrual and logs it', async () => {
    balanceRepo.findOne.mockResolvedValue(null);
    balanceRepo.create.mockReturnValue({ accrued: 0 });
    const bal = await service.accrueLeave('t1', 'e1', 'lt1', 1.5, '2026-07-01');
    expect(bal.accrued).toBe(1.5);
    expect(accrualLogRepo.save).toHaveBeenCalled();
  });
});
