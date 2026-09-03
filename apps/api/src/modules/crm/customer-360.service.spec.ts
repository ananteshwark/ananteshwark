import { NotFoundException } from '@nestjs/common';
import { Customer360Service } from './customer-360.service';
import { InvoiceStatus } from '../finance/ar/entities/invoice.entity';
import { TicketStatus } from './entities/service-ticket.entity';

/**
 * Customer 360: financial summary math (outstanding, overdue, avg days to
 * pay, credit utilization), open counts, degraded sources returning empty
 * arrays instead of failing the whole view, and tenant-scoped 404.
 */
describe('Customer360Service', () => {
  let service: Customer360Service;
  let customerRepo: any, invoiceRepo: any, receiptRepo: any, soRepo: any,
    contactRepo: any, opportunityRepo: any, activityRepo: any, quoteRepo: any, ticketRepo: any;

  const mockRepo = () => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getRawMany: jest.fn().mockResolvedValue([]),
    })),
  });

  const customer = (over: any = {}) => ({
    id: 'c1', tenantId: 't1', code: 'CUST-1', name: 'Acme', email: 'ap@acme.com',
    creditLimit: 1000, creditExposure: 250, ...over,
  });

  beforeEach(() => {
    customerRepo = mockRepo(); invoiceRepo = mockRepo(); receiptRepo = mockRepo(); soRepo = mockRepo();
    contactRepo = mockRepo(); opportunityRepo = mockRepo(); activityRepo = mockRepo();
    quoteRepo = mockRepo(); ticketRepo = mockRepo();
    customerRepo.findOne.mockResolvedValue(customer());
    service = new Customer360Service(
      customerRepo, invoiceRepo, receiptRepo, soRepo,
      contactRepo, opportunityRepo, activityRepo, quoteRepo, ticketRepo,
    );
  });

  it('computes the financial summary: outstanding, overdue, credit utilization', async () => {
    invoiceRepo.find.mockResolvedValue([
      { id: 'i1', status: InvoiceStatus.SENT, total: 500, balanceDue: 500, dueDate: '2099-01-01', invoiceDate: '2026-01-01' },
      { id: 'i2', status: InvoiceStatus.OVERDUE, total: 300, balanceDue: 200, dueDate: '2020-01-01', invoiceDate: '2026-01-01' },
      { id: 'i3', status: InvoiceStatus.PAID, total: 400, balanceDue: 0, dueDate: '2020-01-01', invoiceDate: '2026-01-01' },
      { id: 'i4', status: InvoiceStatus.VOID, total: 999, balanceDue: 999, dueDate: '2020-01-01', invoiceDate: '2026-01-01' },
    ]);
    receiptRepo.find.mockResolvedValue([{ amount: 400, receiptDate: '2026-01-31' }]);
    const r = await service.getCustomer360('t1', 'c1');
    expect(r.financialSummary).toMatchObject({
      totalInvoiced: 1200,          // VOID excluded
      totalReceived: 400,
      outstandingBalance: 700,      // 500 + 200
      overdueAmount: 200,           // only the past-due open invoice
      avgDaysToPay: 30,             // paid invoice 2026-01-01 → receipt 2026-01-31
      creditUtilization: 25,        // 250 / 1000
    });
    expect(r.customer.creditAvailable).toBe(750);
    expect(r.counts.openInvoices).toBe(2);
  });

  it('counts only open tickets and open opportunities', async () => {
    ticketRepo.find.mockResolvedValue([
      { status: TicketStatus.OPEN },
      { status: TicketStatus.RESOLVED },
      { status: TicketStatus.CLOSED },
    ]);
    // contacts resolve → opportunities visible
    contactRepo.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(), andWhere: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([{ id: 'ct1' }]),
    });
    opportunityRepo.find.mockResolvedValue([
      { stage: 'QUALIFIED', createdAt: new Date() },
      { stage: 'CLOSED_WON', createdAt: new Date() },
    ]);
    const r = await service.getCustomer360('t1', 'c1');
    expect(r.counts.openTickets).toBe(1);
    expect(r.counts.openOpportunities).toBe(1);
  });

  it('a failing data source degrades to empty instead of breaking the view', async () => {
    invoiceRepo.find.mockRejectedValue(new Error('table missing'));
    ticketRepo.find.mockRejectedValue(new Error('down'));
    const r = await service.getCustomer360('t1', 'c1');
    expect(r.financialSummary.totalInvoiced).toBe(0);
    expect(r.counts.openTickets).toBe(0);
  });

  it('unknown customers 404 tenant-scoped; picker degrades to empty on errors', async () => {
    customerRepo.findOne.mockResolvedValue(null);
    await expect(service.getCustomer360('t2', 'ghost')).rejects.toThrow(NotFoundException);
    expect(customerRepo.findOne).toHaveBeenCalledWith({ where: { id: 'ghost', tenantId: 't2' } });

    customerRepo.createQueryBuilder.mockImplementation(() => { throw new Error('boom'); });
    expect(await service.listCustomersForPicker('t1', 'acme')).toEqual([]);
  });
});
