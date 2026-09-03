import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BpmService } from './bpm.service';
import { BpmProcess } from './entities/bpm-process.entity';
import { BpmInstance, BpmInstanceStatus } from './entities/bpm-instance.entity';
import { ApprovalTask, ApprovalTaskStatus } from './entities/approval-task.entity';
import { DelegationRule } from './entities/delegation-rule.entity';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => ({ id: x.id ?? 'gen-1', ...x })),
  save: jest.fn((x) => Promise.resolve(x.id ? x : { id: 'gen-1', ...x })),
});

describe('BpmService — Phase 256-259', () => {
  let service: BpmService;
  let processRepo: any, instanceRepo: any, taskRepo: any, delegationRepo: any;

  beforeEach(async () => {
    processRepo = mockRepo(); instanceRepo = mockRepo(); taskRepo = mockRepo(); delegationRepo = mockRepo();
    const module = await Test.createTestingModule({
      providers: [
        BpmService,
        { provide: getRepositoryToken(BpmProcess), useValue: processRepo },
        { provide: getRepositoryToken(BpmInstance), useValue: instanceRepo },
        { provide: getRepositoryToken(ApprovalTask), useValue: taskRepo },
        { provide: getRepositoryToken(DelegationRule), useValue: delegationRepo },
      ],
    }).compile();
    service = module.get(BpmService);
  });

  const PROCESS = {
    id: 'proc1', isActive: true,
    stages: [
      { id: 's1', name: 'Peer Review', approvers: ['u1', 'u2'], mode: 'ALL', escalationHours: 24, escalateTo: 'boss' },
      { id: 's2', name: 'Manager', approvers: ['mgr'], mode: 'ANY' },
    ],
  };

  // ─── Ph-259: designer ─────────────────────────────────────────────

  it('createProcess — rejects a stage without approvers', async () => {
    processRepo.findOne.mockResolvedValue(null);
    await expect(service.createProcess('t1', { code: 'P', name: 'P', stages: [{ id: 's1', name: 'S', approvers: [], mode: 'ALL' } as any] })).rejects.toThrow(BadRequestException);
  });

  // ─── Ph-256: start + parallel ─────────────────────────────────────

  it('start — creates a task per stage-1 approver', async () => {
    processRepo.findOne.mockResolvedValue(PROCESS);
    instanceRepo.save.mockImplementation((x: any) => Promise.resolve({ id: 'inst1', ...x }));
    delegationRepo.find.mockResolvedValue([]);
    taskRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    await service.start('t1', 'proc1', 'PO-1', '2026-06-01T09:00:00Z');
    expect(taskRepo.save).toHaveBeenCalledTimes(2); // u1, u2
  });

  it('decide — ALL stage waits for every approver', async () => {
    taskRepo.findOne.mockResolvedValue({ id: 'tk1', instanceId: 'inst1', stageIndex: 0, mode: 'ALL', assignedTo: 'u1', status: ApprovalTaskStatus.PENDING });
    instanceRepo.findOne.mockResolvedValue({ id: 'inst1', processId: 'proc1', status: BpmInstanceStatus.RUNNING, currentStageIndex: 0 });
    processRepo.findOne.mockResolvedValue(PROCESS);
    taskRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    taskRepo.find.mockResolvedValue([
      { id: 'tk1', status: ApprovalTaskStatus.APPROVED, mode: 'ALL' },
      { id: 'tk2', status: ApprovalTaskStatus.PENDING, mode: 'ALL' },
    ]);
    const r = await service.decide('t1', 'tk1', 'u1', 'APPROVE', '2026-06-01T10:00:00Z');
    expect(r.stageAdvanced).toBe(false); // tk2 still pending
  });

  it('decide — reject fails the instance', async () => {
    taskRepo.findOne.mockResolvedValue({ id: 'tk1', instanceId: 'inst1', stageIndex: 0, mode: 'ALL', assignedTo: 'u1', status: ApprovalTaskStatus.PENDING });
    instanceRepo.findOne.mockResolvedValue({ id: 'inst1', processId: 'proc1', status: BpmInstanceStatus.RUNNING, currentStageIndex: 0 });
    processRepo.findOne.mockResolvedValue(PROCESS);
    taskRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    instanceRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.decide('t1', 'tk1', 'u1', 'REJECT', '2026-06-01T10:00:00Z');
    expect(r.instanceStatus).toBe(BpmInstanceStatus.REJECTED);
  });

  it('decide — advances to the next stage when ALL approve', async () => {
    taskRepo.findOne.mockResolvedValue({ id: 'tk2', instanceId: 'inst1', stageIndex: 0, mode: 'ALL', assignedTo: 'u2', status: ApprovalTaskStatus.PENDING });
    instanceRepo.findOne.mockResolvedValue({ id: 'inst1', processId: 'proc1', status: BpmInstanceStatus.RUNNING, currentStageIndex: 0 });
    processRepo.findOne.mockResolvedValue(PROCESS);
    taskRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    instanceRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    delegationRepo.find.mockResolvedValue([]);
    taskRepo.find.mockResolvedValue([
      { id: 'tk1', status: ApprovalTaskStatus.APPROVED, mode: 'ALL' },
      { id: 'tk2', status: ApprovalTaskStatus.APPROVED, mode: 'ALL' },
    ]);
    const r = await service.decide('t1', 'tk2', 'u2', 'APPROVE', '2026-06-01T11:00:00Z');
    expect(r.stageAdvanced).toBe(true);
    expect(r.activeStage).toBe('s2');
  });

  it('decide — rejects a task not assigned to the user', async () => {
    taskRepo.findOne.mockResolvedValue({ id: 'tk1', assignedTo: 'someone', status: ApprovalTaskStatus.PENDING });
    await expect(service.decide('t1', 'tk1', 'u1', 'APPROVE', '2026-06-01T10:00:00Z')).rejects.toThrow(ForbiddenException);
  });

  // ─── Ph-257: escalation ───────────────────────────────────────────

  it('checkEscalations — reassigns overdue tasks to escalateTo', async () => {
    taskRepo.find.mockResolvedValue([{ id: 'tk1', instanceId: 'inst1', stageIndex: 0, stageId: 's1', status: ApprovalTaskStatus.PENDING, dueAt: '2026-06-02T09:00:00Z' }]);
    instanceRepo.findOne.mockResolvedValue({ id: 'inst1', processId: 'proc1' });
    processRepo.findOne.mockResolvedValue(PROCESS);
    taskRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    const r = await service.checkEscalations('t1', '2026-06-03T09:00:00Z');
    expect(r.escalatedCount).toBe(1);
    expect(r.escalated[0].escalatedTo).toBe('boss');
  });

  // ─── Ph-258: delegation ───────────────────────────────────────────

  it('start — routes to the delegate during a vacation window', async () => {
    processRepo.findOne.mockResolvedValue({ id: 'proc1', isActive: true, stages: [{ id: 's1', name: 'S', approvers: ['u1'], mode: 'ANY' }] });
    instanceRepo.save.mockImplementation((x: any) => Promise.resolve({ id: 'inst1', tenantId: 't1', ...x }));
    delegationRepo.find.mockResolvedValue([{ userId: 'u1', delegateId: 'proxy', fromDate: '2026-06-01', toDate: '2026-06-10', isActive: true }]);
    taskRepo.save.mockImplementation((x: any) => Promise.resolve(x));
    await service.start('t1', 'proc1', 'PO-2', '2026-06-05T09:00:00Z');
    expect(taskRepo.save).toHaveBeenCalledWith(expect.objectContaining({ assignedTo: 'proxy', originalAssignee: 'u1' }));
  });

  it('setDelegation — rejects self-delegation', async () => {
    await expect(service.setDelegation('t1', { userId: 'u1', delegateId: 'u1', fromDate: '2026-06-01', toDate: '2026-06-10' })).rejects.toThrow(BadRequestException);
  });
});
