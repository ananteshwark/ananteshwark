import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { Employee } from '../hr/employees/entities/employee.entity';
import { Vendor } from '../finance/ap/entities/vendor.entity';
import { Bill } from '../finance/ap/entities/bill.entity';
import { Customer } from '../finance/ar/entities/customer.entity';
import { Invoice } from '../finance/ar/entities/invoice.entity';
import { PurchaseOrder } from '../procurement/po/entities/purchase-order.entity';
import { ServiceTicket } from '../crm/entities/service-ticket.entity';
import { Item } from '../inventory/entities/item.entity';

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  route: string;
}

export interface SearchGroup {
  type: string;
  label: string;
  results: SearchResultItem[];
}

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(Employee) private readonly employeeRepo: Repository<Employee>,
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(Bill) private readonly billRepo: Repository<Bill>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(PurchaseOrder) private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(ServiceTicket) private readonly ticketRepo: Repository<ServiceTicket>,
    @InjectRepository(Item) private readonly itemRepo: Repository<Item>,
  ) {}

  /**
   * Run a search source safely. If a column is missing or the query fails for
   * any reason, return an empty array so one broken source never breaks the
   * whole global search.
   */
  private async safe<T>(fn: () => Promise<T[]>): Promise<T[]> {
    try {
      return await fn();
    } catch {
      return [];
    }
  }

  async globalSearch(tenantId: string, q: string, limitPerType = 5): Promise<SearchGroup[]> {
    const term = (q ?? '').trim();
    if (term.length < 2) return [];
    const like = `%${term}%`;

    const groups: SearchGroup[] = [];

    // ── Employees ─────────────────────────────────────────────────────────────
    const employees = await this.safe(() =>
      this.employeeRepo.find({
        where: [
          { tenantId, firstName: ILike(like) },
          { tenantId, lastName: ILike(like) },
          { tenantId, employeeCode: ILike(like) },
          { tenantId, email: ILike(like) },
        ],
        take: limitPerType,
      }),
    );
    if (employees.length) {
      groups.push({
        type: 'employee',
        label: 'Employees',
        results: employees.map((e) => ({
          id: e.id,
          title: `${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() || e.employeeCode,
          subtitle: [e.employeeCode, e.email].filter(Boolean).join(' • '),
          route: '/hr/employees',
        })),
      });
    }

    // ── Vendors ───────────────────────────────────────────────────────────────
    const vendors = await this.safe(() =>
      this.vendorRepo.find({
        where: [
          { tenantId, name: ILike(like) },
          { tenantId, code: ILike(like) },
          { tenantId, email: ILike(like) },
        ],
        take: limitPerType,
      }),
    );
    if (vendors.length) {
      groups.push({
        type: 'vendor',
        label: 'Vendors',
        results: vendors.map((v) => ({
          id: v.id,
          title: v.name,
          subtitle: v.code,
          route: '/finance/vendors',
        })),
      });
    }

    // ── Customers ─────────────────────────────────────────────────────────────
    const customers = await this.safe(() =>
      this.customerRepo.find({
        where: [
          { tenantId, name: ILike(like) },
          { tenantId, code: ILike(like) },
          { tenantId, email: ILike(like) },
        ],
        take: limitPerType,
      }),
    );
    if (customers.length) {
      groups.push({
        type: 'customer',
        label: 'Customers',
        results: customers.map((c) => ({
          id: c.id,
          title: c.name,
          subtitle: c.code,
          route: '/finance/customers',
        })),
      });
    }

    // ── Bills ─────────────────────────────────────────────────────────────────
    const bills = await this.safe(() =>
      this.billRepo.find({
        where: [
          { tenantId, billNumber: ILike(like) },
          { tenantId, reference: ILike(like) },
        ],
        take: limitPerType,
      }),
    );
    if (bills.length) {
      groups.push({
        type: 'bill',
        label: 'Bills',
        results: bills.map((b) => ({
          id: b.id,
          title: b.billNumber,
          subtitle: b.status,
          route: '/finance/bills',
        })),
      });
    }

    // ── Invoices ──────────────────────────────────────────────────────────────
    const invoices = await this.safe(() =>
      this.invoiceRepo.find({
        where: [
          { tenantId, invoiceNumber: ILike(like) },
          { tenantId, reference: ILike(like) },
        ],
        take: limitPerType,
      }),
    );
    if (invoices.length) {
      groups.push({
        type: 'invoice',
        label: 'Invoices',
        results: invoices.map((i) => ({
          id: i.id,
          title: i.invoiceNumber,
          subtitle: i.status,
          route: '/finance/invoices',
        })),
      });
    }

    // ── Purchase Orders ───────────────────────────────────────────────────────
    const pos = await this.safe(() =>
      this.poRepo.find({
        where: [
          { tenantId, poNumber: ILike(like) },
          { tenantId, vendorName: ILike(like) },
        ],
        take: limitPerType,
      }),
    );
    if (pos.length) {
      groups.push({
        type: 'purchase_order',
        label: 'Purchase Orders',
        results: pos.map((p) => ({
          id: p.id,
          title: p.poNumber,
          subtitle: [p.vendorName, p.status].filter(Boolean).join(' • '),
          route: '/procurement/purchase-orders',
        })),
      });
    }

    // ── Service Tickets ───────────────────────────────────────────────────────
    const tickets = await this.safe(() =>
      this.ticketRepo.find({
        where: [
          { tenantId, ticketNumber: ILike(like) },
          { tenantId, subject: ILike(like) },
        ],
        take: limitPerType,
      }),
    );
    if (tickets.length) {
      groups.push({
        type: 'service_ticket',
        label: 'Service Tickets',
        results: tickets.map((t) => ({
          id: t.id,
          title: t.ticketNumber,
          subtitle: t.subject,
          route: '/crm/tickets',
        })),
      });
    }

    // ── Items ─────────────────────────────────────────────────────────────────
    const items = await this.safe(() =>
      this.itemRepo.find({
        where: [
          { tenantId, name: ILike(like) },
          { tenantId, code: ILike(like) },
        ],
        take: limitPerType,
      }),
    );
    if (items.length) {
      groups.push({
        type: 'item',
        label: 'Items',
        results: items.map((it) => ({
          id: it.id,
          title: it.name,
          subtitle: it.code,
          route: '/inventory',
        })),
      });
    }

    return groups;
  }
}
