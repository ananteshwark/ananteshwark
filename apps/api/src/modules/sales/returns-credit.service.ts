import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReturnOrder, ReturnOrderStatus } from './entities/return-order.entity';
import { ReturnOrderLine } from './entities/return-order-line.entity';
import { CreditNote, CreditNoteStatus } from './entities/credit-note.entity';
import { Invoice, InvoiceStatus } from '../finance/ar/entities/invoice.entity';
import { InventoryService } from '../inventory/inventory.service';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface CreateReturnLineDto {
  itemId?: string | null;
  itemDescription: string;
  quantity: number;
  unitPrice: number;
  warehouseId?: string | null;
}

export interface CreateReturnOrderDto {
  customerId?: string | null;
  customerName?: string | null;
  salesOrderId?: string | null;
  invoiceId?: string | null;
  returnDate?: string;
  reason?: string;
  lines: CreateReturnLineDto[];
}

export interface CreateCreditNoteDto {
  returnOrderId?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  invoiceId?: string | null;
  appliedToInvoiceId?: string | null;
  amount?: number;
  creditDate?: string;
  notes?: string | null;
}

@Injectable()
export class ReturnsCreditService {
  constructor(
    @InjectRepository(ReturnOrder)
    private readonly returnRepo: Repository<ReturnOrder>,
    @InjectRepository(ReturnOrderLine)
    private readonly returnLineRepo: Repository<ReturnOrderLine>,
    @InjectRepository(CreditNote)
    private readonly creditNoteRepo: Repository<CreditNote>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    private readonly inventoryService: InventoryService,
  ) {}

  // ---- Numbering ----
  private async nextReturnNumber(tenantId: string): Promise<string> {
    const row = await this.returnRepo
      .createQueryBuilder('r')
      .select(`MAX(CAST(NULLIF(regexp_replace(r.return_number, '\\D', '', 'g'), '') AS INTEGER))`, 'mx')
      .where('r.tenantId = :tenantId', { tenantId })
      .getRawOne();
    const next = (row?.mx ?? 0) + 1;
    return `RET-${String(next).padStart(4, '0')}`;
  }

  private async nextCreditNoteNumber(tenantId: string): Promise<string> {
    const row = await this.creditNoteRepo
      .createQueryBuilder('c')
      .select(`MAX(CAST(NULLIF(regexp_replace(c.credit_note_number, '\\D', '', 'g'), '') AS INTEGER))`, 'mx')
      .where('c.tenantId = :tenantId', { tenantId })
      .getRawOne();
    const next = (row?.mx ?? 0) + 1;
    return `CN-${String(next).padStart(4, '0')}`;
  }

  // ---- Return Orders ----
  async listReturns(
    tenantId: string,
    filters?: { customerId?: string; status?: string },
  ): Promise<ReturnOrder[]> {
    const qb = this.returnRepo.createQueryBuilder('r').where('r.tenantId = :tenantId', { tenantId });
    if (filters?.customerId) qb.andWhere('r.customerId = :cid', { cid: filters.customerId });
    if (filters?.status) qb.andWhere('r.status = :st', { st: filters.status });
    qb.orderBy('r.createdAt', 'DESC');
    return qb.getMany();
  }

  async getReturn(tenantId: string, id: string): Promise<ReturnOrder & { lines: ReturnOrderLine[] }> {
    const ro = await this.returnRepo.findOne({ where: { tenantId, id } });
    if (!ro) throw new NotFoundException(`Return order ${id} not found`);
    const lines = await this.returnLineRepo.find({ where: { tenantId, returnOrderId: id } });
    return Object.assign(ro, { lines });
  }

