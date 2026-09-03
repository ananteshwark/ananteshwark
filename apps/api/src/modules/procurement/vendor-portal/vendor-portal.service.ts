import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Vendor } from '../../finance/ap/entities/vendor.entity';
import { Rfq } from '../rfq/entities/rfq.entity';
import { RfqVendor } from '../rfq/entities/rfq-vendor.entity';
import { RfqQuote } from '../rfq/entities/rfq-quote.entity';
import { PurchaseOrder, PoStatus } from '../po/entities/purchase-order.entity';
import { VendorInvoiceService } from '../vendor-invoice/vendor-invoice.service';
import { InvoiceSource } from '../vendor-invoice/entities/vendor-invoice.entity';
import { PortalSubmitInvoiceDto, SubmitQuoteDto } from './dto/vendor-portal.dto';

@Injectable()
export class VendorPortalService {
  constructor(
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(Rfq)
    private readonly rfqRepo: Repository<Rfq>,
    @InjectRepository(RfqVendor)
    private readonly rfqVendorRepo: Repository<RfqVendor>,
    @InjectRepository(RfqQuote)
    private readonly rfqQuoteRepo: Repository<RfqQuote>,
    @InjectRepository(PurchaseOrder)
    private readonly poRepo: Repository<PurchaseOrder>,
    private readonly vendorInvoiceService: VendorInvoiceService,
  ) {}

