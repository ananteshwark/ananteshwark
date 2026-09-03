import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BenefitsService } from './benefits.service';
import { EnrollmentStatus } from './entities/benefit-enrollment.entity';
import { MeritCycleStatus, MeritCycle } from './entities/merit-cycle.entity';
import { AllocationStatus } from './entities/merit-allocation.entity';

/**
 * Benefits: duplicate-active-enrollment guard, ACTIVE-only termination,
 * merit allocations only in OPEN cycles with new-salary math, and approval
 * stamping.
 */
describe('BenefitsService', () => {
  let service: BenefitsService;
  let planRepo: any, enrollmentRepo: any, bandRepo: any, cycleRepo: any, allocationRepo: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  });

  beforeEach(() => {
    planRepo = mockRepo(); enrollmentRepo = mockRepo(); bandRepo = mockRepo();
    cycleRepo = mockRepo(); allocationRepo = mockRepo();
    service = new BenefitsService(planRepo, enrollmentRepo, bandRepo, cycleRepo, allocationRepo);
  });

  it('enrollEmployee rejects a second ACTIVE enrollment in the same plan', async () => {
    planRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    enrollmentRepo.findOne.mockResolvedValue({ id: 'en1', status: EnrollmentStatus.ACTIVE });
    await expect(
      service.enrollEmployee('t1', { employeeId: 'e1', planId: 'p1' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('enrollEmployee allows re-enrollment after a terminated one and 404s unknown plans', async () => {
    planRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1' });
    enrollmentRepo.findOne.mockResolvedValue({ id: 'en1', status: EnrollmentStatus.TERMINATED });
    const en = await service.enrollEmployee('t1', { employeeId: 'e1', planId: 'p1' } as any);
    expect(en.status).toBe(EnrollmentStatus.ACTIVE);

    planRepo.findOne.mockResolvedValue(null);
    await expect(service.enrollEmployee('t1', { employeeId: 'e1', planId: 'ghost' } as any)).rejects.toThrow(NotFoundException);
  });

  it('terminateEnrollment requires ACTIVE and records the date', async () => {
    enrollmentRepo.findOne.mockResolvedValue({ id: 'en1', tenantId: 't1', status: EnrollmentStatus.TERMINATED });
    await expect(service.terminateEnrollment('t1', 'en1', { terminationDate: '2026-07-31' } as any)).rejects.toThrow(BadRequestException);

    const active: any = { id: 'en1', tenantId: 't1', status: EnrollmentStatus.ACTIVE };
    enrollmentRepo.findOne.mockResolvedValue(active);
    await service.terminateEnrollment('t1', 'en1', { terminationDate: '2026-07-31' } as any);
    expect(active.status).toBe(EnrollmentStatus.TERMINATED);
    expect(active.terminationDate).toBe('2026-07-31');
  });

  it('bulkAllocate requires an OPEN cycle and computes rounded new salaries', async () => {
    cycleRepo.findOne.mockResolvedValue({ id: 'cy1', tenantId: 't1', status: MeritCycleStatus.CLOSED } as MeritCycle);
    await expect(service.bulkAllocate('t1', 'cy1', { lines: [] } as any)).rejects.toThrow(BadRequestException);

    cycleRepo.findOne.mockResolvedValue({ id: 'cy1', tenantId: 't1', status: MeritCycleStatus.OPEN });
    await service.bulkAllocate('t1', 'cy1', {
      lines: [{ employeeId: 'e1', currentSalary: 33333, proposedIncreasePct: 7.5 }],
    } as any);
    expect(allocationRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      newSalary: 35832.98, // 33333 * 1.075 rounded to 2dp
    }));
  });

  it('approveAllocation stamps approver only on APPROVED', async () => {
    const alloc: any = { id: 'a1', tenantId: 't1', status: AllocationStatus.PROPOSED };
    allocationRepo.findOne.mockResolvedValue(alloc);
    await service.approveAllocation('t1', 'a1', 'boss', { status: AllocationStatus.APPROVED } as any);
    expect(alloc.approvedById).toBe('boss');
    expect(alloc.approvedAt).toBeInstanceOf(Date);

    const rejected: any = { id: 'a2', tenantId: 't1', status: AllocationStatus.PROPOSED };
    allocationRepo.findOne.mockResolvedValue(rejected);
    await service.approveAllocation('t1', 'a2', 'boss', { status: AllocationStatus.REJECTED, comments: 'over budget' } as any);
    expect(rejected.approvedById).toBeUndefined();
    expect(rejected.comments).toBe('over budget');
  });
});
