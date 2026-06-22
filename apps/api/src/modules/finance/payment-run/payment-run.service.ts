import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentRun, PaymentRunStatus } from './entities/payment-run.entity';
import { PaymentRunItem } from './entities/payment-run-item.entity';
import { Bill, BillStatus } from '../ap/entities/bill.entity';
import { Vendor } from '../ap/entities/vendor.entity';
import { ApService } from '../ap/ap.service';
import { PaymentMethod } from '../ap/entities/vendor-payment.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface CreateProposalInput {
  dueByDate: string;
  paymentMethod: string;
  bankAccountId?: string | null;
}

@Injectable()
export class PaymentRunService {
  constructor(
    @InjectRepository(PaymentRun)
    private readonly runRepo: Repository<PaymentRun>,
    @InjectRepository(PaymentRunItem)
    private readonly itemRepo: Repository<PaymentRunItem>,
    @InjectRepository(Bill)
    private readonly billRepo: Repository<Bill>,
    @InjectRepository(Vendor)
    private readonly vendorRepo: Repository<Vendor>,
    private readonly apService: ApService,
  ) {}

  async createProposal(
    tenantId: string,
    input: CreateProposalInput,
  ): Promise<{ run: PaymentRun; items: PaymentRunItem[] }> {
    if (!input.dueByDate) throw new BadRequestException('dueByDate is required');
    if (!input.paymentMethod) throw new BadRequestException('paymentMethod is required');

    const bills = await this.billRepo
      .createQueryBuilder('b')
      .where('b.tenantId = :tenantId', { tenantId })
      .andWhere('b.status IN (:...statuses)', {
        statuses: [BillStatus.OPEN, BillStatus.PARTIAL],
      })
      .andWhere('b.balanceDue > 0')
      .andWhere('b.dueDate <= :dueBy', { dueBy: input.dueByDate })
      .orderBy('b.dueDate', 'ASC')
      .getMany();

    const vendors = await this.vendorRepo.find({ where: { tenantId } });
    const vendorMap = new Map(vendors.map((v) => [v.id, v]));

    const today = new Date().toISOString().slice(0, 10);
    const run = await this.runRepo.save(
      this.runRepo.create({
        tenantId,
        runDate: today,
        postingDate: today,
        paymentMethod: input.paymentMethod,
        status: PaymentRunStatus.PROPOSED,
        bankAccountId: input.bankAccountId || null,
        totalAmount: 0,
        vendorCount: 0,
      }),
    );

    const itemEntities = bills.map((b) =>
      this.itemRepo.create({
        tenantId,
        paymentRunId: run.id,
        vendorId: b.vendorId,
        vendorName: vendorMap.get(b.vendorId)?.name || 'Unknown',
        billId: b.id,
        billNumber: b.billNumber,
        amount: round2(b.balanceDue),
        included: true,
      }),
    );
    const items = await this.itemRepo.save(itemEntities);

    await this.recomputeTotals(tenantId, run.id);
    const updated = await this.runRepo.findOne({ where: { id: run.id, tenantId } });
    return { run: updated!, items };
  }

  private async recomputeTotals(tenantId: string, runId: string): Promise<void> {
    const items = await this.itemRepo.find({
      where: { tenantId, paymentRunId: runId },
    });
    const included = items.filter((i) => i.included);
    const totalAmount = round2(included.reduce((s, i) => s + Number(i.amount), 0));
    const vendorCount = new Set(included.map((i) => i.vendorId)).size;
    await this.runRepo.update(
      { id: runId, tenantId },
      { totalAmount, vendorCount },
    );
  }

