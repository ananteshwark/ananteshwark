import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../finance/ar/entities/customer.entity';
import { Invoice, InvoiceStatus } from '../finance/ar/entities/invoice.entity';
import { SalesOrder, SalesOrderStatus } from './entities/sales-order.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type CreditStatus = 'OK' | 'WARNING' | 'BLOCKED';

export interface CreditCheckResult {
  status: CreditStatus;
  available: number;
  limit: number;
  exposure: number;
  message?: string;
}

export interface CreditReportRow {
  customerId: string;
  code: string;
  name: string;
  creditLimit: number;
  creditExposure: number;
  available: number;
  utilizationPct: number;
  creditRating: string | null;
  creditCheckMode: string;
}

@Injectable()
export class CreditService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(SalesOrder)
    private readonly orderRepo: Repository<SalesOrder>,
  ) {}

  async checkCredit(tenantId: string, customerId: string, orderAmount: number): Promise<CreditCheckResult> {
    const customer = await this.customerRepo.findOne({ where: { tenantId, id: customerId } });
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);

    const mode = (customer as any).creditCheckMode || 'WARNING';
    const limit = round2(Number(customer.creditLimit) || 0);
    const exposure = round2(Number((customer as any).creditExposure) || 0);
    const projected = round2(exposure + (orderAmount || 0));
    const available = round2(limit - exposure);

    // No credit checking
    if (mode === 'NONE' || mode === 'OFF') {
      return { status: 'OK', available, limit, exposure };
    }

    // Limit of 0 with checking enabled is treated as "no limit set" -> OK
    if (limit <= 0) {
      return { status: 'OK', available, limit, exposure };
    }

    if (projected > limit) {
      if (mode === 'BLOCK' || mode === 'BLOCKED') {
        return {
          status: 'BLOCKED',
          available,
          limit,
          exposure,
          message: `Credit limit exceeded. Limit ${limit}, exposure ${exposure}, order ${round2(orderAmount || 0)} would bring total to ${projected}.`,
        };
      }
      return {
        status: 'WARNING',
        available,
        limit,
        exposure,
        message: `Credit limit would be exceeded. Limit ${limit}, exposure ${exposure}, order ${round2(orderAmount || 0)} brings total to ${projected}.`,
      };
    }

    return { status: 'OK', available, limit, exposure };
  }

  /** Recalculate exposure = open AR invoices balance + confirmed/unshipped SO totals. */
  async updateExposure(tenantId: string, customerId: string): Promise<number> {
    const customer = await this.customerRepo.findOne({ where: { tenantId, id: customerId } });
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);

    // Open invoices: not VOID, not PAID; sum balance due.
    const invRow = await this.invoiceRepo
      .createQueryBuilder('i')
      .select('COALESCE(SUM(i.balanceDue), 0)', 'sum')
      .where('i.tenantId = :tenantId', { tenantId })
      .andWhere('i.customerId = :customerId', { customerId })
      .andWhere('i.status NOT IN (:...closed)', { closed: [InvoiceStatus.VOID, InvoiceStatus.PAID] })
      .getRawOne();
    const openInvoices = Number(invRow?.sum) || 0;

    // Confirmed but not yet shipped/completed sales orders.
    const soRow = await this.orderRepo
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.total), 0)', 'sum')
      .where('o.tenantId = :tenantId', { tenantId })
      .andWhere('o.customerId = :customerId', { customerId })
      .andWhere('o.status IN (:...statuses)', {
        statuses: [SalesOrderStatus.CONFIRMED, SalesOrderStatus.IN_PROGRESS],
      })
      .getRawOne();
    const openOrders = Number(soRow?.sum) || 0;

    const exposure = round2(openInvoices + openOrders);
    (customer as any).creditExposure = exposure;
    await this.customerRepo.save(customer);
    return exposure;
  }

  async getCreditReport(tenantId: string): Promise<CreditReportRow[]> {
    const customers = await this.customerRepo.find({ where: { tenantId }, order: { name: 'ASC' } });
    return customers.map((c) => {
      const limit = round2(Number(c.creditLimit) || 0);
      const exposure = round2(Number((c as any).creditExposure) || 0);
      const available = round2(limit - exposure);
      const utilizationPct = limit > 0 ? round2((exposure / limit) * 100) : 0;
      return {
        customerId: c.id,
        code: c.code,
        name: c.name,
        creditLimit: limit,
        creditExposure: exposure,
        available,
        utilizationPct,
        creditRating: (c as any).creditRating ?? null,
        creditCheckMode: (c as any).creditCheckMode || 'WARNING',
      };
    });
  }

  async updateCreditSettings(
    tenantId: string,
    customerId: string,
    dto: { creditLimit?: number; creditRating?: string | null; creditCheckMode?: string },
  ): Promise<Customer> {
    const customer = await this.customerRepo.findOne({ where: { tenantId, id: customerId } });
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);
    if (dto.creditLimit != null) customer.creditLimit = dto.creditLimit;
    if (dto.creditRating !== undefined) (customer as any).creditRating = dto.creditRating;
    if (dto.creditCheckMode != null) (customer as any).creditCheckMode = dto.creditCheckMode;
    return this.customerRepo.save(customer);
  }
}
