import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DunningService } from './dunning.service';
import { DunningRunStatus } from './entities/dunning-run.entity';
import { InvoiceStatus } from '../ar/entities/invoice.entity';

/**
 * Dunning: a run groups overdue invoices per customer, skips disputed
 * invoices, picks the highest applicable level by days overdue; sending is
 * DRAFT-only; payment plans split installments with a rounding-correct last
 * installment and complete when fully paid.
 */
describe('DunningService', () => {
  let service: DunningService;
  let levelRepo: any, runRepo: any, letterRepo: any, planRepo: any, invoiceRepo: any, customerRepo: any, collectionsService: any;

  const mockRepo = () => ({
    create: jest.fn((x: any) => ({ id: 'gen-1', ...x })),
    save: jest.fn((x: any) => Promise.resolve(Array.isArray(x) ? x : { id: x.id ?? 'gen-1', ...x })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
  });

  const levels = [
    { id: 'lv1', levelNumber: 1, isActive: true, daysOverdueFrom: 1, daysOverdueTo: 30 },
    { id: 'lv2', levelNumber: 2, isActive: true, daysOverdueFrom: 31, daysOverdueTo: null },
  ];

  beforeEach(() => {
    levelRepo = mockRepo(); runRepo = mockRepo(); letterRepo = mockRepo(); planRepo = mockRepo();
    invoiceRepo = mockRepo(); customerRepo = mockRepo();
    collectionsService = { getDisputedInvoiceIds: jest.fn().mockResolvedValue(new Set()) };
    levelRepo.find.mockResolvedValue(levels);
    customerRepo.findOne.mockResolvedValue({ id: 'c1', name: 'Acme' });
    service = new DunningService(levelRepo, runRepo, letterRepo, planRepo, invoiceRepo, customerRepo, collectionsService);
  });

  it('runDunning requires configured levels', async () => {
    levelRepo.find.mockResolvedValue([]);
    await expect(service.runDunning('t1', { runDate: '2026-07-04' } as any)).rejects.toThrow('No dunning levels');
  });

  it('groups overdue invoices per customer and picks the level by worst days overdue', async () => {
    invoiceRepo.find.mockResolvedValue([
      // 10 days overdue → level 1 band; 40 days overdue → level 2 band (same customer → level 2 wins)
      { id: 'i1', customerId: 'c1', status: InvoiceStatus.SENT, dueDate: '2026-06-24', balanceDue: 100 },
      { id: 'i2', customerId: 'c1', status: InvoiceStatus.OVERDUE, dueDate: '2026-05-25', balanceDue: 200 },
      // paid invoice ignored
      { id: 'i3', customerId: 'c1', status: InvoiceStatus.PAID, dueDate: '2026-01-01', balanceDue: 0 },
    ]);
    const run = await service.runDunning('t1', { runDate: '2026-07-04' } as any);
    expect(letterRepo.create).toHaveBeenCalledTimes(1);
    expect(letterRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'c1', levelNumber: 2, overdueAmount: 300, invoiceIds: ['i1', 'i2'],
    }));
    expect(run.customerCount).toBe(1);
    expect(run.totalOverdue).toBe(300);
  });

  it('disputed invoices are suspended from dunning', async () => {
    collectionsService.getDisputedInvoiceIds.mockResolvedValue(new Set(['i1']));
    invoiceRepo.find.mockResolvedValue([
      { id: 'i1', customerId: 'c1', status: InvoiceStatus.SENT, dueDate: '2026-06-01', balanceDue: 100 },
    ]);
    const run = await service.runDunning('t1', { runDate: '2026-07-04' } as any);
    expect(run.customerCount).toBe(0);
    expect(letterRepo.create).not.toHaveBeenCalled();
  });

  it('sendDunningRun is DRAFT-only and stamps every letter SENT', async () => {
    runRepo.findOne.mockResolvedValue({ id: 'r1', tenantId: 't1', status: DunningRunStatus.SENT });
    await expect(service.sendDunningRun('t1', 'r1')).rejects.toThrow(BadRequestException);

    const run: any = { id: 'r1', tenantId: 't1', status: DunningRunStatus.DRAFT };
    runRepo.findOne.mockResolvedValue(run);
    const letter: any = { id: 'lt1', status: 'PENDING' };
    letterRepo.find.mockResolvedValue([letter]);
    await service.sendDunningRun('t1', 'r1');
    expect(letter.status).toBe('SENT');
    expect(letter.sentAt).toBeInstanceOf(Date);
    expect(run.status).toBe(DunningRunStatus.SENT);
  });

  it('createPaymentPlan splits installments and corrects rounding in the last one', async () => {
    const plan = await service.createPaymentPlan('t1', {
      customerId: 'c1', totalAmount: 100, installments: 3, startDate: '2026-07-01', frequency: 'MONTHLY',
    } as any);
    expect(plan.schedule).toHaveLength(3);
    expect(plan.schedule[0].amount).toBe(33.33);
    expect(plan.schedule[2].amount).toBe(33.34); // 100 - 2*33.33
    expect(plan.schedule[1].dueDate).toBe('2026-08-01'); // monthly stepping
  });

  it('recordInstallmentPaid tracks progress and completes the plan', async () => {
    const plan: any = {
      id: 'p1', tenantId: 't1', totalAmount: 100, amountPaid: 0, status: 'ACTIVE',
      schedule: [
        { dueDate: '2026-07-01', amount: 50, paid: false },
        { dueDate: '2026-08-01', amount: 50, paid: false },
      ],
    };
    planRepo.findOne.mockResolvedValue(plan);
    await service.recordInstallmentPaid('t1', 'p1', 0);
    expect(plan.amountPaid).toBe(50);
    expect(plan.status).toBe('ACTIVE');

    await service.recordInstallmentPaid('t1', 'p1', 1);
    expect(plan.amountPaid).toBe(100);
    expect(plan.status).toBe('COMPLETED');

    await expect(service.recordInstallmentPaid('t1', 'p1', 9)).rejects.toThrow('Invalid installment');
    planRepo.findOne.mockResolvedValue(null);
    await expect(service.recordInstallmentPaid('t2', 'ghost', 0)).rejects.toThrow(NotFoundException);
  });
});
