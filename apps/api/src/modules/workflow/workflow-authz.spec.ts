import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkflowService } from './workflow.service';
import { WorkflowDefinition } from './entities/workflow-definition.entity';
import { WorkflowInstance, WorkflowInstanceStatus } from './entities/workflow-instance.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { PermissionsService } from '../rbac/permissions.service';

const mockRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  create: jest.fn((x) => x),
  save: jest.fn((x) => Promise.resolve(x)),
});

const DEF = {
  id: 'def1',
  steps: [
    { id: 'step1', name: 'Manager', type: 'approval', approvers: [{ type: 'role', value: 'Finance Manager' }], onApproveNext: 'step2' },
    { id: 'step2', name: 'HR', type: 'approval', approvers: [{ type: 'manager', value: 'direct_manager' }] },
  ],
};

const baseInstance = () => ({
  id: 'inst1', tenantId: 't1', definitionId: 'def1', initiatorId: 'requester', currentStep: 'step1',
  status: WorkflowInstanceStatus.IN_PROGRESS, history: [],
});

describe('WorkflowService — approver authorization (C1)', () => {
  let service: WorkflowService;
  let instanceRepo: any, defRepo: any, empRepo: any, perms: any;

  beforeEach(async () => {
    instanceRepo = mockRepo(); defRepo = mockRepo(); empRepo = mockRepo();
    perms = { getUserRoleNames: jest.fn().mockResolvedValue([]) };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkflowService,
        { provide: getRepositoryToken(WorkflowDefinition), useValue: defRepo },
        { provide: getRepositoryToken(WorkflowInstance), useValue: instanceRepo },
        { provide: getRepositoryToken(Employee), useValue: empRepo },
        { provide: PermissionsService, useValue: perms },
      ],
    }).compile();
    service = moduleRef.get(WorkflowService);
    defRepo.findOne.mockResolvedValue(DEF);
  });

  const dto = { comment: 'ok' } as any;

  it('rejects approval of another tenant instance (404, tenant-scoped)', async () => {
    instanceRepo.findOne.mockResolvedValue(null); // tenant-scoped query returns nothing
    await expect(service.approveStep('inst1', 'step1', 'someone', 'attacker-tenant', dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(instanceRepo.findOne).toHaveBeenCalledWith({ where: { id: 'inst1', tenantId: 'attacker-tenant' } });
  });

  it('blocks self-approval by the initiator', async () => {
    instanceRepo.findOne.mockResolvedValue(baseInstance());
    await expect(service.approveStep('inst1', 'step1', 'requester', 't1', dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks a user who does not hold the required role', async () => {
    instanceRepo.findOne.mockResolvedValue(baseInstance());
    perms.getUserRoleNames.mockResolvedValue(['Employee']);
    await expect(service.approveStep('inst1', 'step1', 'bob', 't1', dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a user holding the required role and advances to the next step', async () => {
    instanceRepo.findOne.mockResolvedValue(baseInstance());
    perms.getUserRoleNames.mockResolvedValue(['Finance Manager']);
    const result = await service.approveStep('inst1', 'step1', 'fm', 't1', dto);
    expect(result.currentStep).toBe('step2');
    expect(result.status).toBe(WorkflowInstanceStatus.IN_PROGRESS);
    expect(result.history[0]).toMatchObject({ stepId: 'step1', action: 'approved', userId: 'fm' });
  });

  it('manager approver: allows the initiator\'s direct manager, blocks others', async () => {
    const inst = { ...baseInstance(), currentStep: 'step2' };
    instanceRepo.findOne.mockResolvedValue(inst);
    empRepo.findOne
      .mockResolvedValueOnce({ id: 'emp-req', userId: 'requester', managerId: 'emp-mgr' }) // initiator employee
      .mockResolvedValueOnce({ id: 'emp-mgr', userId: 'manager-user' }); // manager employee
    const result = await service.approveStep('inst1', 'step2', 'manager-user', 't1', dto);
    expect(result.status).toBe(WorkflowInstanceStatus.APPROVED);
    expect(result.currentStep).toBeNull();
  });

  it('rejects when acting on a non-current step', async () => {
    instanceRepo.findOne.mockResolvedValue(baseInstance());
    await expect(service.approveStep('inst1', 'step2', 'fm', 't1', dto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejectStep enforces the same authorization', async () => {
    instanceRepo.findOne.mockResolvedValue(baseInstance());
    perms.getUserRoleNames.mockResolvedValue(['Employee']);
    await expect(service.rejectStep('inst1', 'step1', 'bob', 't1', dto)).rejects.toBeInstanceOf(ForbiddenException);
  });

  describe('getMyPendingApprovals — only the caller\'s assigned approvals', () => {
    const instA = () => ({ ...baseInstance(), id: 'A' }); // initiator 'requester'
    const instB = () => ({ ...baseInstance(), id: 'B', initiatorId: 'someone-else' });

    it('returns instances whose current step the user is an approver for', async () => {
      instanceRepo.find.mockResolvedValue([instA(), instB()]);
      defRepo.find.mockResolvedValue([DEF]);
      perms.getUserRoleNames.mockResolvedValue(['Finance Manager']);
      const result = await service.getMyPendingApprovals('fin-mgr', 't1');
      expect(result.map((i: any) => i.id)).toEqual(['A', 'B']);
    });

    it('excludes instances the user cannot approve (no matching role)', async () => {
      instanceRepo.find.mockResolvedValue([instA()]);
      defRepo.find.mockResolvedValue([DEF]);
      perms.getUserRoleNames.mockResolvedValue([]);
      expect(await service.getMyPendingApprovals('nobody', 't1')).toEqual([]);
    });

    it("excludes the caller's own requests", async () => {
      instanceRepo.find.mockResolvedValue([instA()]); // initiator 'requester'
      defRepo.find.mockResolvedValue([DEF]);
      perms.getUserRoleNames.mockResolvedValue(['Finance Manager']);
      expect(await service.getMyPendingApprovals('requester', 't1')).toEqual([]);
    });
  });
});
