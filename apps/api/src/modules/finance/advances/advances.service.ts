import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  VendorAdvance,
  VendorAdvanceStatus,
} from './entities/vendor-advance.entity';
import {
  CustomerAdvance,
  CustomerAdvanceStatus,
} from './entities/customer-advance.entity';
import {
  CreateVendorAdvanceDto,
  PayVendorAdvanceDto,
  ClearVendorAdvanceDto,
  CreateCustomerAdvanceDto,
  ClearCustomerAdvanceDto,
} from './dto/advances.dto';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const daysBetween = (from: string, to: Date): number => {
  const f = new Date(from).getTime();
  const diff = to.getTime() - f;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
};

@Injectable()
export class AdvancesService {
  constructor(
    @InjectRepository(VendorAdvance)
    private readonly vendorRepo: Repository<VendorAdvance>,
    @InjectRepository(CustomerAdvance)
    private readonly customerRepo: Repository<CustomerAdvance>,
  ) {}

  // ─── Vendor advances ───────────────────────────────────────────────────────

  listVendorAdvances(tenantId: string, vendorId?: string): Promise<VendorAdvance[]> {
    const where: any = { tenantId };
    if (vendorId) where.vendorId = vendorId;
    return this.vendorRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  createVendorAdvance(tenantId: string, dto: CreateVendorAdvanceDto): Promise<VendorAdvance> {
    const adv = this.vendorRepo.create({
      tenantId,
      vendorId: dto.vendorId,
      requestDate: dto.requestDate,
      amount: dto.amount,
      paidAmount: 0,
      clearedAmount: 0,
      status: VendorAdvanceStatus.REQUESTED,
      reference: dto.reference ?? null,
      currency: dto.currency ?? 'INR',
      notes: dto.notes ?? null,
    });
    return this.vendorRepo.save(adv);
  }

  async payVendorAdvance(tenantId: string, id: string, dto: PayVendorAdvanceDto): Promise<VendorAdvance> {
    const adv = await this.vendorRepo.findOne({ where: { id, tenantId } });
    if (!adv) throw new NotFoundException(`Vendor advance ${id} not found`);
    if (adv.status === VendorAdvanceStatus.CLEARED) {
      throw new BadRequestException('Advance already cleared');
    }
    const payAmount = dto.amount ?? adv.amount;
    adv.paidAmount = round2(adv.paidAmount + payAmount);
    if (adv.paidAmount > adv.amount) adv.paidAmount = adv.amount;
    adv.paidDate = dto.paidDate ?? new Date().toISOString().slice(0, 10);
    if (dto.reference) adv.reference = dto.reference;
    adv.status = VendorAdvanceStatus.PAID;
    return this.vendorRepo.save(adv);
  }

  async clearVendorAdvance(tenantId: string, id: string, dto: ClearVendorAdvanceDto): Promise<VendorAdvance> {
    const adv = await this.vendorRepo.findOne({ where: { id, tenantId } });
    if (!adv) throw new NotFoundException(`Vendor advance ${id} not found`);
    if (adv.status === VendorAdvanceStatus.REQUESTED) {
      throw new BadRequestException('Advance must be paid before it can be cleared');
    }
    const remaining = round2(adv.paidAmount - adv.clearedAmount);
    if (dto.amount > remaining) {
      throw new BadRequestException(`Clear amount exceeds remaining paid balance (${remaining})`);
    }
    adv.clearedAmount = round2(adv.clearedAmount + dto.amount);
    adv.billId = dto.billId;
    adv.status =
      adv.clearedAmount >= adv.paidAmount
        ? VendorAdvanceStatus.CLEARED
        : VendorAdvanceStatus.PARTIALLY_CLEARED;
    return this.vendorRepo.save(adv);
  }

  // ─── Customer advances ─────────────────────────────────────────────────────

  listCustomerAdvances(tenantId: string, customerId?: string): Promise<CustomerAdvance[]> {
    const where: any = { tenantId };
    if (customerId) where.customerId = customerId;
    return this.customerRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  createCustomerAdvance(tenantId: string, dto: CreateCustomerAdvanceDto): Promise<CustomerAdvance> {
    const adv = this.customerRepo.create({
      tenantId,
      customerId: dto.customerId,
      receiptDate: dto.receiptDate,
      amount: dto.amount,
      clearedAmount: 0,
      status: CustomerAdvanceStatus.RECEIVED,
      reference: dto.reference ?? null,
      currency: dto.currency ?? 'INR',
      notes: dto.notes ?? null,
    });
    return this.customerRepo.save(adv);
  }

  async clearCustomerAdvance(tenantId: string, id: string, dto: ClearCustomerAdvanceDto): Promise<CustomerAdvance> {
    const adv = await this.customerRepo.findOne({ where: { id, tenantId } });
    if (!adv) throw new NotFoundException(`Customer advance ${id} not found`);
    const remaining = round2(adv.amount - adv.clearedAmount);
    if (dto.amount > remaining) {
      throw new BadRequestException(`Clear amount exceeds remaining advance balance (${remaining})`);
    }
    adv.clearedAmount = round2(adv.clearedAmount + dto.amount);
    adv.invoiceId = dto.invoiceId;
    adv.status =
      adv.clearedAmount >= adv.amount
        ? CustomerAdvanceStatus.CLEARED
        : CustomerAdvanceStatus.PARTIALLY_CLEARED;
    return this.customerRepo.save(adv);
  }

  // ─── Aging ─────────────────────────────────────────────────────────────────

  async aging(tenantId: string): Promise<{
    vendor: any[];
    customer: any[];
    summary: { vendorUncleared: number; customerUncleared: number };
  }> {
    const now = new Date();
    const [vendors, customers] = await Promise.all([
      this.vendorRepo.find({ where: { tenantId } }),
      this.customerRepo.find({ where: { tenantId } }),
    ]);

    const vendor = vendors
      .map((a) => ({
        id: a.id,
        vendorId: a.vendorId,
        reference: a.reference,
        date: a.paidDate ?? a.requestDate,
        amount: a.amount,
        paidAmount: a.paidAmount,
        clearedAmount: a.clearedAmount,
        uncleared: round2(a.paidAmount - a.clearedAmount),
        ageDays: daysBetween(a.paidDate ?? a.requestDate, now),
        status: a.status,
      }))
      .filter((a) => a.uncleared > 0);

    const customer = customers
      .map((a) => ({
        id: a.id,
        customerId: a.customerId,
        reference: a.reference,
        date: a.receiptDate,
        amount: a.amount,
        clearedAmount: a.clearedAmount,
        uncleared: round2(a.amount - a.clearedAmount),
        ageDays: daysBetween(a.receiptDate, now),
        status: a.status,
      }))
      .filter((a) => a.uncleared > 0);

    return {
      vendor,
      customer,
      summary: {
        vendorUncleared: round2(vendor.reduce((s, a) => s + a.uncleared, 0)),
        customerUncleared: round2(customer.reduce((s, a) => s + a.uncleared, 0)),
      },
    };
  }
}
