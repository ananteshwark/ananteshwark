import { AutomationSchedulerService } from './automation-scheduler.service';
import { InvoiceStatus } from '../finance/ar/entities/invoice.entity';
import { TicketStatus } from '../crm/entities/service-ticket.entity';

/**
 * Scheduled sweeps: overdue AR invoices flipped + emitted (status flip is
 * the dedupe), SLA breaches flagged + emitted, expiring contracts emitted
 * once per day, and one failing sweep never blocks the others.
 */
describe('AutomationSchedulerService', () => {
  let service: AutomationSchedulerService;
  let automation: any, invoiceRepo: any, ticketRepo: any, contractRepo: any;

  const mockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn((x: any) => Promise.resolve(x)),
  });

  beforeEach(() => {
    automation = { emit: jest.fn().mockResolvedValue(undefined) };
    invoiceRepo = mockRepo(); ticketRepo = mockRepo(); contractRepo = mockRepo();
    service = new AutomationSchedulerService(automation, invoiceRepo, ticketRepo, contractRepo);
  });

  it('flips due SENT/PARTIAL invoices to OVERDUE and emits per invoice', async () => {
    const inv: any = {
      id: 'i1', tenantId: 't1', status: InvoiceStatus.SENT, invoiceNumber: 'INV-1',
      customerId: 'c1', balanceDue: 250, dueDate: '2020-01-01',
    };
    invoiceRepo.find.mockResolvedValue([inv, { id: 'i2', tenantId: 't1', status: InvoiceStatus.SENT, balanceDue: 0, dueDate: '2020-01-01' }]);
    const r = await service.sweepNow();
    expect(r.overdueInvoices).toBe(1); // zero-balance one skipped
    expect(inv.status).toBe(InvoiceStatus.OVERDUE);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'ar_invoice.overdue', expect.objectContaining({
      invoiceId: 'i1', balanceDue: 250,
    }));
  });

  it('flags open tickets past their resolution deadline and emits', async () => {
    const late: any = {
      id: 'tk1', tenantId: 't1', slaBreached: false, status: TicketStatus.OPEN,
      ticketNumber: 'TKT-1', priority: 'HIGH', slaResolutionDueAt: new Date(Date.now() - 3600_000),
    };
    const onTime: any = {
      id: 'tk2', tenantId: 't1', slaBreached: false, status: TicketStatus.OPEN,
      slaResolutionDueAt: new Date(Date.now() + 3600_000),
    };
    ticketRepo.find.mockResolvedValue([late, onTime]);
    const r = await service.sweepNow();
    expect(r.slaBreaches).toBe(1);
    expect(late.slaBreached).toBe(true);
    expect(onTime.slaBreached).toBe(false);
    expect(automation.emit).toHaveBeenCalledWith('t1', 'ticket.sla_breached', expect.objectContaining({ ticketId: 'tk1' }));
  });

  it('emits expiring contracts once per day (deduped on repeat sweeps)', async () => {
    const soon = new Date(); soon.setDate(soon.getDate() + 10);
    contractRepo.find.mockResolvedValue([
      { id: 'c1', tenantId: 't1', contractNumber: 'CTR-1', title: 'MSA', endDate: soon.toISOString().slice(0, 10), status: 'ACTIVE' },
      { id: 'c2', tenantId: 't1', contractNumber: 'CTR-2', title: 'Old', endDate: '2099-01-01', status: 'ACTIVE' }, // beyond 30d
    ]);
    const first = await service.sweepNow();
    expect(first.expiringContracts).toBe(1);
    const second = await service.sweepNow();
    expect(second.expiringContracts).toBe(0); // deduped
  });

  it('one failing sweep never blocks the others', async () => {
    invoiceRepo.find.mockRejectedValue(new Error('ar down'));
    ticketRepo.find.mockResolvedValue([]);
    contractRepo.find.mockResolvedValue([]);
    const r = await service.sweepNow();
    expect(r).toEqual({ overdueInvoices: 0, slaBreaches: 0, expiringContracts: 0 });
  });

  it('does not start timers under jest', () => {
    service.onModuleInit(); // JEST_WORKER_ID is set in tests
    expect((service as any).timer).toBeNull();
  });
});
