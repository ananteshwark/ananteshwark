import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LockboxBatch, LockboxFormat, LockboxBatchStatus } from './entities/lockbox-batch.entity';
import { LockboxReceipt, LockboxReceiptStatus } from './entities/lockbox-receipt.entity';
import { Invoice, InvoiceStatus } from '../ar/entities/invoice.entity';
import { Customer } from '../ar/entities/customer.entity';
import { ArService } from '../ar/ar.service';
import { ReceiptMethod } from '../ar/entities/customer-receipt.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ParsedLine {
  customerRef: string | null;
  amount: number;
  receiptDate: string;
  memo: string | null;
}

export type ApplyStrategy = 'OLDEST_FIRST' | 'EXACT_MATCH' | 'BY_REFERENCE';

@Injectable()
export class LockboxService {
  constructor(
    @InjectRepository(LockboxBatch) private readonly batchRepo: Repository<LockboxBatch>,
    @InjectRepository(LockboxReceipt) private readonly receiptRepo: Repository<LockboxReceipt>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    private readonly arService: ArService,
  ) {}

  // ─── Ph-112: Parsers ──────────────────────────────────────────────

  /**
   * Normalized format: one receipt per line, pipe-delimited:
   *   customerRef|amount|YYYY-MM-DD|memo
   */
  parseNormalized(raw: string): ParsedLine[] {
    const lines: ParsedLine[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const [customerRef, amount, date, memo] = t.split('|').map((s) => s?.trim());
      if (amount == null || date == null) continue;
      lines.push({
        customerRef: customerRef || null,
        amount: round2(Number(amount)),
        receiptDate: date,
        memo: memo || null,
      });
    }
    return lines;
  }

  /**
   * Minimal SWIFT MT940 parser: each :61: statement line is a transaction,
   * the following :86: is its narrative. Credit entries (C) are receipts.
   * :61:YYMMDD<...>C<amount>N...  /  :86:<narrative incl. customer ref>
   */
  parseMt940(raw: string): ParsedLine[] {
    const lines: ParsedLine[] = [];
    const tokens = raw.split(/\r?\n/).map((l) => l.trim());
    let pending: ParsedLine | null = null;
    for (const tk of tokens) {
      if (tk.startsWith(':61:')) {
        const body = tk.slice(4);
        // value date YYMMDD at start
        const dateMatch = body.match(/^(\d{6})/);
        const crdr = body.match(/(?:\d{6})(?:\d{4})?([CD])/);
        const amtMatch = body.match(/[CD]([0-9]+,[0-9]{2})/);
        if (pending) lines.push(pending);
        pending = null;
        if (dateMatch && crdr && crdr[1] === 'C' && amtMatch) {
          const yy = dateMatch[1].slice(0, 2);
          const mm = dateMatch[1].slice(2, 4);
          const dd = dateMatch[1].slice(4, 6);
          pending = {
            customerRef: null,
            amount: round2(Number(amtMatch[1].replace(',', '.'))),
            receiptDate: `20${yy}-${mm}-${dd}`,
            memo: null,
          };
        }
      } else if (tk.startsWith(':86:') && pending) {
        const narrative = tk.slice(4);
        pending.memo = narrative || null;
        pending.customerRef = this.extractRef(narrative);
        lines.push(pending);
        pending = null;
      }
    }
    if (pending) lines.push(pending);
    return lines;
  }

