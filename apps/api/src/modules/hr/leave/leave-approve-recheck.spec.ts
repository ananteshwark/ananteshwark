import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { LeaveService } from './leave.service';
import { LeaveType } from './entities/leave-type.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { LeaveApplication, LeaveApplicationStatus } from './entities/leave-application.entity';
import { LeaveAccrualLog } from './entities/leave-accrual-log.entity';

const repo = () => ({ findOne: jest.fn(), find: jest.fn(), create: jest.fn((x) => x), save: jest.fn((x) => Promise.resolve(x)) });

describe('LeaveService.approveLeave — balance re-check (H4)', () => {
  let service: LeaveService;
  let appRepo: any, balRepo: any;

  beforeEach(async () => {
    appRepo = repo(); balRepo = repo();
    const moduleRef = await Test.createTestingModule({
      providers: [
        LeaveService,
        { provide: getRepositoryToken(LeaveType), useValue: repo() },
        { provide: getRepositoryToken(LeaveBalance), useValue: balRepo },
        { provide: getRepositoryToken(LeaveApplication), useValue: appRepo },
        { provide: getRepositoryToken(LeaveAccrualLog), useValue: repo() },
      ],
    }).compile();
    service = moduleRef.get(LeaveService);
  });

  const submittedApp = { id: 'a1', tenantId: 't1', employeeId: 'e1', leaveTypeId: 'lt1', fromDate: '2026-06-01', days: 3, status: LeaveApplicationStatus.SUBMITTED };

  it('rejects approval when the balance is no longer sufficient', async () => {
    appRepo.findOne.mockResolvedValue({ ...submittedApp });
    // opening 2, accrued 0, taken 0, adjusted 0 -> available 2 < 3 requested
    balRepo.findOne.mockResolvedValue({ openingBalance: 2, accrued: 0, taken: 0, adjusted: 0 });
    await expect(service.approveLeave('t1', 'a1', 'mgr')).rejects.toBeInstanceOf(BadRequestException);
    // balance must not be mutated/saved on rejection
    expect(balRepo.save).not.toHaveBeenCalled();
  });

  it('approves and deducts when the balance is sufficient', async () => {
    appRepo.findOne.mockResolvedValue({ ...submittedApp });
    const bal: any = { openingBalance: 10, accrued: 0, taken: 4, adjusted: 0 };
    balRepo.findOne.mockResolvedValue(bal);
    const res = await service.approveLeave('t1', 'a1', 'mgr');
    expect(bal.taken).toBe(7);
    expect(res.status).toBe(LeaveApplicationStatus.APPROVED);
  });
});
