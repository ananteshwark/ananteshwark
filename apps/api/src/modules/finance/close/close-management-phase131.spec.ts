import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CloseManagementService } from './close-management.service';
import { CloseTask, CloseTaskStatus, CloseTaskType } from './entities/close-task.entity';
import { AccountReconciliation, ReconStatus } from './entities/account-reconciliation.entity';
import { GlService } from '../gl/gl.service';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('CloseManagementService — Phase 131-133', () => {
  let service: CloseManagementService;
  let taskRepo: any, reconRepo: any, glService: { getAccountBalance: jest.Mock };

  beforeEach(async () => {
    taskRepo = mockRepo();
    reconRepo = mockRepo();
    glService = { getAccountBalance: jest.fn().mockResolvedValue(1000) };
    const module = await Test.createTestingModule({
      providers: [
        CloseManagementService,
        { provide: getRepositoryToken(CloseTask), useValue: taskRepo },
        { provide: getRepositoryToken(AccountReconciliation), useValue: reconRepo },
        { provide: GlService, useValue: glService },
      ],
    }).compile();
    service = module.get(CloseManagementService);
  });

  // ─── Ph-131: tasks ────────────────────────────────────────────────

  it('createTask — happy path', async () => {
    const t = await service.createTask('t1', { periodId: 'p1', title: 'Recon cash', taskType: CloseTaskType.RECONCILIATION, dueDate: '2026-07-05' });
    expect(taskRepo.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Recon cash', status: CloseTaskStatus.OPEN }));
    expect(t.id).toBe('gen-1');
  });

  it('createTask — requires title/dueDate', async () => {
    await expect(service.createTask('t1', { periodId: 'p1', title: '', dueDate: '2026-07-05' })).rejects.toThrow(BadRequestException);
    await expect(service.createTask('t1', { periodId: 'p1', title: 'x', dueDate: '' })).rejects.toThrow(BadRequestException);
  });

  it('transitionTask — start → prepare → certify', async () => {
    taskRepo.findOne.mockResolvedValue({ id: 'tk', status: CloseTaskStatus.OPEN });
    taskRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    let r = await service.transitionTask('t1', 'tk', 'start');
    expect(r.status).toBe(CloseTaskStatus.IN_PROGRESS);
    taskRepo.findOne.mockResolvedValue({ id: 'tk', status: CloseTaskStatus.IN_PROGRESS });
    r = await service.transitionTask('t1', 'tk', 'prepare');
    expect(r.status).toBe(CloseTaskStatus.PREPARED);
    expect(r.preparedAt).toBeInstanceOf(Date);
    taskRepo.findOne.mockResolvedValue({ id: 'tk', status: CloseTaskStatus.PREPARED });
    r = await service.transitionTask('t1', 'tk', 'certify');
    expect(r.status).toBe(CloseTaskStatus.CERTIFIED);
  });

  it('transitionTask — certify requires PREPARED', async () => {
    taskRepo.findOne.mockResolvedValue({ id: 'tk', status: CloseTaskStatus.OPEN });
    await expect(service.transitionTask('t1', 'tk', 'certify')).rejects.toThrow(BadRequestException);
  });

  it('transitionTask — reject records reason', async () => {
    taskRepo.findOne.mockResolvedValue({ id: 'tk', status: CloseTaskStatus.PREPARED });
    taskRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.transitionTask('t1', 'tk', 'reject', { reason: 'wrong schedule' });
    expect(r.status).toBe(CloseTaskStatus.REJECTED);
    expect(r.rejectReason).toBe('wrong schedule');
  });

  it('transitionTask — not found', async () => {
    taskRepo.findOne.mockResolvedValue(null);
    await expect(service.transitionTask('t1', 'nope', 'start')).rejects.toThrow(NotFoundException);
  });

  // ─── Ph-132: reconciliations ──────────────────────────────────────

  it('createReconciliation — pulls GL balance and computes variance', async () => {
    glService.getAccountBalance.mockResolvedValue(1000);
    const recon = await service.createReconciliation('t1', {
      periodId: 'p1', accountId: 'a1', scheduleItems: [{ description: 'bank stmt', amount: 600 }, { description: 'in transit', amount: 400 }],
    });
    expect(recon.glBalance).toBe(1000);
    expect(recon.supportingBalance).toBe(1000);
    expect(recon.variance).toBe(0);
  });

  it('createReconciliation — non-zero variance when schedule mismatched', async () => {
    glService.getAccountBalance.mockResolvedValue(1000);
    const recon = await service.createReconciliation('t1', { periodId: 'p1', accountId: 'a1', scheduleItems: [{ description: 'x', amount: 700 }] });
    expect(recon.variance).toBe(300);
  });

  it('addScheduleItem — recomputes supporting + variance', async () => {
    reconRepo.findOne.mockResolvedValue({ id: 'r1', status: ReconStatus.OPEN, glBalance: 1000, supportingBalance: 600, scheduleItems: [{ description: 'a', amount: 600 }] });
    reconRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.addScheduleItem('t1', 'r1', { description: 'b', amount: 400 });
    expect(r.supportingBalance).toBe(1000);
    expect(r.variance).toBe(0);
  });

  it('reconAction — certify blocked when variance non-zero', async () => {
    reconRepo.findOne.mockResolvedValue({ id: 'r1', status: ReconStatus.PREPARED, variance: 300 });
    await expect(service.reconAction('t1', 'r1', 'certify')).rejects.toThrow(BadRequestException);
  });

  it('reconAction — certify succeeds at zero variance', async () => {
    reconRepo.findOne.mockResolvedValue({ id: 'r1', status: ReconStatus.PREPARED, variance: 0 });
    reconRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.reconAction('t1', 'r1', 'certify', { userId: 'u1' });
    expect(r.status).toBe(ReconStatus.CERTIFIED);
    expect(r.certifiedAt).toBeInstanceOf(Date);
  });

  // ─── Ph-133: dashboard ────────────────────────────────────────────

  it('closeDashboard — aggregates status, overdue, completion', async () => {
    const past = '2000-01-01';
    taskRepo.find.mockResolvedValue([
      { id: 't1', status: CloseTaskStatus.CERTIFIED, dueDate: past, title: 'A' },
      { id: 't2', status: CloseTaskStatus.OPEN, dueDate: past, title: 'B' }, // overdue
      { id: 't3', status: CloseTaskStatus.PREPARED, dueDate: '2999-01-01', title: 'C' },
    ]);
    reconRepo.find.mockResolvedValue([
      { status: ReconStatus.CERTIFIED, variance: 0 },
      { status: ReconStatus.OPEN, variance: 50 },
    ]);
    const d = await service.closeDashboard('t1', 'p1');
    expect(d.total).toBe(3);
    expect(d.certified).toBe(1);
    expect(d.overdue).toBe(1);
    expect(d.overdueTasks[0].title).toBe('B');
    expect(d.reconciliations).toMatchObject({ total: 2, certified: 1, withVariance: 1 });
    expect(d.readyToClose).toBe(false);
  });

  it('closeDashboard — readyToClose when all certified and none overdue', async () => {
    taskRepo.find.mockResolvedValue([
      { id: 't1', status: CloseTaskStatus.CERTIFIED, dueDate: '2000-01-01', title: 'A' },
    ]);
    reconRepo.find.mockResolvedValue([]);
    const d = await service.closeDashboard('t1', 'p1');
    expect(d.readyToClose).toBe(true);
    expect(d.completionPct).toBe(100);
  });
});