  /**
   * Minimal BAI2 parser: type-16 detail records are transactions.
   *   16,<typecode>,<amount-cents>,<...>,<customer ref>,<memo>
   * Credit type codes (1xx) are receipts.
   */
  parseBai2(raw: string, asOf?: string): ParsedLine[] {
    const lines: ParsedLine[] = [];
    const date = asOf ?? new Date().toISOString().slice(0, 10);
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t.startsWith('16,')) continue;
      const parts = t.split(',');
      const typeCode = parts[1];
      const amountCents = Number(parts[2]);
      if (!typeCode || isNaN(amountCents)) continue;
      // credit detail type codes start with '1'
      if (!typeCode.startsWith('1')) continue;
      lines.push({
        customerRef: (parts[4] || '').trim() || null,
        amount: round2(amountCents / 100),
        receiptDate: date,
        memo: (parts[5] || '').trim() || null,
      });
    }
    return lines;
  }

  private extractRef(narrative: string): string | null {
    // pull a token like REF:XXX or CUST:XXX or INV:XXX
    const m = narrative.match(/(?:REF|CUST|INV)[:\s]+([A-Za-z0-9-]+)/i);
    return m ? m[1] : null;
  }

  // ─── Batch ingest ─────────────────────────────────────────────────

  async importBatch(tenantId: string, data: {
    format: LockboxFormat; content: string; fileReference?: string; asOf?: string;
    lines?: ParsedLine[];
  }): Promise<LockboxBatch> {
    let parsed: ParsedLine[];
    if (data.lines && data.lines.length) {
      parsed = data.lines;
    } else if (data.format === LockboxFormat.MT940) {
      parsed = this.parseMt940(data.content);
    } else if (data.format === LockboxFormat.BAI2) {
      parsed = this.parseBai2(data.content, data.asOf);
    } else {
      parsed = this.parseNormalized(data.content);
    }
    if (parsed.length === 0) throw new BadRequestException('No receipts could be parsed from the file');

    const batchNumber = await this.nextBatchNumber(tenantId);
    const total = round2(parsed.reduce((s, p) => s + p.amount, 0));
    const batch = (await this.batchRepo.save(
      this.batchRepo.create({
        tenantId,
        batchNumber,
        format: data.format,
        status: LockboxBatchStatus.PARSED,
        receiptCount: parsed.length,
        totalAmount: total,
        appliedAmount: 0,
        fileReference: data.fileReference ?? null,
      } as any),
    )) as unknown as LockboxBatch;

    for (const p of parsed) {
      const customer = await this.resolveCustomer(tenantId, p.customerRef);
      await this.receiptRepo.save(
        this.receiptRepo.create({
          tenantId,
          batchId: batch.id,
          customerRef: p.customerRef,
          customerId: customer?.id ?? null,
          amount: p.amount,
          appliedAmount: 0,
          receiptDate: p.receiptDate,
          memo: p.memo,
          status: customer ? LockboxReceiptStatus.UNAPPLIED : LockboxReceiptStatus.UNMATCHED,
        } as any),
      );
    }
    return batch;
  }

  private async resolveCustomer(tenantId: string, ref: string | null): Promise<Customer | null> {
    if (!ref) return null;
    // try by code, then exact name
    let c = await this.customerRepo.findOne({ where: { tenantId, code: ref } });
    if (!c) c = await this.customerRepo.findOne({ where: { tenantId, name: ref } });
    return c ?? null;
  }

  // ─── Ph-113: Auto-application ──────────────────────────────────────

  async applyBatch(
    tenantId: string,
    batchId: string,
    strategy: ApplyStrategy,
    userId: string,
  ): Promise<{ applied: number; skipped: number; appliedAmount: number }> {
    const batch = await this.batchRepo.findOne({ where: { id: batchId, tenantId } });
    if (!batch) throw new NotFoundException(`Batch ${batchId} not found`);
    const receipts = await this.receiptRepo.find({
      where: { tenantId, batchId, status: LockboxReceiptStatus.UNAPPLIED },
    });

    let applied = 0;
    let skipped = 0;
    let appliedAmount = 0;
    for (const r of receipts) {
      const result = await this.applyReceipt(tenantId, r, strategy, userId);
      if (result.applied > 0) {
        applied++;
        appliedAmount = round2(appliedAmount + result.applied);
      } else {
        skipped++;
      }
    }

    batch.appliedAmount = round2(Number(batch.appliedAmount) + appliedAmount);
    batch.status =
      batch.appliedAmount >= Number(batch.totalAmount)
        ? LockboxBatchStatus.APPLIED
        : LockboxBatchStatus.PARTIAL;
    await this.batchRepo.save(batch);
    return { applied, skipped, appliedAmount };
  }

  /** Compute allocations for a single lockbox receipt and create the AR receipt. */
  private async applyReceipt(
    tenantId: string,
    receipt: LockboxReceipt,
    strategy: ApplyStrategy,
    userId: string,
  ): Promise<{ applied: number }> {
    if (!receipt.customerId) return { applied: 0 };

    const openInvoices = (
      await this.invoiceRepo.find({ where: { tenantId, customerId: receipt.customerId } })
    ).filter((i) => Number(i.balanceDue) > 0 && i.status !== InvoiceStatus.DRAFT);

    const allocations = this.computeAllocations(receipt, openInvoices, strategy);
    if (allocations.length === 0) return { applied: 0 };

    const arReceipt = await this.arService.createCustomerReceipt(
      tenantId,
      {
        customerId: receipt.customerId,
        receiptDate: receipt.receiptDate,
        amount: receipt.amount,
        method: ReceiptMethod.BANK_TRANSFER,
        reference: `LOCKBOX ${receipt.customerRef ?? ''}`.trim(),
        allocations,
      } as any,
      userId,
    );

    const totalAllocated = round2(allocations.reduce((s, a) => s + a.amount, 0));
    receipt.arReceiptId = (arReceipt as any).id;
    receipt.appliedAmount = totalAllocated;
    receipt.status =
      totalAllocated >= Number(receipt.amount)
        ? LockboxReceiptStatus.APPLIED
        : LockboxReceiptStatus.PARTIAL;
    receipt.matchNote = `${strategy}: ${allocations.length} invoice(s)`;
    await this.receiptRepo.save(receipt);
    return { applied: totalAllocated };
  }

  computeAllocations(
    receipt: LockboxReceipt,
    openInvoices: Invoice[],
    strategy: ApplyStrategy,
  ): { invoiceId: string; amount: number }[] {
    let remaining = round2(Number(receipt.amount));
    const allocations: { invoiceId: string; amount: number }[] = [];

    if (strategy === 'EXACT_MATCH') {
      const exact = openInvoices.find((i) => round2(Number(i.balanceDue)) === remaining);
      if (exact) allocations.push({ invoiceId: exact.id, amount: remaining });
      return allocations;
    }

    if (strategy === 'BY_REFERENCE') {
      const ref = receipt.customerRef ?? '';
      const matched = openInvoices.find((i) => i.invoiceNumber === ref);
      if (matched) {
        const amt = round2(Math.min(remaining, Number(matched.balanceDue)));
        if (amt > 0) allocations.push({ invoiceId: matched.id, amount: amt });
      }
      return allocations;
    }

    // OLDEST_FIRST
    const sorted = [...openInvoices].sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
    for (const inv of sorted) {
      if (remaining <= 0) break;
      const amt = round2(Math.min(remaining, Number(inv.balanceDue)));
      if (amt > 0) {
        allocations.push({ invoiceId: inv.id, amount: amt });
        remaining = round2(remaining - amt);
      }
    }
    return allocations;
  }

  // ─── Ph-114: Queue / manual application ───────────────────────────

  async listBatches(tenantId: string): Promise<LockboxBatch[]> {
    return this.batchRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async listReceipts(tenantId: string, params: { batchId?: string; status?: LockboxReceiptStatus } = {}): Promise<LockboxReceipt[]> {
    const where: any = { tenantId };
    if (params.batchId) where.batchId = params.batchId;
    if (params.status) where.status = params.status;
    return this.receiptRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async listUnapplied(tenantId: string): Promise<LockboxReceipt[]> {
    return this.receiptRepo.find({
      where: { tenantId, status: LockboxReceiptStatus.UNAPPLIED },
      order: { receiptDate: 'ASC' },
    });
  }

  /** Manually assign a customer to an UNMATCHED receipt so it can be applied. */
  async assignCustomer(tenantId: string, receiptId: string, customerId: string): Promise<LockboxReceipt> {
    const receipt = await this.receiptRepo.findOne({ where: { id: receiptId, tenantId } });
    if (!receipt) throw new NotFoundException(`Lockbox receipt ${receiptId} not found`);
    const customer = await this.customerRepo.findOne({ where: { id: customerId, tenantId } });
    if (!customer) throw new NotFoundException(`Customer ${customerId} not found`);
    receipt.customerId = customerId;
    if (receipt.status === LockboxReceiptStatus.UNMATCHED) receipt.status = LockboxReceiptStatus.UNAPPLIED;
    return (this.receiptRepo.save(receipt) as unknown) as Promise<LockboxReceipt>;
  }

  /** Manually apply a single unapplied receipt with a chosen strategy. */
  async manualApply(tenantId: string, receiptId: string, strategy: ApplyStrategy, userId: string): Promise<LockboxReceipt> {
    const receipt = await this.receiptRepo.findOne({ where: { id: receiptId, tenantId } });
    if (!receipt) throw new NotFoundException(`Lockbox receipt ${receiptId} not found`);
    if (receipt.status === LockboxReceiptStatus.APPLIED) throw new BadRequestException('Receipt already applied');
    if (!receipt.customerId) throw new BadRequestException('Receipt has no customer; assign one first');
    await this.applyReceipt(tenantId, receipt, strategy, userId);
    return (this.receiptRepo.findOne({ where: { id: receiptId, tenantId } }) as unknown) as Promise<LockboxReceipt>;
  }

  private async nextBatchNumber(tenantId: string): Promise<string> {
    const count = await this.batchRepo.count({ where: { tenantId } });
    return `LBX-${String(count + 1).padStart(6, '0')}`;
  }
}
