import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { CreateInvoiceDto } from './dto/invoice.dto';
import { TaxService } from '../tax/tax.service';
import { TaxDocumentType } from '../tax/entities/tax-line.entity';

@Injectable()
export class InvoiceService {
  constructor(
    @InjectRepository(Invoice)
    private readonly invoiceRepository: Repository<Invoice>,
    private readonly taxService: TaxService,
  ) {}

  async create(tenantId: string, dto: CreateInvoiceDto): Promise<Invoice> {
    const invoice = this.invoiceRepository.create({
      tenantId,
      ...dto,
      subTotal: dto.subTotal,
      taxAmount: 0,
      totalAmount: dto.subTotal,
    });
    return this.invoiceRepository.save(invoice);
  }

  async findAll(tenantId: string): Promise<Invoice[]> {
    return this.invoiceRepository.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findById(tenantId: string, id: string): Promise<Invoice> {
    const invoice = await this.invoiceRepository.findOne({ where: { tenantId, id } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  async postInvoice(tenantId: string, id: string): Promise<Invoice> {
    const invoice = await this.findById(tenantId, id);

    // Clean previous tax lines in case of re-posting
    await this.taxService.deleteTaxLines(tenantId, TaxDocumentType.INVOICE, id);

    let taxAmount = 0;

    if (invoice.taxCodeId) {
      const lines = await this.taxService.saveTaxLines(
        tenantId,
        TaxDocumentType.INVOICE,
        id,
        invoice.taxCodeId,
        Number(invoice.subTotal),
      );
      taxAmount = lines.reduce((sum, l) => sum + Number(l.taxAmount), 0);
    }

    invoice.taxAmount = taxAmount;
    invoice.totalAmount = Number(invoice.subTotal) + taxAmount;
    invoice.status = InvoiceStatus.POSTED;

    return this.invoiceRepository.save(invoice);
  }

  async getTaxLines(tenantId: string, id: string) {
    return this.taxService.getTaxLines(tenantId, TaxDocumentType.INVOICE, id);
  }
}
