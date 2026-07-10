import { BadRequestException } from '@nestjs/common';
import { ActionPlanningService } from './action-planning.service';
import { ActionPlanStatus, ActionItemStatus, WatchStatus } from './entities/action-planning.entity';

const mockRepo = () => ({
  create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
  save: jest.fn((x: any) => Promise.resolve({ id: x.id ?? 'saved-1', ...x })),
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
});

describe('ActionPlanningService', () => {
  let service: ActionPlanningService;
  let planRepo: any, itemRepo: any, watchRepo: any, automation: any;

  beforeEach(() => {
    planRepo = mockRepo(); itemRepo = mockRepo(); watchRepo = mockRepo();
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    service = new ActionPlanningService(planRepo, itemRepo, watchRepo, automation);
  });

  describe('survey action plans', () => {
    it('creates a plan and emits action_plan.created', async () => {
      const p = await service.createPlan('t1', { title: 'Improve recognition', drivers: [{ theme: 'Recognition', score: 2.9 }] });
      expect(p).toMatchObject({ title: 'Improve recognition', status: ActionPlanStatus.OPEN });
      expect(automation.emit).toHaveBeenCalledWith('t1', 'action_plan.created', expect.objectContaining({ title: 'Improve recognition' }));
    });

    it('reports progress as % of items done', async () => {
      planRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1' });
      itemRepo.find.mockResolvedValue([
        { status: ActionItemStatus.DONE }, { status: ActionItemStatus.DONE }, { status: ActionItemStatus.TODO }, { status: ActionItemStatus.DOING },
      ]);
      const { progressPct } = await service.getPlan('t1', 'p1');
      expect(progressPct).toBe(50);
    });

    it('moves the plan to IN_PROGRESS when an item starts and COMPLETED when all done', async () => {
      itemRepo.findOne.mockResolvedValue({ id: 'i1', tenantId: 't1', planId: 'p1', status: ActionItemStatus.TODO });
      planRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', status: ActionPlanStatus.OPEN });
      itemRepo.find.mockResolvedValue([{ status: ActionItemStatus.DOING }, { status: ActionItemStatus.TODO }]);
      await service.updateItemStatus('t1', 'i1', ActionItemStatus.DOING);
      expect(planRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ActionPlanStatus.IN_PROGRESS }));

      itemRepo.findOne.mockResolvedValue({ id: 'i1', tenantId: 't1', planId: 'p1', status: ActionItemStatus.DOING });
      planRepo.findOne.mockResolvedValue({ id: 'p1', tenantId: 't1', status: ActionPlanStatus.IN_PROGRESS });
      itemRepo.find.mockResolvedValue([{ status: ActionItemStatus.DONE }]);
      await service.updateItemStatus('t1', 'i1', ActionItemStatus.DONE);
      expect(planRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: ActionPlanStatus.COMPLETED }));
    });
  });

  describe('attrition watchlist', () => {
    it('derives the risk band from the score and emits attrition.flagged', async () => {
      watchRepo.findOne.mockResolvedValue(null);
      const w = await service.addToWatch('t1', { employeeId: 'e1', employeeName: 'Ann', riskScore: 82, reasons: ['comp gap'] });
      expect(w).toMatchObject({ riskBand: 'HIGH', status: WatchStatus.WATCHING });
      expect(automation.emit).toHaveBeenCalledWith('t1', 'attrition.flagged', expect.objectContaining({ riskBand: 'HIGH' }));
    });

    it('refreshes an existing active watch instead of duplicating', async () => {
      watchRepo.findOne.mockResolvedValue({ id: 'w1', tenantId: 't1', employeeId: 'e1', status: WatchStatus.WATCHING, riskScore: 50, riskBand: 'MEDIUM', reasons: [] });
      const w = await service.addToWatch('t1', { employeeId: 'e1', employeeName: 'Ann', riskScore: 30 });
      expect(w.riskBand).toBe('LOW');
      expect(automation.emit).not.toHaveBeenCalled();
    });

    it('recording a retention action moves WATCHING → ACTIONED', async () => {
      watchRepo.findOne.mockResolvedValue({ id: 'w1', tenantId: 't1', status: WatchStatus.WATCHING, retentionActions: [] });
      const w = await service.addRetentionAction('t1', 'w1', { action: 'Comp review' });
      expect(w.status).toBe(WatchStatus.ACTIONED);
      expect(w.retentionActions).toHaveLength(1);
    });

    it('summarises the watchlist by band and status', async () => {
      watchRepo.find.mockResolvedValue([
        { riskBand: 'HIGH', status: WatchStatus.WATCHING }, { riskBand: 'HIGH', status: WatchStatus.ACTIONED }, { riskBand: 'LOW', status: WatchStatus.RETAINED },
      ]);
      const s = await service.watchSummary('t1');
      expect(s.total).toBe(3);
      expect(s.byBand).toEqual({ HIGH: 2, LOW: 1 });
      expect(s.byStatus).toMatchObject({ WATCHING: 1, ACTIONED: 1, RETAINED: 1 });
    });
  });
});
