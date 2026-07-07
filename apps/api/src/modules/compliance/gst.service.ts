import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { createHash } from 'crypto';
import { GstEInvoice, GstEInvoiceStatus } from './entities/gst-einvoice.entity';
import { Invoice } from '../finance/ar/entities/invoice.entity';
import { InvoiceLine } from '../finance/ar/entities/invoice-line.entity';
import { Customer } from '../finance/ar/entities/customer.entity';
import { Bill } from '../finance/ap/entities/bill.entity';

export interface SellerDetails {
  gstin: string;
  legalName: string;
  address?: string;
  location?: string;
  pincode?: string;
}

const GSTIN_PATTERN = /^[0-9]{2}[A-Z0-9]{13}$/i;

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;

/** Indian fiscal year of a yyyy-mm-dd date, formatted like the IRP expects. */
export function fiscalYear(dateStr: string): string {
  const [y, m] = dateStr.split('-').map(Number);
  const startYear = m >= 4 ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** dd/mm/yyyy as required by the INV-01 schema. */
const irpDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
};

@Injectable()
export class GstService {
  constructor(
    @InjectRepository(GstEInvoice) private readonly einvoiceRepo: Repository<GstEInvoice>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceLine) private readonly lineRepo: Repository<InvoiceLine>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Bill) private readonly billRepo: Repository<Bill>,
  ) {}

  /**
   * IRN as computed by the IRP: SHA-256 over supplier GSTIN, fiscal year,
   * document type and document number. Deterministic, so regenerating for
   * the same document always yields the same reference.
   */
  computeIrn(sellerGstin: string, invoiceDate: string, docNumber: string): string {
    return createHash('sha256')
      .update(`${sellerGstin.toUpperCase()}${fiscalYear(invoiceDate)}INV${docNumber}`)
      .digest('hex');
  }

  /**
   * INV-01 (schema 1.1) payload for a B2B invoice. Intra-state supplies
   * split the tax into CGST+SGST; inter-state supplies report IGST — decided
   * by the state-code prefix of the two GSTINs.
   */
  buildIrpPayload(
    invoice: Invoice,
    lines: InvoiceLine[],
    buyer: { name: string; gstin: string; address?: string },
    seller: SellerDetails,
  ): Record<string, any> {
    if (!GSTIN_PATTERN.test(seller.gstin ?? '')) {
      throw new BadRequestException('A valid 15-character seller GSTIN is required');
    }
    if (!GSTIN_PATTERN.test(buyer.gstin ?? '')) {
      throw new BadRequestException(
        `Customer "${buyer.name}" has no valid GSTIN — B2B e-invoicing requires one`,
      );
    }
    const intraState = seller.gstin.slice(0, 2) === buyer.gstin.slice(0, 2);
    const splitTax = (tax: number) =>
      intraState
        ? { igst: 0, cgst: round2(tax / 2), sgst: round2(tax - tax / 2) }
        : { igst: round2(tax), cgst: 0, sgst: 0 };

    const items = lines.map((l, i) => {
      const assessable = round2(Number(l.quantity) * Number(l.unitPrice));
      const { igst, cgst, sgst } = splitTax(Number(l.taxAmount));
      return {
        SlNo: String(i + 1),
        PrdDesc: l.description || `Line ${l.lineNumber}`,
        IsServc: 'N',
        Qty: Number(l.quantity),
        UnitPrice: Number(l.unitPrice),
        TotAmt: assessable,
        AssAmt: assessable,
        GstRt: Number(l.taxRate),
        IgstAmt: igst,
        CgstAmt: cgst,
        SgstAmt: sgst,
        TotItemVal: round2(Number(l.lineTotal)),
      };
    });

    const headerSplit = splitTax(Number(invoice.taxAmount));
    return {
      Version: '1.1',
      TranDtls: { TaxSch: 'GST', SupTyp: 'B2B' },
      DocDtls: { Typ: 'INV', No: invoice.invoiceNumber, Dt: irpDate(invoice.invoiceDate) },
      SellerDtls: {
        Gstin: seller.gstin.toUpperCase(),
        LglNm: seller.legalName,
        Addr1: seller.address ?? '',
        Loc: seller.location ?? '',
        Pin: seller.pincode ?? '',
        Stcd: seller.gstin.slice(0, 2),
      },
      BuyerDtls: {
        Gstin: buyer.gstin.toUpperCase(),
        LglNm: buyer.name,
        Addr1: buyer.address ?? '',
        Pos: buyer.gstin.slice(0, 2), // place of supply
        Stcd: buyer.gstin.slice(0, 2),
      },
      ItemList: items,
      ValDtls: {
        AssVal: round2(Number(invoice.subtotal)),
        IgstVal: headerSplit.igst,
        CgstVal: headerSplit.cgst,
        SgstVal: headerSplit.sgst,
        TotInvVal: round2(Number(invoice.total)),
      },
    };
  }

  async generateEInvoice(tenantId: string, invoiceId: string, seller: SellerDetails): Promise<GstEInvoice> {
    const existing = await this.einvoiceRepo.findOne({ where: { tenantId, invoiceId } });
    if (existing && existing.status === GstEInvoiceStatus.GENERATED) return existing;
    if (existing) throw new BadRequestException('E-invoice for this document was cancelled — issue a fresh invoice');

    const invoice = await this.invoiceRepo.findOne({ where: { id: invoiceId, tenantId } });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    const lines = await this.lineRepo.find({ where: { tenantId, invoiceId }, order: { lineNumber: 'ASC' } });
    const customer = await this.customerRepo.findOne({ where: { id: invoice.customerId, tenantId } });
    if (!customer) throw new NotFoundException('Invoice customer not found');

    const buyerAddress = (customer.billingAddress as any)?.line1 ?? '';
    const payload = this.buildIrpPayload(
      invoice, lines,
      { name: customer.name, gstin: customer.taxId ?? '', address: buyerAddress },
      seller,
    );
    const record = this.einvoiceRepo.create({
      tenantId,
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      irn: this.computeIrn(seller.gstin, invoice.invoiceDate, invoice.invoiceNumber),
      status: GstEInvoiceStatus.GENERATED,
      payload,
    });
    return this.einvoiceRepo.save(record);
  }

  async listEInvoices(tenantId: string): Promise<GstEInvoice[]> {
    return this.einvoiceRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  /** IRP rule: an IRN can only be cancelled within 24 hours of generation. */
  async cancelEInvoice(tenantId: string, id: string, reason: string): Promise<GstEInvoice> {
    const record = await this.einvoiceRepo.findOne({ where: { id, tenantId } });
    if (!record) throw new NotFoundException(`E-invoice ${id} not found`);
    if (record.status === GstEInvoiceStatus.CANCELLED) return record;
    if (!reason?.trim()) throw new BadRequestException('A cancellation reason is required');
    const ageMs = Date.now() - new Date(record.createdAt).getTime();
    if (ageMs > 24 * 3600_000) {
      throw new BadRequestException('E-invoices can only be cancelled within 24 hours — use a credit note instead');
    }
    record.status = GstEInvoiceStatus.CANCELLED;
    record.cancelReason = reason.trim();
    record.cancelledAt = new Date();
    return this.einvoiceRepo.save(record);
  }

  /**
   * GSTR-1 outward-supply summary for a return period: B2B rows grouped by
   * customer GSTIN and tax rate; customers without a GSTIN aggregate into a
   * single B2C bucket.
   */
  async gstr1Summary(tenantId: string, from: string, to: string) {
    const invoices = await this.invoiceRepo.find({
      where: { tenantId, invoiceDate: Between(from, to) },
    });
    const customers = await this.customerRepo.find({ where: { tenantId } });
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    const b2b = new Map<string, { gstin: string; customerName: string; invoiceCount: number; taxableValue: number; taxAmount: number; totalValue: number }>();
    const b2c = { invoiceCount: 0, taxableValue: 0, taxAmount: 0, totalValue: 0 };

    for (const inv of invoices) {
      if (['DRAFT', 'VOID', 'CANCELLED'].includes(String(inv.status))) continue;
      const customer = customerMap.get(inv.customerId);
      const gstin = customer?.taxId && GSTIN_PATTERN.test(customer.taxId) ? customer.taxId.toUpperCase() : null;
      if (gstin) {
        const row = b2b.get(gstin) ?? { gstin, customerName: customer!.name, invoiceCount: 0, taxableValue: 0, taxAmount: 0, totalValue: 0 };
        row.invoiceCount += 1;
        row.taxableValue = round2(row.taxableValue + Number(inv.subtotal));
        row.taxAmount = round2(row.taxAmount + Number(inv.taxAmount));
        row.totalValue = round2(row.totalValue + Number(inv.total));
        b2b.set(gstin, row);
      } else {
        b2c.invoiceCount += 1;
        b2c.taxableValue = round2(b2c.taxableValue + Number(inv.subtotal));
        b2c.taxAmount = round2(b2c.taxAmount + Number(inv.taxAmount));
        b2c.totalValue = round2(b2c.totalValue + Number(inv.total));
      }
    }

    const b2bRows = Array.from(b2b.values()).sort((a, b) => b.taxableValue - a.taxableValue);
    return {
      period: { from, to },
      b2b: b2bRows,
      b2c,
      totals: {
        invoiceCount: b2bRows.reduce((s, r) => s + r.invoiceCount, 0) + b2c.invoiceCount,
        taxableValue: round2(b2bRows.reduce((s, r) => s + r.taxableValue, 0) + b2c.taxableValue),
        taxAmount: round2(b2bRows.reduce((s, r) => s + r.taxAmount, 0) + b2c.taxAmount),
      },
    };
  }

  /**
   * GSTR-3B summary: outward tax liability from AR, input tax credit from AP
   * bills, net cash payable after ITC set-off.
   */
  async gstr3bSummary(tenantId: string, from: string, to: string) {
    const invoices = await this.invoiceRepo.find({
      where: { tenantId, invoiceDate: Between(from, to) },
    });
    const bills = await this.billRepo.find({
      where: { tenantId, billDate: Between(from, to) },
    });

    let outwardTaxable = 0, outwardTax = 0;
    for (const inv of invoices) {
      if (['DRAFT', 'VOID', 'CANCELLED'].includes(String(inv.status))) continue;
      outwardTaxable = round2(outwardTaxable + Number(inv.subtotal));
      outwardTax = round2(outwardTax + Number(inv.taxAmount));
    }
    let inwardTaxable = 0, itc = 0;
    for (const bill of bills) {
      if (['DRAFT', 'VOID', 'CANCELLED'].includes(String(bill.status))) continue;
      inwardTaxable = round2(inwardTaxable + Number(bill.subtotal));
      itc = round2(itc + Number(bill.taxAmount));
    }
    return {
      period: { from, to },
      outwardSupplies: { taxableValue: outwardTaxable, taxAmount: outwardTax },
      inwardSupplies: { taxableValue: inwardTaxable, inputTaxCredit: itc },
      netTaxPayable: round2(Math.max(0, outwardTax - itc)),
      itcCarryForward: round2(Math.max(0, itc - outwardTax)),
    };
  }
}