  async getProposal(
    tenantId: string,
    runId: string,
  ): Promise<{ run: PaymentRun; items: PaymentRunItem[] }> {
    const run = await this.runRepo.findOne({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundException(`Payment run ${runId} not found`);
    const items = await this.itemRepo.find({
      where: { tenantId, paymentRunId: runId },
      order: { vendorName: 'ASC' },
    });
    return { run, items };
  }

  async listRuns(tenantId: string): Promise<PaymentRun[]> {
    return this.runRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async toggleItem(
    tenantId: string,
    itemId: string,
    included: boolean,
  ): Promise<PaymentRunItem> {
    const item = await this.itemRepo.findOne({ where: { id: itemId, tenantId } });
    if (!item) throw new NotFoundException(`Payment run item ${itemId} not found`);
    const run = await this.runRepo.findOne({
      where: { id: item.paymentRunId, tenantId },
    });
    if (run && run.status !== PaymentRunStatus.PROPOSED) {
      throw new BadRequestException('Items can only be changed on a PROPOSED run');
    }
    item.included = included;
    await this.itemRepo.save(item);
    await this.recomputeTotals(tenantId, item.paymentRunId);
    return item;
  }

  async approveRun(tenantId: string, runId: string): Promise<PaymentRun> {
    const run = await this.runRepo.findOne({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundException(`Payment run ${runId} not found`);
    if (run.status !== PaymentRunStatus.PROPOSED) {
      throw new BadRequestException(`Only PROPOSED runs can be approved (current: ${run.status})`);
    }
    run.status = PaymentRunStatus.APPROVED;
    return this.runRepo.save(run);
  }

  private mapMethod(method: string): PaymentMethod {
    switch ((method || '').toUpperCase()) {
      case 'CHECK':
        return PaymentMethod.CHECK;
      case 'NEFT':
      case 'RTGS':
      case 'ACH':
      default:
        return PaymentMethod.BANK_TRANSFER;
    }
  }

  async postRun(
    tenantId: string,
    runId: string,
    userId: string,
  ): Promise<{ run: PaymentRun; paymentsCreated: number; totalPosted: number }> {
    const run = await this.runRepo.findOne({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundException(`Payment run ${runId} not found`);
    if (run.status !== PaymentRunStatus.APPROVED) {
      throw new BadRequestException(`Only APPROVED runs can be posted (current: ${run.status})`);
    }

    const items = await this.itemRepo.find({
      where: { tenantId, paymentRunId: runId, included: true },
    });
    if (items.length === 0) {
      throw new BadRequestException('No included items to post');
    }

    // Group included items by vendor -> one payment per vendor with allocations.
    const byVendor = new Map<string, PaymentRunItem[]>();
    for (const item of items) {
      const arr = byVendor.get(item.vendorId) || [];
      arr.push(item);
      byVendor.set(item.vendorId, arr);
    }

    let paymentsCreated = 0;
    let totalPosted = 0;
    const method = this.mapMethod(run.paymentMethod);

    for (const [vendorId, vendorItems] of byVendor.entries()) {
      const amount = round2(vendorItems.reduce((s, i) => s + Number(i.amount), 0));
      if (amount <= 0) continue;
      await this.apService.createVendorPayment(
        tenantId,
        {
          vendorId,
          paymentDate: run.postingDate,
          amount,
          method,
          reference: `PRUN-${run.id.slice(0, 8)}`,
          bankAccountId: run.bankAccountId || undefined,
          allocations: vendorItems.map((i) => ({
            billId: i.billId,
            amount: Number(i.amount),
          })),
        } as any,
        userId,
      );
      paymentsCreated++;
      totalPosted = round2(totalPosted + amount);
    }

    run.status = PaymentRunStatus.POSTED;
    await this.runRepo.save(run);

    return { run, paymentsCreated, totalPosted };
  }

  async generateBankFile(tenantId: string, runId: string): Promise<string> {
    const run = await this.runRepo.findOne({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundException(`Payment run ${runId} not found`);
    const items = await this.itemRepo.find({
      where: { tenantId, paymentRunId: runId, included: true },
      order: { vendorName: 'ASC' },
    });

    const vendors = await this.vendorRepo.find({ where: { tenantId } });
    const vendorMap = new Map(vendors.map((v) => [v.id, v]));

    // Group by vendor (one payment line per vendor).
    const byVendor = new Map<string, { name: string; amount: number; vendorId: string }>();
    for (const i of items) {
      const cur = byVendor.get(i.vendorId) || { name: i.vendorName, amount: 0, vendorId: i.vendorId };
      cur.amount = round2(cur.amount + Number(i.amount));
      byVendor.set(i.vendorId, cur);
    }

    const escape = (v: any) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows: string[] = ['vendor,account,amount,reference'];
    for (const v of byVendor.values()) {
      const account = vendorMap.get(v.vendorId)?.taxId || '';
      rows.push(
        [
          escape(v.name),
          escape(account),
          v.amount.toFixed(2),
          escape(`PRUN-${run.id.slice(0, 8)}`),
        ].join(','),
      );
    }
    return rows.join('\n');
  }
}