  async enablePortalAccess(
    tenantId: string,
    vendorId: string,
    portalEmail: string,
    password: string,
  ): Promise<{ message: string }> {
    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId, tenantId } });
    if (!vendor) throw new NotFoundException(`Vendor ${vendorId} not found`);

    const hash = await bcrypt.hash(password, 12);
    vendor.portalEnabled = true;
    vendor.portalPasswordHash = hash;
    vendor.portalEmail = portalEmail;
    await this.vendorRepo.save(vendor);

    return { message: 'Portal access enabled' };
  }

  async vendorLogin(
    tenantId: string,
    portalEmail: string,
    password: string,
  ): Promise<{ vendorId: string; vendorName: string; tenantId: string }> {
    const vendor = await this.vendorRepo.findOne({
      where: { portalEmail: portalEmail.toLowerCase(), tenantId, portalEnabled: true },
    });
    if (!vendor || !vendor.portalPasswordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, vendor.portalPasswordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    vendor.portalLastLogin = new Date();
    await this.vendorRepo.save(vendor);

    return { vendorId: vendor.id, vendorName: vendor.name, tenantId };
  }

  async getMyRfqs(tenantId: string, vendorId: string): Promise<any[]> {
    const rfqVendors = await this.rfqVendorRepo.find({
      where: { tenantId, vendorId },
    });
    if (rfqVendors.length === 0) return [];

    const rfqIds = rfqVendors.map((rv) => rv.rfqId);
    const rfqs = await this.rfqRepo
      .createQueryBuilder('rfq')
      .where('rfq.tenantId = :tenantId', { tenantId })
      .andWhere('rfq.id IN (:...rfqIds)', { rfqIds })
      .orderBy('rfq.createdAt', 'DESC')
      .getMany();

    return rfqs;
  }

  async getRfqDetail(tenantId: string, rfqId: string, vendorId: string): Promise<any> {
    const rfqVendor = await this.rfqVendorRepo.findOne({
      where: { rfqId, vendorId, tenantId },
    });
    if (!rfqVendor) throw new NotFoundException('RFQ not found or vendor not invited');

    const rfq = await this.rfqRepo.findOne({ where: { id: rfqId, tenantId } });
    if (!rfq) throw new NotFoundException('RFQ not found');

    const quotes = await this.rfqQuoteRepo.find({
      where: { rfqId, vendorId, tenantId },
    });

    return { ...rfq, vendorStatus: rfqVendor, quotes };
  }

  async submitQuote(
    tenantId: string,
    rfqId: string,
    vendorId: string,
    dto: SubmitQuoteDto,
  ): Promise<RfqQuote[]> {
    const rfqVendor = await this.rfqVendorRepo.findOne({
      where: { rfqId, vendorId, tenantId },
    });
    if (!rfqVendor) throw new NotFoundException('RFQ vendor record not found');

    // Remove existing quotes for these lines and re-create
    const lineIds = dto.lines.map((l) => l.lineId);
    for (const lineId of lineIds) {
      await this.rfqQuoteRepo.delete({ rfqId, vendorId, tenantId, lineId });
    }

    const quotes = dto.lines.map((l) =>
      this.rfqQuoteRepo.create({
        tenantId,
        rfqId,
        vendorId,
        lineId: l.lineId,
        unitPrice: l.unitPrice,
        totalPrice: l.unitPrice, // Will be computed properly if quantity is passed
        leadTimeDays: l.leadTimeDays ?? null,
        notes: l.notes ?? null,
      }),
    );
    const saved = await this.rfqQuoteRepo.save(quotes);

    // Mark vendor as responded
    rfqVendor.responded = true;
    rfqVendor.respondedAt = new Date();
    await this.rfqVendorRepo.save(rfqVendor);

    return saved;
  }

  async getMyPurchaseOrders(tenantId: string, vendorId: string): Promise<PurchaseOrder[]> {
    const releasedStatuses = [
      PoStatus.RELEASED,
      PoStatus.SENT,
      PoStatus.PARTIALLY_RECEIVED,
      PoStatus.RECEIVED,
      PoStatus.INVOICED,
      PoStatus.CLOSED,
    ];
    return this.poRepo
      .createQueryBuilder('po')
      .where('po.tenantId = :tenantId', { tenantId })
      .andWhere('po.vendorId = :vendorId', { vendorId })
      .andWhere('po.status IN (:...statuses)', { statuses: releasedStatuses })
      .orderBy('po.createdAt', 'DESC')
      .getMany();
  }

  async getPurchaseOrderDetail(tenantId: string, poId: string, vendorId: string): Promise<any> {
    const po = await this.poRepo.findOne({ where: { id: poId, tenantId, vendorId } });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async submitInvoice(
    tenantId: string,
    vendorId: string,
    dto: PortalSubmitInvoiceDto,
  ): Promise<any> {
    // Verify the PO belongs to this vendor if provided
    if (dto.poId) {
      const po = await this.poRepo.findOne({ where: { id: dto.poId, tenantId, vendorId } });
      if (!po) throw new BadRequestException('PO not found or does not belong to this vendor');
    }

    const vendor = await this.vendorRepo.findOne({ where: { id: vendorId, tenantId } });
    if (!vendor) throw new NotFoundException('Vendor not found');

    return this.vendorInvoiceService.createInvoice(
      tenantId,
      {
        vendorInvoiceRef: dto.vendorInvoiceRef,
        vendorId,
        vendorName: vendor.name,
        poId: dto.poId,
        grnId: dto.grnId,
        invoiceDate: dto.invoiceDate,
        dueDate: dto.dueDate,
        currency: dto.currency,
        notes: dto.notes,
        lines: dto.lines.map((l) => ({
          poLineId: l.poLineId,
          itemCode: l.itemCode,
          description: l.description,
          uom: l.uom,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          taxRate: l.taxRate,
        })),
      },
      InvoiceSource.VENDOR_PORTAL,
    );
  }

  async getMyInvoices(tenantId: string, vendorId: string): Promise<any> {
    return this.vendorInvoiceService.listInvoices(tenantId, { vendorId, page: 1, limit: 100 });
  }

  async vendorInvoiceDetail(tenantId: string, invoiceId: string, vendorId: string): Promise<any> {
    const invoice = await this.vendorInvoiceService.getInvoice(tenantId, invoiceId);
    if (invoice.vendorId !== vendorId) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  async getMyPayments(tenantId: string, vendorId: string): Promise<any> {
    const result = await this.vendorInvoiceService.listInvoices(tenantId, {
      vendorId,
      page: 1,
      limit: 100,
    });

    const paidInvoices = result.items.filter(
      (inv: any) =>
        inv.status === 'PAID' || inv.status === 'PARTIALLY_PAID',
    );

    const totalPaid = paidInvoices.reduce((sum: number, inv: any) => sum + Number(inv.paidAmount), 0);
    const totalOutstanding = paidInvoices.reduce(
      (sum: number, inv: any) => sum + Math.max(0, Number(inv.total) - Number(inv.paidAmount)),
      0,
    );

    return {
      invoices: paidInvoices,
      summary: {
        totalPaid,
        totalOutstanding,
        invoiceCount: paidInvoices.length,
      },
    };
  }
}
