import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { roundMoney } from '../../../common/money/money.util';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CollectionNote, ContactMethod } from './entities/collection-note.entity';
import { PromiseToPay, PromiseStatus } from './entities/promise-to-pay.entity';
import { Dispute, DisputeStatus, DisputeReason } from './entities/dispute.entity';
import { Invoice, InvoiceStatus } from '../ar/entities/invoice.entity';
import { Customer } from '../ar/entities/customer.entity';

// Single source of truth for cent rounding (see common/money).
const round2 = roundMoney;

function daysBetween(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

@Injectable()
export class CollectionsService {
  constructor(
    @InjectRepository(CollectionNote) private readonly noteRepo: Repository<CollectionNote>,
    @InjectRepository(PromiseToPay) private readonly promiseRepo: Repository<PromiseToPay>,
    @InjectRepository(Dispute) private readonly disputeRepo: Repository<Dispute>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
  ) {}

  // ─── Ph-109: Workbench ────────────────────────────────────────────

  /**
   * Per-customer collections summary: outstanding aging buckets, open promises,
   * open disputes, last contact. asOf defaults to today.
   */
  async getWorkbench(tenantId: string, asOf?: string): Promise<any[]> {
    const today = asOf ?? new Date().toISOString().slice(0, 10);
    const invoices = await this.invoiceRepo.find({ where: { tenantId } });
    const open = invoices.filter(
      (i) =>
        [InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE].includes(i.status) &&
        Number(i.balanceDue) > 0,
    );

    const customers = await this.customerRepo.find({ where: { tenantId } });
    const custMap = new Map(customers.map((c) => [c.id, c]));

    const openPromises = await this.promiseRepo.find({ where: { tenantId, status: PromiseStatus.OPEN } });
    const openDisputes = await this.disputeRepo.find({
      where: { tenantId, status: In([DisputeStatus.OPEN, DisputeStatus.IN_REVIEW]) },
    });
    const notes = await this.noteRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });

    const byCustomer = new Map<string, any>();
    for (const inv of open) {
      if (!inv.customerId) continue;
      if (!byCustomer.has(inv.customerId)) {
        byCustomer.set(inv.customerId, {
          customerId: inv.customerId,
          customerName: custMap.get(inv.customerId)?.name ?? inv.customerId,
          totalOutstanding: 0,
          current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b90plus: 0,
          invoiceCount: 0, maxDaysOverdue: 0,
        });
      }
      const row = byCustomer.get(inv.customerId);
      const bal = round2(Number(inv.balanceDue));
      row.totalOutstanding = round2(row.totalOutstanding + bal);
      row.invoiceCount += 1;
      const overdue = daysBetween(inv.dueDate, today);
      if (overdue <= 0) row.current = round2(row.current + bal);
      else if (overdue <= 30) row.b1_30 = round2(row.b1_30 + bal);
      else if (overdue <= 60) row.b31_60 = round2(row.b31_60 + bal);
      else if (overdue <= 90) row.b61_90 = round2(row.b61_90 + bal);
      else row.b90plus = round2(row.b90plus + bal);
      row.maxDaysOverdue = Math.max(row.maxDaysOverdue, overdue);
    }

    for (const row of byCustomer.values()) {
      row.openPromises = openPromises.filter((p) => p.customerId === row.customerId).length;
      row.openDisputes = openDisputes.filter((d) => d.customerId === row.customerId).length;
      const lastNote = notes.find((n) => n.customerId === row.customerId);
      row.lastContactAt = lastNote?.createdAt ?? null;
    }

    return [...byCustomer.values()].sort((a, b) => b.maxDaysOverdue - a.maxDaysOverdue);
  }

  /** Drill-down: open invoices + notes + promises + disputes for one customer. */
  async getCustomerDetail(tenantId: string, customerId: string, asOf?: string): Promise<any> {
    const today = asOf ?? new Date().toISOString().slice(0, 10);
    const customer = await this.customerRepo.findOne({ where: { id: customerId, tenantId } });
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);
    const invoices = await this.invoiceRepo.find({ where: { tenantId, customerId } });
    const openInvoices = invoices
      .filter((i) => Number(i.balanceDue) > 0 && i.status !== InvoiceStatus.DRAFT)
      .map((i) => ({ ...i, daysOverdue: daysBetween(i.dueDate, today) }));
    return {
      customer,
      openInvoices,
      notes: await this.noteRepo.find({ where: { tenantId, customerId }, order: { createdAt: 'DESC' } }),
      promises: await this.promiseRepo.find({ where: { tenantId, customerId }, order: { promiseDate: 'DESC' } }),
      disputes: await this.disputeRepo.find({ where: { tenantId, customerId }, order: { createdAt: 'DESC' } }),
    };
  }

  async addNote(tenantId: string, data: {
    customerId: string; invoiceId?: string; contactMethod?: ContactMethod; note: string; collectorId?: string;
  }): Promise<CollectionNote> {
    if (!data.customerId) throw new BadRequestException('customerId is required');
    if (!data.note) throw new BadRequestException('note is required');
    const note = this.noteRepo.create({
      tenantId,
      customerId: data.customerId,
      invoiceId: data.invoiceId ?? null,
      contactMethod: data.contactMethod ?? ContactMethod.NOTE,
      note: data.note,
      collectorId: data.collectorId ?? null,
    } as any) as unknown as CollectionNote;
    return (this.noteRepo.save(note) as unknown) as Promise<CollectionNote>;
  }

  // ─── Ph-110: Promise-to-pay ───────────────────────────────────────

  async listPromises(tenantId: string, params: { customerId?: string; status?: PromiseStatus } = {}): Promise<PromiseToPay[]> {
    const where: any = { tenantId };
    if (params.customerId) where.customerId = params.customerId;
    if (params.status) where.status = params.status;
    return this.promiseRepo.find({ where, order: { promiseDate: 'ASC' } });
  }

  async createPromise(tenantId: string, data: {
    customerId: string; invoiceId?: string; amountPromised: number; promiseDate: string; notes?: string; collectorId?: string;
  }): Promise<PromiseToPay> {
    if (!data.customerId) throw new BadRequestException('customerId is required');
    if (!data.amountPromised || data.amountPromised <= 0) throw new BadRequestException('amountPromised must be > 0');
    if (!data.promiseDate) throw new BadRequestException('promiseDate is required');
    const promise = this.promiseRepo.create({
      tenantId,
      customerId: data.customerId,
      invoiceId: data.invoiceId ?? null,
      amountPromised: data.amountPromised,
      promiseDate: data.promiseDate,
      status: PromiseStatus.OPEN,
      amountKept: 0,
      notes: data.notes ?? null,
      collectorId: data.collectorId ?? null,
    } as any) as unknown as PromiseToPay;
    return (this.promiseRepo.save(promise) as unknown) as Promise<PromiseToPay>;
  }

  async resolvePromise(tenantId: string, id: string, data: { status: PromiseStatus; amountKept?: number }): Promise<PromiseToPay> {
    const promise = await this.promiseRepo.findOne({ where: { id, tenantId } });
    if (!promise) throw new NotFoundException(`Promise ${id} not found`);
    if (promise.status !== PromiseStatus.OPEN) throw new BadRequestException('Promise is already resolved');
    if (![PromiseStatus.KEPT, PromiseStatus.BROKEN, PromiseStatus.CANCELLED].includes(data.status)) {
      throw new BadRequestException('Invalid resolution status');
    }
    promise.status = data.status;
    promise.amountKept = data.status === PromiseStatus.KEPT ? (data.amountKept ?? promise.amountPromised) : (data.amountKept ?? 0);
    promise.resolvedAt = new Date();
    return (this.promiseRepo.save(promise) as unknown) as Promise<PromiseToPay>;
  }

  /** Mark OPEN promises whose promiseDate has passed as BROKEN. */
  async sweepBrokenPromises(tenantId: string, asOf?: string): Promise<{ broken: number }> {
    const today = asOf ?? new Date().toISOString().slice(0, 10);
    const open = await this.promiseRepo.find({ where: { tenantId, status: PromiseStatus.OPEN } });
    let broken = 0;
    for (const p of open) {
      if (p.promiseDate < today) {
        p.status = PromiseStatus.BROKEN;
        p.resolvedAt = new Date();
        await this.promiseRepo.save(p);
        broken++;
      }
    }
    return { broken };
  }

  // ─── Ph-111: Dispute management ───────────────────────────────────

  async listDisputes(tenantId: string, params: { customerId?: string; invoiceId?: string; status?: DisputeStatus } = {}): Promise<Dispute[]> {
    const where: any = { tenantId };
    if (params.customerId) where.customerId = params.customerId;
    if (params.invoiceId) where.invoiceId = params.invoiceId;
    if (params.status) where.status = params.status;
    return this.disputeRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async raiseDispute(tenantId: string, data: {
    customerId: string; invoiceId: string; disputedAmount: number; reason?: DisputeReason; description: string; raisedById?: string;
  }): Promise<Dispute> {
    if (!data.invoiceId) throw new BadRequestException('invoiceId is required');
    if (!data.description) throw new BadRequestException('description is required');
    const invoice = await this.invoiceRepo.findOne({ where: { id: data.invoiceId, tenantId } });
    if (!invoice) throw new NotFoundException(`Invoice ${data.invoiceId} not found`);
    const dispute = this.disputeRepo.create({
      tenantId,
      customerId: data.customerId || invoice.customerId,
      invoiceId: data.invoiceId,
      disputedAmount: data.disputedAmount ?? 0,
      reason: data.reason ?? DisputeReason.OTHER,
      status: DisputeStatus.OPEN,
      description: data.description,
      raisedById: data.raisedById ?? null,
    } as any) as unknown as Dispute;
    return (this.disputeRepo.save(dispute) as unknown) as Promise<Dispute>;
  }

  async updateDisputeStatus(tenantId: string, id: string, data: {
    status: DisputeStatus; resolutionNote?: string; resolverId?: string;
  }): Promise<Dispute> {
    const dispute = await this.disputeRepo.findOne({ where: { id, tenantId } });
    if (!dispute) throw new NotFoundException(`Dispute ${id} not found`);
    dispute.status = data.status;
    if (data.resolutionNote !== undefined) dispute.resolutionNote = data.resolutionNote;
    if (data.resolverId !== undefined) dispute.resolverId = data.resolverId;
    if ([DisputeStatus.RESOLVED, DisputeStatus.REJECTED].includes(data.status)) {
      dispute.resolvedAt = new Date();
    }
    return (this.disputeRepo.save(dispute) as unknown) as Promise<Dispute>;
  }

  /**
   * Invoice IDs with an active (OPEN/IN_REVIEW) dispute — dunning should skip
   * these. Used by DunningService.
   */
  async getDisputedInvoiceIds(tenantId: string): Promise<Set<string>> {
    const disputes = await this.disputeRepo.find({
      where: { tenantId, status: In([DisputeStatus.OPEN, DisputeStatus.IN_REVIEW]) },
    });
    return new Set(disputes.map((d) => d.invoiceId));
  }
}
