import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BillingPlansService } from './billing-plans.service';
import { BillingMilestoneStatus } from './entities/billing-plan.entity';

/**
 * Billing plans: milestone percentages must sum to 100 with amounts derived
 * from the order total; billing is PENDING-only; upcoming billings window.
 */
describe('BillingPlansService', () => {
  let service: BillingPlansService;
  let planRepo: any;

  beforeEach(() => {
    planRepo = {
      create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
      save: jest.fn((x: any) => Promise.resolve(x)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    service = new BillingPlansService(planRepo);
  });

  it('createBillingPlan derives milestone amounts and enforces the 100% sum', async () => {
    await expect(service.createBillingPlan('t1', {
      salesOrderId: 'so1', orderTotal: 1000,
      milestones: [{ percentage: 30, billingDate: '2026-08-01' }, { percentage: 30, billingDate: '2026-09-01' }],
    })).rejects.toThrow('must sum to 100');

    const plan = await service.createBillingPlan('t1', {
      salesOrderId: 'so1', orderTotal: 1000,
      milestones: [
        { percentage: 40, billingDate: '2026-08-01', description: 'Kickoff' },
        { percentage: 60, billingDate: '2026-09-01' },
      ],
    });
    expect(plan.milestones[0]).toMatchObject({ milestoneNumber: 1, amount: 400, status: BillingMilestoneStatus.PENDING });
    expect(plan.milestones[1].amount).toBe(600);
  });

  it('createBillingPlan requires salesOrderId and orderTotal', async () => {
    await expect(service.createBillingPlan('t1', { orderTotal: 100 })).rejects.toThrow('salesOrderId');
    await expect(service.createBillingPlan('t1', { salesOrderId: 'so1' })).rejects.toThrow('orderTotal');
  });

  it('billMilestone is PENDING-only and records the invoice', async () => {
    const plan: any = {
      id: 'p1', tenantId: 't1',
      milestones: [{ milestoneNumber: 1, status: BillingMilestoneStatus.PENDING }],
    };
    planRepo.findOne.mockResolvedValue(plan);
    await service.billMilestone('t1', 'p1', 1, 'inv-1');
    expect(plan.milestones[0].status).toBe(BillingMilestoneStatus.BILLED);
    expect(plan.milestones[0].invoiceId).toBe('inv-1');

    await expect(service.billMilestone('t1', 'p1', 1)).rejects.toThrow('already BILLED');
    await expect(service.billMilestone('t1', 'p1', 9)).rejects.toThrow(NotFoundException);
  });

  it('getUpcomingBillings returns only pending milestones inside the window, sorted', async () => {
    const soon = new Date(); soon.setDate(soon.getDate() + 5);
    const sooner = new Date(); sooner.setDate(sooner.getDate() + 2);
    const far = new Date(); far.setDate(far.getDate() + 90);
    const d = (x: Date) => x.toISOString().split('T')[0];
    planRepo.find.mockResolvedValue([{
      id: 'p1', salesOrderId: 'so1',
      milestones: [
        { milestoneNumber: 1, status: BillingMilestoneStatus.PENDING, billingDate: d(soon), amount: 400 },
        { milestoneNumber: 2, status: BillingMilestoneStatus.PENDING, billingDate: d(sooner), amount: 100 },
        { milestoneNumber: 3, status: BillingMilestoneStatus.BILLED, billingDate: d(sooner), amount: 500 },
        { milestoneNumber: 4, status: BillingMilestoneStatus.PENDING, billingDate: d(far), amount: 900 },
      ],
    }]);
    const upcoming = await service.getUpcomingBillings('t1', 30);
    expect(upcoming.map((u: any) => u.milestoneNumber)).toEqual([2, 1]); // sorted by date, billed + far excluded
  });
});
