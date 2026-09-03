import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ApprovalMatrixService } from './approval-matrix.service';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'gen-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  delete: jest.fn().mockResolvedValue({ affected: 1 }),
});

describe('ApprovalMatrixService', () => {
  let service: ApprovalMatrixService;
  let ruleRepo: any, definitionRepo: any, workflowService: any;

  beforeEach(() => {
    ruleRepo = mockRepo();
    definitionRepo = mockRepo();
    workflowService = { startWorkflow: jest.fn().mockResolvedValue({ id: 'wf-instance-1' }) };
    service = new ApprovalMatrixService(ruleRepo, definitionRepo, workflowService);
  });

  it('creating a rule generates a workflow definition with one step per chain entry', async () => {
    const rule = await service.createRule('t1', {
      name: 'PO up to 1L',
      docType: 'PURCHASE_ORDER',
      minAmount: 0,
      maxAmount: 100000,
      approverChain: [
        { type: 'manager', value: 'initiator' },
        { type: 'role', value: 'Finance Manager' },
      ],
    });
    const definition = definitionRepo.save.mock.calls[0][0];
    expect(definition.name).toBe('[Matrix] PO up to 1L');
    expect(definition.steps).toHaveLength(2);
    expect(definition.steps[0]).toMatchObject({ id: 'step-1', type: 'approval', onApproveNext: 'step-2' });
    expect(definition.steps[1].approvers).toEqual([{ type: 'role', value: 'Finance Manager' }]);
    expect(definition.steps[1].onApproveNext).toBeUndefined();
    expect(rule.definitionId).toBeTruthy();
  });

  it('rejects empty chains, malformed approvers, and inverted bands', async () => {
    await expect(service.createRule('t1', { name: 'x', docType: 'PO', approverChain: [] }))
      .rejects.toThrow('At least one approver');
    await expect(service.createRule('t1', {
      name: 'x', docType: 'PO', approverChain: [{ type: 'wizard' as any, value: 'x' }],
    })).rejects.toThrow(BadRequestException);
    await expect(service.createRule('t1', {
      name: 'x', docType: 'PO', minAmount: 500, maxAmount: 100,
      approverChain: [{ type: 'user', value: 'u1' }],
    })).rejects.toThrow('maxAmount cannot be below minAmount');
  });

  describe('resolution specificity', () => {
    const chain = [{ type: 'user' as const, value: 'u1' }];
    const rules = [
      { id: 'generic-any', docType: 'PO', minAmount: 0, maxAmount: null, orgUnitId: null, priority: 0, isActive: true, approverChain: chain, definitionId: 'd1' },
      { id: 'band-small', docType: 'PO', minAmount: 0, maxAmount: 50000, orgUnitId: null, priority: 0, isActive: true, approverChain: chain, definitionId: 'd2' },
      { id: 'org-specific', docType: 'PO', minAmount: 0, maxAmount: null, orgUnitId: 'dept-eng', priority: 0, isActive: true, approverChain: chain, definitionId: 'd3' },
    ];

    it('an org-unit match beats a narrower generic band', async () => {
      ruleRepo.find.mockResolvedValue(rules);
      const hit = await service.resolve('t1', 'PO', 10000, 'dept-eng');
      expect(hit!.id).toBe('org-specific');
    });

    it('without an org match the narrowest amount band wins', async () => {
      ruleRepo.find.mockResolvedValue(rules);
      const hit = await service.resolve('t1', 'PO', 10000, 'dept-sales');
      expect(hit!.id).toBe('band-small');
      // above the small band, only the unbounded generic remains
      const big = await service.resolve('t1', 'PO', 90000, 'dept-sales');
      expect(big!.id).toBe('generic-any');
    });

    it('returns null when nothing matches', async () => {
      ruleRepo.find.mockResolvedValue([rules[1]]); // only 0–50k band
      expect(await service.resolve('t1', 'PO', 75000)).toBeNull();
    });

    it('priority breaks exact ties', async () => {
      ruleRepo.find.mockResolvedValue([
        { ...rules[1], id: 'low', priority: 0 },
        { ...rules[1], id: 'high', priority: 10 },
      ]);
      expect((await service.resolve('t1', 'PO', 100))!.id).toBe('high');
    });
  });

  it('startForDocument routes into the engine with matrix context', async () => {
    ruleRepo.find.mockResolvedValue([{
      id: 'r1', docType: 'EXPENSE_CLAIM', minAmount: 0, maxAmount: null, orgUnitId: null,
      priority: 0, isActive: true, approverChain: [{ type: 'role', value: 'HR Manager' }], definitionId: 'def-9',
    }]);
    const instance = await service.startForDocument('t1', 'user-1', {
      docType: 'EXPENSE_CLAIM', amount: 750, subjectType: 'expense_claim', subjectId: 'claim-1',
    });
    expect(instance.id).toBe('wf-instance-1');
    expect(workflowService.startWorkflow).toHaveBeenCalledWith('t1', 'user-1', expect.objectContaining({
      definitionId: 'def-9',
      subjectId: 'claim-1',
      context: expect.objectContaining({ amount: 750, matrixRuleId: 'r1' }),
    }));
  });

  it('startForDocument fails clearly when no rule matches', async () => {
    ruleRepo.find.mockResolvedValue([]);
    await expect(service.startForDocument('t1', 'u1', {
      docType: 'PO', amount: 1, subjectType: 'po', subjectId: 'p1',
    })).rejects.toThrow(NotFoundException);
  });

  it('deleting a rule retires its generated definition instead of deleting it', async () => {
    ruleRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', definitionId: 'def-1' });
    definitionRepo.findOne.mockResolvedValue({ id: 'def-1', tenantId: 't1', isActive: true });
    await service.deleteRule('t1', 'r1');
    expect(definitionRepo.save.mock.calls[0][0].isActive).toBe(false);
    expect(ruleRepo.delete).toHaveBeenCalledWith({ id: 'r1', tenantId: 't1' });
  });
});
