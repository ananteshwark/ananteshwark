import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from '../finance/ar/entities/invoice.entity';
import { InvoiceLine } from '../finance/ar/entities/invoice-line.entity';
import { Customer } from '../finance/ar/entities/customer.entity';
import { buildUblInvoice, UblParty } from './ubl-invoice.builder';

export interface UblSupplierDetails {
  name: string;
  vatId?: string;
  countryCode: string;
  street?: string;
  city?: string;
  postalZone?: string;
}

@Injectable()
export class PeppolService {
  constructor(
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceLine) private readonly lineRepo: Repository<InvoiceLine>,
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
  ) {}

  /** Render an AR invoice as a PEPPOL BIS Billing 3.0 UBL document. */
  async buildUblForInvoice(tenantId: string, invoiceId: string, supplier: UblSupplierDetails): Promise<string> {
    if (!supplier?.name?.trim()) throw new BadRequestException('supplierName is required');
    if (!/^[A-Z]{2}$/i.test(supplier.countryCode ?? '')) {
      throw new BadRequestException('supplierCountry must be an ISO 3166-1 alpha-2 code');
    }

    const invoice = await this.invoiceRepo.findOne({ where: { id: invoiceId, tenantId } });
    if (!invoice) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    if (invoice.status === 'DRAFT' || invoice.status === 'VOID') {
      throw new BadRequestException(`Invoice ${invoice.invoiceNumber} is ${invoice.status} — only issued invoices can be exported`);
    }
    const lines = await this.lineRepo.find({ where: { tenantId, invoiceId }, order: { lineNumber: 'ASC' } });
    if (!lines.length) throw new BadRequestException(`Invoice ${invoice.invoiceNumber} has no lines`);
    const customer = await this.customerRepo.findOne({ where: { id: invoice.customerId, tenantId } });
    if (!customer) throw new NotFoundException('Invoice customer not found');

    const billing = (customer.billingAddress as any) ?? {};
    const customerParty: UblParty = {
      name: customer.name,
      vatId: customer.taxId ?? null,
      countryCode: (billing.country ?? supplier.countryCode).toUpperCase().slice(0, 2),
      street: billing.line1 ?? null,
      city: billing.city ?? null,
      postalZone: billing.postalCode ?? billing.zip ?? null,
    };

    return buildUblInvoice({
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      currency: invoice.currency,
      buyerReference: invoice.reference ?? null,
      supplier: { ...supplier, countryCode: supplier.countryCode.toUpperCase() },
      customer: customerParty,
      lines: lines.map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        taxRate: Number(l.taxRate),
        taxAmount: Number(l.taxAmount),
      })),
      taxExclusiveAmount: Number(invoice.subtotal),
      taxAmount: Number(invoice.taxAmount),
      payableAmount: Number(invoice.total),
    });
  }
}