  async createReturn(tenantId: string, dto: CreateReturnOrderDto): Promise<ReturnOrder> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException('A return order requires at least one line');
    }
    const returnNumber = await this.nextReturnNumber(tenantId);
    let totalAmount = 0;
    const lineData = dto.lines.map((l) => {
      const amount = round2((l.quantity || 0) * (l.unitPrice || 0));
      totalAmount += amount;
      return { ...l, amount };
    });

    const ro = await this.returnRepo.save(
      this.returnRepo.create({
        tenantId,
        returnNumber,
        customerId: dto.customerId ?? null,
        customerName: dto.customerName ?? null,
        salesOrderId: dto.salesOrderId ?? null,
        invoiceId: dto.invoiceId ?? null,
        returnDate: dto.returnDate || new Date().toISOString().slice(0, 10),
        reason: dto.reason || 'OTHER',
        status: ReturnOrderStatus.DRAFT,
        totalAmount: round2(totalAmount),
      }),
    );

    const lines = lineData.map((l) =>
      this.returnLineRepo.create({
        tenantId,
        returnOrderId: ro.id,
        itemId: l.itemId ?? null,
        itemDescription: l.itemDescription,
        quantity: l.quantity || 0,
        unitPrice: l.unitPrice || 0,
        amount: l.amount,
        warehouseId: l.warehouseId ?? null,
      }),
    );
    await this.returnLineRepo.save(lines);
    return ro;
  }

  async cancelReturn(tenantId: string, id: string): Promise<ReturnOrder> {
    const ro = await this.returnRepo.findOne({ where: { tenantId, id } });
    if (!ro) throw new NotFoundException(`Return order ${id} not found`);
    if ([ReturnOrderStatus.CREDITED, ReturnOrderStatus.CANCELLED].includes(ro.status)) {
      throw new BadRequestException('Cannot cancel a credited or already cancelled return');
    }
    ro.status = ReturnOrderStatus.CANCELLED;
    return this.returnRepo.save(ro);
  }

  /** DRAFT -> RECEIVED; put returned goods back into stock (best-effort per line). */
  async receiveReturn(tenantId: string, id: string): Promise<ReturnOrder> {
    const ro = await this.returnRepo.findOne({ where: { tenantId, id } });
    if (!ro) throw new NotFoundException(`Return order ${id} not found`);
    if (ro.status !== ReturnOrderStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT return orders can be received');
    }

    const lines = await this.returnLineRepo.find({ where: { tenantId, returnOrderId: id } });
    for (const line of lines) {
      if (!line.itemId || !line.warehouseId || (line.quantity || 0) <= 0) continue;
      try {
        await this.inventoryService.receiveStock(
          tenantId,
          line.itemId,
          line.warehouseId,
          line.quantity,
          line.unitPrice || 0,
          'RETURN_ORDER',
          ro.id,
          ro.returnDate,
          `Customer return ${ro.returnNumber}`,
        );
      } catch (_) {
        // Best-effort: a missing warehouse/item must not crash the receive.
      }
    }

    ro.status = ReturnOrderStatus.RECEIVED;
    return this.returnRepo.save(ro);
  }

  // ---- Credit Notes ----
  async listCreditNotes(
    tenantId: string,
    filters?: { customerId?: string; status?: string },
  ): Promise<CreditNote[]> {
    const qb = this.creditNoteRepo.createQueryBuilder('c').where('c.tenantId = :tenantId', { tenantId });
    if (filters?.customerId) qb.andWhere('c.customerId = :cid', { cid: filters.customerId });
    if (filters?.status) qb.andWhere('c.status = :st', { st: filters.status });
    qb.orderBy('c.createdAt', 'DESC');
    return qb.getMany();
  }

  async createCreditNote(tenantId: string, dto: CreateCreditNoteDto): Promise<CreditNote> {
    const creditNoteNumber = await this.nextCreditNoteNumber(tenantId);

    let customerId = dto.customerId ?? null;
    let customerName = dto.customerName ?? null;
    let returnOrderId = dto.returnOrderId ?? null;
    let invoiceId = dto.invoiceId ?? null;
    let amount = dto.amount ?? 0;
    let ro: ReturnOrder | null = null;

    if (returnOrderId) {
      ro = await this.returnRepo.findOne({ where: { tenantId, id: returnOrderId } });
      if (!ro) throw new NotFoundException(`Return order ${returnOrderId} not found`);
      amount = ro.totalAmount;
      customerId = customerId ?? ro.customerId;
      customerName = customerName ?? ro.customerName;
      invoiceId = invoiceId ?? ro.invoiceId;
    }

    if (!returnOrderId && (!customerId || !amount)) {
      throw new BadRequestException('A credit note requires a return order, or a customer and amount');
    }

    const cn = await this.creditNoteRepo.save(
      this.creditNoteRepo.create({
        tenantId,
        creditNoteNumber,
        customerId,
        customerName,
        returnOrderId,
        invoiceId,
        creditDate: dto.creditDate || new Date().toISOString().slice(0, 10),
        amount: round2(amount),
        status: CreditNoteStatus.DRAFT,
        appliedToInvoiceId: dto.appliedToInvoiceId ?? null,
        notes: dto.notes ?? null,
      }),
    );

    // Mark the source return order as CREDITED.
    if (ro && ro.status === ReturnOrderStatus.RECEIVED) {
      ro.status = ReturnOrderStatus.CREDITED;
      await this.returnRepo.save(ro);
    } else if (ro && ro.status === ReturnOrderStatus.DRAFT) {
      ro.status = ReturnOrderStatus.CREDITED;
      await this.returnRepo.save(ro);
    }

    return cn;
  }

  /** DRAFT -> ISSUED. If appliedToInvoiceId is preset, reduce that invoice's balance (best-effort). */
  async issueCreditNote(tenantId: string, id: string): Promise<CreditNote> {
    const cn = await this.creditNoteRepo.findOne({ where: { tenantId, id } });
    if (!cn) throw new NotFoundException(`Credit note ${id} not found`);
    if (cn.status !== CreditNoteStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT credit notes can be issued');
    }
    cn.status = CreditNoteStatus.ISSUED;
    const saved = await this.creditNoteRepo.save(cn);

    if (cn.appliedToInvoiceId) {
      await this.reduceInvoiceBalance(tenantId, cn.appliedToInvoiceId, cn.amount);
    }
    return saved;
  }

  /** Mark APPLIED, set appliedToInvoiceId, reduce that invoice's balanceDue (best-effort). */
  async applyCreditNote(tenantId: string, id: string, invoiceId: string): Promise<CreditNote> {
    const cn = await this.creditNoteRepo.findOne({ where: { tenantId, id } });
    if (!cn) throw new NotFoundException(`Credit note ${id} not found`);
    if (cn.status === CreditNoteStatus.APPLIED) {
      throw new BadRequestException('Credit note is already applied');
    }
    if (!invoiceId) throw new BadRequestException('invoiceId is required to apply a credit note');

    cn.status = CreditNoteStatus.APPLIED;
    cn.appliedToInvoiceId = invoiceId;
    const saved = await this.creditNoteRepo.save(cn);

    await this.reduceInvoiceBalance(tenantId, invoiceId, cn.amount);
    return saved;
  }

  private async reduceInvoiceBalance(tenantId: string, invoiceId: string, amount: number): Promise<void> {
    try {
      const invoice = await this.invoiceRepo.findOne({ where: { tenantId, id: invoiceId } });
      if (!invoice) return;
      const credit = round2(Math.min(amount || 0, Number(invoice.balanceDue) || 0));
      if (credit <= 0) return;
      invoice.balanceDue = round2((Number(invoice.balanceDue) || 0) - credit);
      invoice.amountPaid = round2((Number(invoice.amountPaid) || 0) + credit);
      if (invoice.balanceDue <= 0) {
        invoice.status = InvoiceStatus.PAID;
      } else if (invoice.amountPaid > 0) {
        invoice.status = InvoiceStatus.PARTIAL;
      }
      await this.invoiceRepo.save(invoice);
    } catch (_) {
      // Best-effort; reducing the AR balance must not break credit-note flow.
    }
  }
}
