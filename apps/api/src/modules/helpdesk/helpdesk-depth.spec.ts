import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { HelpdeskService } from './helpdesk.service';
import { HrCaseCategory, HrCasePriority, HrCaseStatus } from './entities/hr-case.entity';
import { RoutingStrategy } from './entities/hr-case-routing-rule.entity';

/**
 * Phase 1 helpdesk depth: rule-based auto-assignment (round-robin +
 * least-loaded, specificity ordering), SLA escalation sweep, and CSAT.
 */
describe('HelpdeskService — depth', () => {
  let service: HelpdeskService;
  let caseRepo: any, commentRepo: any, routingRepo: any, automation: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: '3' }),
    }),
  });

  beforeEach(() => {
    caseRepo = mockRepo(); commentRepo = mockRepo(); routingRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new HelpdeskService(caseRepo, commentRepo, automation, routingRepo);
  });

  const rule = (over: any = {}) => ({
    id: 'r1', name: 'Payroll pool', category: null, priority: null,
    agentUserIds: ['agent-a', 'agent-b'], strategy: RoutingStrategy.ROUND_ROBIN,
    escalationUserId: null, lastAssignedIndex: -1, isActive: true, ...over,
  });

  describe('auto-assignment', () => {
    it('round-robin advances through the pool and persists the cursor', async () => {
      const r = rule();
      routingRepo.find.mockResolvedValue([r]);
      const first = await service.createCase('t1', 'u1', { subject: 'Payslip missing', description: '' });
      expect(first.assignedToId).toBe('agent-a');
      expect(r.lastAssignedIndex).toBe(0);
      const second = await service.createCase('t1', 'u1', { subject: 'Another', description: '' });
      expect(second.assignedToId).toBe('agent-b');
    });

    it('least-loaded picks the agent with fewest open cases', async () => {
      routingRepo.find.mockResolvedValue([rule({ strategy: RoutingStrategy.LEAST_LOADED })]);
      caseRepo.count
        .mockResolvedValueOnce(5)  // agent-a
        .mockResolvedValueOnce(1); // agent-b
      const created = await service.createCase('t1', 'u1', { subject: 'X', description: '' });
      expect(created.assignedToId).toBe('agent-b');
    });

    it('the most specific matching rule wins; mismatches are excluded', async () => {
      routingRepo.find.mockResolvedValue([
        rule({ id: 'catch-all', agentUserIds: ['generalist'] }),
        rule({ id: 'payroll', category: HrCaseCategory.PAYROLL, agentUserIds: ['payroll-pro'] }),
        rule({ id: 'it-only', category: HrCaseCategory.IT, agentUserIds: ['it-agent'] }),
      ]);
      const created = await service.createCase('t1', 'u1', {
        subject: 'Payslip missing', description: '', category: HrCaseCategory.PAYROLL,
      });
      expect(created.assignedToId).toBe('payroll-pro');
    });

    it('creation still succeeds when no rule matches or routing fails', async () => {
      routingRepo.find.mockRejectedValue(new Error('db down'));
      const created = await service.createCase('t1', 'u1', { subject: 'X', description: '' });
      expect(created.assignedToId).toBeUndefined();
      expect(automation.emit).toHaveBeenCalledWith('t1', 'hr_case.created', expect.anything());
    });

    it('routing rule CRUD validates the pool', async () => {
      await expect(service.createRoutingRule('t1', { name: 'Empty', agentUserIds: [] }))
        .rejects.toThrow(BadRequestException);
      const created = await service.createRoutingRule('t1', { name: 'Pool', agentUserIds: ['a'] });
      expect(created.tenantId).toBe('t1');
    });
  });

  describe('SLA escalation sweep', () => {
    it('escalates overdue cases once, reassigning to the escalation contact', async () => {
      caseRepo.find.mockResolvedValue([{
        id: 'c1', caseNumber: 'HRC-000001', subject: 'Stuck', category: HrCaseCategory.PAYROLL,
        priority: HrCasePriority.HIGH, status: HrCaseStatus.OPEN,
        slaDueAt: new Date(Date.now() - 3600_000), escalatedAt: null, assignedToId: 'agent-a',
      }]);
      routingRepo.find.mockResolvedValue([
        rule({ category: HrCaseCategory.PAYROLL, escalationUserId: 'hr-lead' }),
      ]);
      const result = await service.escalateOverdueSla('t1');
      expect(result.escalated).toBe(1);
      const saved = caseRepo.save.mock.calls[0][0];
      expect(saved.escalatedAt).toBeInstanceOf(Date);
      expect(saved.assignedToId).toBe('hr-lead');
      expect(automation.emit).toHaveBeenCalledWith('t1', 'hr_case.sla_escalated', expect.objectContaining({
        caseNumber: 'HRC-000001', assignedToId: 'hr-lead',
      }));
    });

    it('is a no-op when nothing is overdue', async () => {
      caseRepo.find.mockResolvedValue([]);
      expect(await service.escalateOverdueSla('t1')).toEqual({ escalated: 0 });
    });
  });

  describe('CSAT feedback', () => {
    const resolvedCase = (over: any = {}) => ({
      id: 'c1', tenantId: 't1', createdByUserId: 'u1',
      status: HrCaseStatus.RESOLVED, csatScore: null, ...over,
    });

    it('lets the requester rate a resolved case exactly once', async () => {
      caseRepo.findOne.mockResolvedValue(resolvedCase());
      const rated = await service.submitFeedback('t1', 'c1', 'u1', { score: 4, comment: 'Quick!' });
      expect(rated.csatScore).toBe(4);
      expect(rated.csatComment).toBe('Quick!');

      caseRepo.findOne.mockResolvedValue(resolvedCase({ csatScore: 4 }));
      await expect(service.submitFeedback('t1', 'c1', 'u1', { score: 5 }))
        .rejects.toThrow('already submitted');
    });

    it('rejects non-requesters, open cases, and out-of-range scores', async () => {
      caseRepo.findOne.mockResolvedValue(resolvedCase());
      await expect(service.submitFeedback('t1', 'c1', 'someone-else', { score: 4 }))
        .rejects.toThrow(ForbiddenException);
      caseRepo.findOne.mockResolvedValue(resolvedCase({ status: HrCaseStatus.OPEN }));
      await expect(service.submitFeedback('t1', 'c1', 'u1', { score: 4 }))
        .rejects.toThrow('resolved or closed');
      caseRepo.findOne.mockResolvedValue(resolvedCase());
      await expect(service.submitFeedback('t1', 'c1', 'u1', { score: 9 }))
        .rejects.toThrow('1 to 5');
    });
  });
});
