import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  VendorInvoice,
  VendorInvoiceStatus,
  InvoiceSource,
  MatchStatus,
} from './entities/vendor-invoice.entity';
import { VendorInvoiceLine } from './entities/vendor-invoice-line.entity';
import { CreateVendorInvoiceDto, ListInvoicesQueryDto } from './dto/vendor-invoice.dto';
import { PurchaseOrder } from '../po/entities/purchase-order.entity';
import { PoLine } from '../po/entities/po-line.entity';
import { Grn } from '../grn/entities/grn.entity';
import { GrnLine } from '../grn/entities/grn-line.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class VendorInvoiceService {
  constructor(
    @InjectRepository(VendorInvoice)
    private readonly invoiceRepo: Repository<VendorInvoice>,
    @InjectRepository(VendorInvoiceLine)
    private readonly lineRepo: Repository<VendorInvoiceLine>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    @InjectRepository(PoLine)
    private readonly poLineRepo: Repository<PoLine>,
    @InjectRepository(Grn)
    private readonly grnRepo: Repository<Grn>,
    @InjectRepository(GrnLine)
    private readonly grnLineRepo: Repository<GrnLine>,
  ) {}

  private async nextNumber(tenantId: string): Promise<string> {
    const row = await this.invoiceRepo
      .createQueryBuilder('e')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(e.invoice_number, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('e.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `VINV-${String(next).padStart(6, '0')}`;
  }

  private computeLines(lines: CreateVendorInvoiceDto['lines']): {
    lineData: any[];
    subtotal: number;
    taxAmount: number;
    total: number;
  } {
    let subtotal = 0;
    let taxAmount = 0;
    const lineData = lines.map((l) => {
      const net = round2(l.quantity * l.unitPrice);
      const tax = round2(net * ((l.taxRate || 0) / 100));
      subtotal = round2(subtotal + net);
      taxAmount = round2(taxAmount + tax);
      return { ...l, taxAmount: tax, lineTotal: round2(net + tax) };
    });
    return { lineData, subtotal, taxAmount, total: round2(subtotal + taxAmount) };
  }

  async createInvoice(
    tenantId: string,
    dto: CreateVendorInvoiceDto,
    source: InvoiceSource = InvoiceSource.MANUAL,
  ): Promise<any> {
    const invoiceNumber = await this.nextNumber(tenantId);
    const { lineData, subtotal, taxAmount, total } = this.computeLines(dto.lines);

    const invoice = this.invoiceRepo.create({
      tenantId,
      invoiceNumber,
      vendorInvoiceRef: dto.vendorInvoiceRef || null,
      vendorId: dto.vendorId,
      vendorName: dto.vendorName,
      poId: dto.poId || null,
      grnId: dto.grnId || null,
      invoiceDate: dto.invoiceDate,
      dueDate: dto.dueDate || null,
      currency: dto.currency || 'INR',
      subtotal,
      taxAmount,
      total,
      paidAmount: 0,
      status: VendorInvoiceStatus.DRAFT,
      matchStatus: MatchStatus.NOT_MATCHED,
      source,
      notes: dto.notes || null,
    });
    const saved = await this.invoiceRepo.save(invoice);

    const lineEntities = lineData.map((l, idx) =>
      this.lineRepo.create({
        tenantId,
        invoiceId: saved.id,
        lineNumber: idx + 1,
        poLineId: l.poLineId || null,
        grnLineId: l.grnLineId || null,
        itemCode: l.itemCode || null,
        description: l.description,
        uom: l.uom || 'EA',
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate || 0,
        taxAmount: l.taxAmount,
        lineTotal: l.lineTotal,
      }),
    );
    await this.lineRepo.save(lineEntities);

    return this.getInvoice(tenantId, saved.id);
  }

  async listInvoices(tenantId: string, params: ListInvoicesQueryDto): Promise<any> {
    const { page = 1, limit = 20, vendorId, poId, status } = params;
    const qb = this.invoiceRepo
      .createQueryBuilder('inv')
      .where('inv.tenantId = :tenantId', { tenantId });

    if (vendorId) qb.andWhere('inv.vendorId = :vendorId', { vendorId });
    if (poId) qb.andWhere('inv.poId = :poId', { poId });
    if (status) qb.andWhere('inv.status = :status', { status });

    qb.orderBy('inv.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async getInvoice(tenantId: string, id: string): Promise<any> {
    const invoice = await this.invoiceRepo.findOne({ where: { id, tenantId } });
    if (!invoice) throw new NotFoundException(`Vendor Invoice ${id} not found`);
    const lines = await this.lineRepo.find({
      where: { invoiceId: id, tenantId },
      order: { lineNumber: 'ASC' },
    });
    return { ...invoice, lines };
  }

  private async findInvoiceOrThrow(tenantId: string, id: string): Promise<VendorInvoice> {
    const invoice = await this.invoiceRepo.findOne({ where: { id, tenantId } });
    if (!invoice) throw new NotFoundException(`Vendor Invoice ${id} not found`);
    return invoice;
  }

  async submitInvoice(tenantId: string, id: string): Promise<any> {
    const invoice = await this.findInvoiceOrThrow(tenantId, id);
    if (invoice.status !== VendorInvoiceStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT invoices can be submitted');
    }
    invoice.status = VendorInvoiceStatus.SUBMITTED;
    await this.invoiceRepo.save(invoice);
    return this.getInvoice(tenantId, id);
  }

  async reviewInvoice(tenantId: string, id: string): Promise<any> {
    const invoice = await this.findInvoiceOrThrow(tenantId, id);
    if (invoice.status !== VendorInvoiceStatus.SUBMITTED) {
      throw new BadRequestException('Only SUBMITTED invoices can be put under review');
    }
    invoice.status = VendorInvoiceStatus.UNDER_REVIEW;
    await this.invoiceRepo.save(invoice);
    return this.getInvoice(tenantId, id);
  }

  async performThreeWayMatch(tenantId: string, id: string): Promise<any> {
    const invoice = await this.invoiceRepo.findOne({ where: { id, tenantId } });
    if (!invoice) throw new NotFoundException(`Vendor Invoice ${id} not found`);

    const invoiceLines = await this.lineRepo.find({ where: { invoiceId: id, tenantId } });

    let poTotal = 0;
    let grnTotal = 0;
    const invoiceTotal = invoice.total;
    const lineDiscrepancies: any[] = [];

    // Check PO
    if (invoice.poId) {
      const poLines = await this.poLineRepo.find({ where: { poId: invoice.poId, tenantId } });
      poTotal = poLines.reduce((sum, l) => round2(sum + l.lineTotal), 0);

      for (const invLine of invoiceLines) {
        if (invLine.poLineId) {
          const poLine = poLines.find((l) => l.id === invLine.poLineId);
          if (poLine) {
            const variance = Math.abs(invLine.lineTotal - poLine.lineTotal);
            if (variance >= 0.01) {
              lineDiscrepancies.push({
                lineNumber: invLine.lineNumber,
                description: invLine.description,
                poLineTotal: poLine.lineTotal,
                invoiceLineTotal: invLine.lineTotal,
                variance,
              });
            }
          }
        }
      }
    }

    // Check GRN
    if (invoice.grnId) {
      const grnLines = await this.grnLineRepo.find({ where: { grnId: invoice.grnId, tenantId } });
      // Estimate GRN total from accepted quantities * invoice prices
      for (const invLine of invoiceLines) {
        if (invLine.poLineId) {
          const grnLine = grnLines.find((l) => l.poLineId === invLine.poLineId);
          if (grnLine) {
            const accepted = grnLine.quantityAccepted;
            grnTotal = round2(grnTotal + round2(accepted * invLine.unitPrice));
          }
        }
      }
    }

    const matchDetails = {
      poTotal,
      grnTotal,
      invoiceTotal,
      variance: round2(Math.abs(invoiceTotal - (poTotal || invoiceTotal))),
      lineDiscrepancies,
    };

    const matched = lineDiscrepancies.length === 0 &&
      (poTotal === 0 || Math.abs(invoiceTotal - poTotal) < 0.01);

    invoice.matchDetails = matchDetails;
    invoice.matchStatus = matched ? MatchStatus.MATCHED : MatchStatus.DISCREPANCY;
    if (matched && invoice.status === VendorInvoiceStatus.UNDER_REVIEW) {
      invoice.status = VendorInvoiceStatus.MATCHED;
    }
    await this.invoiceRepo.save(invoice);

    return this.getInvoice(tenantId, id);
  }

  async approveInvoice(tenantId: string, id: string, userId: string): Promise<any> {
    const invoice = await this.findInvoiceOrThrow(tenantId, id);
    if (invoice.status !== VendorInvoiceStatus.MATCHED) {
      throw new BadRequestException('Only MATCHED invoices can be approved');
    }
    invoice.status = VendorInvoiceStatus.APPROVED;
    await this.invoiceRepo.save(invoice);
    return this.getInvoice(tenantId, id);
  }

  async rejectInvoice(tenantId: string, id: string, reason: string): Promise<any> {
    const invoice = await this.findInvoiceOrThrow(tenantId, id);
    invoice.status = VendorInvoiceStatus.REJECTED;
    invoice.rejectionReason = reason;
    await this.invoiceRepo.save(invoice);
    return this.getInvoice(tenantId, id);
  }

  async recordPayment(tenantId: string, id: string, amount: number): Promise<any> {
    const invoice = await this.findInvoiceOrThrow(tenantId, id);
    if (![VendorInvoiceStatus.APPROVED, VendorInvoiceStatus.PARTIALLY_PAID].includes(invoice.status)) {
      throw new BadRequestException('Invoice must be APPROVED or PARTIALLY_PAID to record payment');
    }
    invoice.paidAmount = round2(invoice.paidAmount + amount);
    if (invoice.paidAmount >= invoice.total) {
      invoice.status = VendorInvoiceStatus.PAID;
    } else {
      invoice.status = VendorInvoiceStatus.PARTIALLY_PAID;
    }
    await this.invoiceRepo.save(invoice);
    return this.getPaymentStatus(tenantId, id);
  }

  async getPaymentStatus(
    tenantId: string,
    id: string,
  ): Promise<{ total: number; paidAmount: number; outstanding: number; status: string }> {
    const invoice = await this.findInvoiceOrThrow(tenantId, id);
    return {
      total: invoice.total,
      paidAmount: invoice.paidAmount,
      outstanding: round2(invoice.total - invoice.paidAmount),
      status: invoice.status,
    };
  }
}
