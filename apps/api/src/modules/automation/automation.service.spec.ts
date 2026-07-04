import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { AutomationRunStatus } from './entities/automation-run.entity';

/**
 * Automation engine: rule matching (event + AND-ed conditions with dot-path
 * fields), action execution (NOTIFY templating, WEBHOOK forward), run
 * logging with per-action failure isolation, catalog validation on rule
 * CRUD, and the hard guarantee that emit() never throws into the calling
 * business workflow.
 */
describe('AutomationService', () => {
  let service: AutomationService;
  let ruleRepo: any, runRepo: any, notifications: any, webhooks: any, email: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(x)),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    remove: jest.fn().mockResolvedValue(undefined),
  });

  const rule = (over: any = {}) => ({
    id: 'r1', tenantId: 't1', name: 'Big expense alert', triggerEvent: 'expense.approved',
    conditions: [], actions: [{ type: 'NOTIFY', params: { userId: 'cfo', title: 'Expense {{claimNumber}}', body: '{{totalAmount}}' } }],
    isActive: true, runCount: 0, ...over,
  });

  beforeEach(() => {
    ruleRepo = mockRepo(); runRepo = mockRepo();
    notifications = { sendInApp: jest.fn().mockResolvedValue({}) };
    webhooks = { dispatch: jest.fn().mockResolvedValue(undefined) };
    email = { sendEmail: jest.fn().mockResolvedValue({ status: 'SENT' }) };
    service = new AutomationService(ruleRepo, runRepo, notifications, webhooks, email);
  });

  it('emit always forwards the event to webhook subscriptions', async () => {
    await service.emit('t1', 'po.approved', { poId: 'p1' });
    expect(webhooks.dispatch).toHaveBeenCalledWith('t1', 'po.approved', { poId: 'p1' });
  });

  it('a matching rule renders templates into an in-app notification and logs the run', async () => {
    ruleRepo.find.mockResolvedValue([rule()]);
    await service.emit('t1', 'expense.approved', { claimNumber: 'EXP-000042', totalAmount: 1500 });
    expect(notifications.sendInApp).toHaveBeenCalledWith(
      't1', 'cfo', 'Expense EXP-000042', '1500', { event: 'expense.approved' });
    expect(runRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      ruleId: 'r1', event: 'expense.approved', status: AutomationRunStatus.SUCCESS,
    }));
  });

  it('conditions gate the rule: gt on a payload field', async () => {
    ruleRepo.find.mockResolvedValue([rule({ conditions: [{ field: 'totalAmount', operator: 'gt', value: 1000 }] })]);
    await service.emit('t1', 'expense.approved', { claimNumber: 'X', totalAmount: 500 });
    expect(notifications.sendInApp).not.toHaveBeenCalled();

    await service.emit('t1', 'expense.approved', { claimNumber: 'X', totalAmount: 5000 });
    expect(notifications.sendInApp).toHaveBeenCalledTimes(1);
  });

  it('matches() supports dot-paths and all operators', () => {
    const payload = { order: { total: 100, customer: 'Acme Corp' }, flag: null };
    expect(service.matches([{ field: 'order.total', operator: 'eq', value: 100 }], payload)).toBe(true);
    expect(service.matches([{ field: 'order.total', operator: 'neq', value: 100 }], payload)).toBe(false);
    expect(service.matches([{ field: 'order.total', operator: 'gte', value: 100 }], payload)).toBe(true);
    expect(service.matches([{ field: 'order.total', operator: 'lt', value: 100 }], payload)).toBe(false);
    expect(service.matches([{ field: 'order.total', operator: 'lte', value: 100 }], payload)).toBe(true);
    expect(service.matches([{ field: 'order.customer', operator: 'contains', value: 'acme' }], payload)).toBe(true);
    expect(service.matches([{ field: 'flag', operator: 'exists' }], payload)).toBe(false);
    expect(service.matches([{ field: 'order', operator: 'exists' }], payload)).toBe(true);
    // AND semantics
    expect(service.matches([
      { field: 'order.total', operator: 'gte', value: 100 },
      { field: 'order.customer', operator: 'contains', value: 'globex' },
    ], payload)).toBe(false);
  });

  it('the NOTIFY target can come from the payload via userIdField', async () => {
    ruleRepo.find.mockResolvedValue([rule({
      actions: [{ type: 'NOTIFY', params: { userIdField: 'approvedById', title: 'hi', body: 'b' } }],
    })]);
    await service.emit('t1', 'expense.approved', { approvedById: 'mgr-9' });
    expect(notifications.sendInApp).toHaveBeenCalledWith('t1', 'mgr-9', 'hi', 'b', expect.anything());
  });

  it('a failing action is isolated: other actions still run, status is PARTIAL', async () => {
    notifications.sendInApp.mockRejectedValue(new Error('notify down'));
    ruleRepo.find.mockResolvedValue([rule({
      actions: [
        { type: 'NOTIFY', params: { userId: 'u1' } },
        { type: 'WEBHOOK', params: { event: 'custom.event' } },
      ],
    })]);
    await service.emit('t1', 'expense.approved', { x: 1 });
    expect(webhooks.dispatch).toHaveBeenCalledWith('t1', 'custom.event', { x: 1 });
    expect(runRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      status: AutomationRunStatus.PARTIAL,
      detail: expect.stringContaining('notify down'),
    }));
  });

  it('emit NEVER throws into the business workflow, even if everything is down', async () => {
    ruleRepo.find.mockRejectedValue(new Error('db down'));
    webhooks.dispatch.mockRejectedValue(new Error('webhooks down'));
    await expect(service.emit('t1', 'po.approved', {})).resolves.toBeUndefined();
  });

  it('inactive rules are never loaded', async () => {
    await service.emit('t1', 'expense.approved', {});
    expect(ruleRepo.find).toHaveBeenCalledWith({
      where: { tenantId: 't1', triggerEvent: 'expense.approved', isActive: true },
    });
  });

  it('createRule validates the event against the catalog and requires actions', async () => {
    await expect(service.createRule('t1', { name: 'x', triggerEvent: 'not.an.event', actions: [{ type: 'NOTIFY', params: {} }] } as any))
      .rejects.toThrow(BadRequestException);
    await expect(service.createRule('t1', { name: 'x', triggerEvent: 'po.approved', actions: [] } as any))
      .rejects.toThrow('At least one action');

    const r = await service.createRule('t1', {
      name: 'PO alert', triggerEvent: 'po.approved',
      actions: [{ type: 'NOTIFY', params: { userId: 'u1' } }],
    } as any);
    expect(r.isActive).toBe(true);
    expect(r.tenantId).toBe('t1');
  });

  it('testRule fires the rule against a sample payload and reports the match', async () => {
    ruleRepo.findOne.mockResolvedValue(rule({ conditions: [{ field: 'totalAmount', operator: 'gt', value: 100 }] }));
    const miss = await service.testRule('t1', 'r1', { totalAmount: 50 });
    expect(miss.matched).toBe(false);
    expect(notifications.sendInApp).not.toHaveBeenCalled();

    const hit = await service.testRule('t1', 'r1', { totalAmount: 500, claimNumber: 'E-1' });
    expect(hit.matched).toBe(true);
    expect(notifications.sendInApp).toHaveBeenCalled();
  });

  it('rule lookups are tenant-scoped 404s', async () => {
    await expect(service.getRule('t2', 'ghost')).rejects.toThrow(NotFoundException);
    expect(ruleRepo.findOne).toHaveBeenCalledWith({ where: { id: 'ghost', tenantId: 't2' } });
  });
});
