import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Customer } from '../finance/ar/entities/customer.entity';
import { Invoice, InvoiceStatus } from '../finance/ar/entities/invoice.entity';
import { CustomerReceipt } from '../finance/ar/entities/customer-receipt.entity';
import { SalesOrder } from '../sales/entities/sales-order.entity';
import { CrmContact } from './entities/crm-contact.entity';
import { CrmOpportunity } from './entities/crm-opportunity.entity';
import { CrmActivity } from './entities/crm-activity.entity';
import { CrmQuote } from './entities/crm-quote.entity';
import { ServiceTicket, TicketStatus } from './entities/service-ticket.entity';

export interface TimelineEvent {
  type:
    | 'INVOICE'
    | 'RECEIPT'
    | 'SALES_ORDER'
    | 'OPPORTUNITY'
    | 'ACTIVITY'
    | 'QUOTE'
    | 'TICKET';
  date: string;
  title: string;
  subtitle: string;
  amount?: number;
  status?: string;
  refId: string;
}

const OPEN_INVOICE_STATUSES = [
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIAL,
  InvoiceStatus.OVERDUE,
];

const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class Customer360Service {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(CustomerReceipt)
    private readonly receiptRepo: Repository<CustomerReceipt>,
    @InjectRepository(SalesOrder)
    private readonly soRepo: Repository<SalesOrder>,
    @InjectRepository(CrmContact)
    private readonly contactRepo: Repository<CrmContact>,
    @InjectRepository(CrmOpportunity)
    private readonly opportunityRepo: Repository<CrmOpportunity>,
    @InjectRepository(CrmActivity)
    private readonly activityRepo: Repository<CrmActivity>,
    @InjectRepository(CrmQuote)
    private readonly quoteRepo: Repository<CrmQuote>,
    @InjectRepository(ServiceTicket)
    private readonly ticketRepo: Repository<ServiceTicket>,
  ) {}

  /** Light list for the picker. Reuses fin_customers. */
  async listCustomersForPicker(
    tenantId: string,
    search?: string,
  ): Promise<Array<{ id: string; name: string; code: string }>> {
    try {
      const qb = this.customerRepo
        .createQueryBuilder('c')
        .where('c.tenant_id = :tenantId', { tenantId });
      if (search && search.trim()) {
        qb.andWhere('(c.name ILIKE :s OR c.code ILIKE :s OR c.email ILIKE :s)', {
          s: `%${search.trim()}%`,
        });
      }
      const rows = await qb.orderBy('c.name', 'ASC').take(200).getMany();
      return rows.map((c) => ({ id: c.id, name: c.name, code: c.code }));
    } catch {
      return [];
    }
  }

  async getCustomer360(tenantId: string, customerId: string) {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId, tenantId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Resolve CRM contacts linked to this customer (best-effort by name/company/email).
    const contactIds = await this.resolveContactIds(tenantId, customer);

    const [invoices, receipts, salesOrders, opportunities, activities, quotes, tickets] =
      await Promise.all([
        this.safe(() =>
          this.invoiceRepo.find({
            where: { tenantId, customerId },
            order: { invoiceDate: 'DESC' },
          }),
        ),
        this.safe(() =>
          this.receiptRepo.find({
            where: { tenantId, customerId },
            order: { receiptDate: 'DESC' },
          }),
        ),
        this.safe(() =>
          this.soRepo.find({
            where: { tenantId, customerId },
            order: { orderDate: 'DESC' },
          }),
        ),
        this.safe(() =>
          contactIds.length
            ? this.opportunityRepo.find({
                where: { tenantId, contactId: In(contactIds) },
                order: { createdAt: 'DESC' },
              })
            : Promise.resolve([]),
        ),
        this.safe(() =>
          contactIds.length
            ? this.activityRepo.find({
                where: { tenantId, contactId: In(contactIds) },
                order: { activityDate: 'DESC' },
              })
            : Promise.resolve([]),
        ),
        this.safe(() =>
          contactIds.length
            ? this.quoteRepo.find({
                where: { tenantId, contactId: In(contactIds) },
                order: { quoteDate: 'DESC' },
              })
            : Promise.resolve([]),
        ),
        this.safe(() =>
          this.ticketRepo.find({
            where: { tenantId, customerId },
            order: { createdAt: 'DESC' },
          }),
        ),
      ]);

    const financialSummary = this.buildFinancialSummary(customer, invoices, receipts);
    const timeline = this.buildTimeline(
      invoices,
      receipts,
      salesOrders,
      opportunities,
      activities,
      quotes,
      tickets,
    );

    const openInvoices = invoices.filter((i) =>
      OPEN_INVOICE_STATUSES.includes(i.status),
    ).length;
    const openTickets = tickets.filter(
      (t) => t.status !== TicketStatus.RESOLVED && t.status !== TicketStatus.CLOSED,
    ).length;
    const openOpportunities = opportunities.filter(
      (o) => o.stage !== 'CLOSED_WON' && o.stage !== 'CLOSED_LOST',
    ).length;

    const creditAvailable = (customer.creditLimit || 0) - (customer.creditExposure || 0);

    return {
      customer: {
        id: customer.id,
        code: customer.code,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        taxId: customer.taxId,
        currency: customer.currency,
        status: customer.status,
        creditLimit: customer.creditLimit || 0,
        creditExposure: customer.creditExposure || 0,
        creditAvailable,
        creditRating: customer.creditRating,
        paymentTerms: customer.paymentTerms,
      },
      financialSummary,
      timeline,
      counts: {
        openInvoices,
        openTickets,
        openOpportunities,
        salesOrders: salesOrders.length,
      },
    };
  }

  // ─── helpers ────────────────────────────────────────────────────

  private async safe<T>(fn: () => Promise<T[]>): Promise<T[]> {
    try {
      return (await fn()) ?? [];
    } catch {
      return [];
    }
  }

  private async resolveContactIds(
    tenantId: string,
    customer: Customer,
  ): Promise<string[]> {
    try {
      const qb = this.contactRepo
        .createQueryBuilder('ct')
        .where('ct.tenant_id = :tenantId', { tenantId });
      const conditions: string[] = [];
      const params: Record<string, any> = { tenantId };
      if (customer.name) {
        conditions.push('ct.company ILIKE :name');
        params.name = customer.name;
      }
      if (customer.email) {
        conditions.push('ct.email = :email');
        params.email = customer.email;
      }
      if (!conditions.length) return [];
      qb.andWhere(`(${conditions.join(' OR ')})`, params);
      const rows = await qb.select('ct.id', 'id').getRawMany<{ id: string }>();
      return rows.map((r) => r.id);
    } catch {
      return [];
    }
  }

  private buildFinancialSummary(
    customer: Customer,
    invoices: Invoice[],
    receipts: CustomerReceipt[],
  ) {
    const nonVoid = invoices.filter((i) => i.status !== InvoiceStatus.VOID);
    const totalInvoiced = nonVoid.reduce((s, i) => s + Number(i.total || 0), 0);
    const totalReceived = receipts.reduce((s, r) => s + Number(r.amount || 0), 0);
    const outstandingBalance = nonVoid
      .filter((i) => OPEN_INVOICE_STATUSES.includes(i.status))
      .reduce((s, i) => s + Number(i.balanceDue || 0), 0);

    const t = today();
    const overdueAmount = nonVoid
      .filter(
        (i) =>
          OPEN_INVOICE_STATUSES.includes(i.status) &&
          i.dueDate &&
          i.dueDate < t &&
          Number(i.balanceDue || 0) > 0,
      )
      .reduce((s, i) => s + Number(i.balanceDue || 0), 0);

    // Best-effort avg days to pay: for paid invoices, days between invoiceDate
    // and the closest later receipt date.
    const avgDaysToPay = this.estimateAvgDaysToPay(nonVoid, receipts);

    const creditLimit = Number(customer.creditLimit || 0);
    const creditExposure = Number(customer.creditExposure || 0);
    const creditUtilization =
      creditLimit > 0 ? Math.round((creditExposure / creditLimit) * 1000) / 10 : 0;

    return {
      outstandingBalance: Math.round(outstandingBalance * 100) / 100,
      totalInvoiced: Math.round(totalInvoiced * 100) / 100,
      totalReceived: Math.round(totalReceived * 100) / 100,
      overdueAmount: Math.round(overdueAmount * 100) / 100,
      avgDaysToPay,
      creditUtilization,
    };
  }

  private estimateAvgDaysToPay(
    invoices: Invoice[],
    receipts: CustomerReceipt[],
  ): number {
    const paid = invoices.filter((i) => i.status === InvoiceStatus.PAID && i.invoiceDate);
    if (!paid.length || !receipts.length) return 0;
    const receiptDates = receipts
      .map((r) => r.receiptDate)
      .filter(Boolean)
      .sort();
    const days: number[] = [];
    for (const inv of paid) {
      const invDate = new Date(inv.invoiceDate).getTime();
      const pay = receiptDates.find((d) => new Date(d).getTime() >= invDate);
      if (pay) {
        const diff = (new Date(pay).getTime() - invDate) / 86400000;
        if (diff >= 0 && diff < 3650) days.push(diff);
      }
    }
    if (!days.length) return 0;
    return Math.round(days.reduce((s, d) => s + d, 0) / days.length);
  }

  private buildTimeline(
    invoices: Invoice[],
    receipts: CustomerReceipt[],
    salesOrders: SalesOrder[],
    opportunities: CrmOpportunity[],
    activities: CrmActivity[],
    quotes: CrmQuote[],
    tickets: ServiceTicket[],
  ): TimelineEvent[] {
    const events: TimelineEvent[] = [];

    for (const i of invoices) {
      events.push({
        type: 'INVOICE',
        date: i.invoiceDate,
        title: `Invoice ${i.invoiceNumber}`,
        subtitle: `Due ${i.dueDate ?? '—'} • Balance ${Number(i.balanceDue || 0).toFixed(2)}`,
        amount: Number(i.total || 0),
        status: i.status,
        refId: i.id,
      });
    }
    for (const r of receipts) {
      events.push({
        type: 'RECEIPT',
        date: r.receiptDate,
        title: `Receipt ${r.receiptNumber}`,
        subtitle: `${r.method}${r.reference ? ` • ${r.reference}` : ''}`,
        amount: Number(r.amount || 0),
        status: 'RECEIVED',
        refId: r.id,
      });
    }
    for (const so of salesOrders) {
      events.push({
        type: 'SALES_ORDER',
        date: so.orderDate,
        title: `Sales Order ${so.orderNumber}`,
        subtitle: so.expectedDeliveryDate
          ? `Expected ${so.expectedDeliveryDate}`
          : (so.contactName ?? ''),
        amount: Number(so.total || 0),
        status: so.status,
        refId: so.id,
      });
    }
    for (const o of opportunities) {
      events.push({
        type: 'OPPORTUNITY',
        date: this.dateOnly(o.createdAt),
        title: o.title,
        subtitle: `Stage ${o.stage} • ${o.probability}% probability`,
        amount: o.value != null ? Number(o.value) : undefined,
        status: o.stage,
        refId: o.id,
      });
    }
    for (const a of activities) {
      events.push({
        type: 'ACTIVITY',
        date: a.activityDate,
        title: a.subject,
        subtitle: `${a.type}${a.outcome ? ` • ${a.outcome}` : ''}`,
        status: a.status,
        refId: a.id,
      });
    }
    for (const q of quotes) {
      events.push({
        type: 'QUOTE',
        date: q.quoteDate,
        title: `Quote ${q.quoteNumber}`,
        subtitle: q.title,
        amount: Number(q.total || 0),
        status: q.status,
        refId: q.id,
      });
    }
    for (const t of tickets) {
      events.push({
        type: 'TICKET',
        date: this.dateOnly(t.createdAt),
        title: `${t.ticketNumber} • ${t.subject}`,
        subtitle: `${t.priority}${t.category ? ` • ${t.category}` : ''}`,
        status: t.status,
        refId: t.id,
      });
    }

    return events
      .filter((e) => !!e.date)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  private dateOnly(d: Date | string | null | undefined): string {
    if (!d) return '';
    try {
      return new Date(d).toISOString().slice(0, 10);
    } catch {
      return '';
    }
  }
}
