import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Vendor, VendorStatus } from './entities/vendor.entity';
import { Bill, BillStatus } from './entities/bill.entity';
import { BillLine } from './entities/bill-line.entity';
import { VendorPayment } from './entities/vendor-payment.entity';
import { PaymentAllocation } from './entities/payment-allocation.entity';
import { Account } from '../gl/entities/account.entity';
import { BankAccount } from '../bank/entities/bank-account.entity';
import { GlService } from '../gl/gl.service';
import { CurrencyService } from '../currency/currency.service';
import { JournalSource } from '../gl/entities/journal-entry.entity';
import { DEFAULT_ACCOUNT_CODES } from '../finance.constants';
import {
  CreateVendorDto,
  UpdateVendorDto,
  CreateBillDto,
  UpdateBillDto,
  CreateVendorPaymentDto,
  AllocatePaymentDto,
  BillLineDto,
  PaymentAllocationDto,
} from './dto/ap.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class ApService {
  constructor(
    @InjectRepository(Vendor) private readonly vendorRepo: Repository<Vendor>,
    @InjectRepository(Bill) private readonly billRepo: Repository<Bill>,
    @InjectRepository(BillLine) private readonly billLineRepo: Repository<BillLine>,
    @InjectRepository(VendorPayment) private readonly paymentRepo: Repository<VendorPayment>,
    @InjectRepository(PaymentAllocation)
    private readonly allocationRepo: Repository<PaymentAllocation>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(BankAccount) private readonly bankAccountRepo: Repository<BankAccount>,
    private readonly glService: GlService,
    private readonly currencyService: CurrencyService,
    private readonly dataSource: DataSource,
  ) {}

  private async resolveAccountByCode(tenantId: string, code: string): Promise<Account> {
    const account = await this.accountRepo.findOne({ where: { tenantId, code } });
    if (!account) {
      throw new BadRequestException(
        `Required control account (code ${code}) is missing from the chart of accounts`,
      );
    }
    return account;
  }

  private async nextNumber(
    tenantId: string,
    repo: Repository<any>,
    field: string,
    prefix: string,
  ): Promise<string> {
    const column = field.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
    const row = await repo
      .createQueryBuilder('e')
      .select(
        `MAX(CAST(NULLIF(regexp_replace(e.${column}, '\\D', '', 'g'), '') AS INTEGER))`,
        'max',
      )
      .where('e.tenant_id = :tenantId', { tenantId })
      .getRawOne<{ max: string | null }>();
    const next = (row?.max ? parseInt(row.max, 10) : 0) + 1;
    return `${prefix}-${String(next).padStart(6, '0')}`;
  }

  // -------------------- Vendors --------------------

  async createVendor(tenantId: string, dto: CreateVendorDto): Promise<Vendor> {
    const existing = await this.vendorRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Vendor code ${dto.code} already exists`);
    if (dto.apAccountId) await this.glService.findAccount(tenantId, dto.apAccountId);
    const vendor = this.vendorRepo.create({ ...dto, tenantId });
    return this.vendorRepo.save(vendor);
  }

  async findVendors(
    tenantId: string,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedResponseDto<Vendor>> {
    const { page = 1, limit = 20, sortBy = 'name', sortOrder = 'ASC' } = pagination;
    const qb = this.vendorRepo
      .createQueryBuilder('v')
      .where('v.tenantId = :tenantId', { tenantId });
    if (search) {
      qb.andWhere('(v.name ILIKE :s OR v.code ILIKE :s OR v.email ILIKE :s)', {
        s: `%${search}%`,
      });
    }
    const validSort = ['name', 'code', 'createdAt'];
    qb.orderBy(`v.${validSort.includes(sortBy) ? sortBy : 'name'}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findVendor(tenantId: string, id: string): Promise<Vendor> {
    const vendor = await this.vendorRepo.findOne({ where: { id, tenantId } });
    if (!vendor) throw new NotFoundException(`Vendor ${id} not found`);
    return vendor;
  }

  async updateVendor(tenantId: string, id: string, dto: UpdateVendorDto): Promise<Vendor> {
    const vendor = await this.findVendor(tenantId, id);
    if (dto.apAccountId) await this.glService.findAccount(tenantId, dto.apAccountId);
    Object.assign(vendor, dto);
    return this.vendorRepo.save(vendor);
  }

  // -------------------- Bills --------------------

  private computeBillLines(lines: BillLineDto[]): {
    computed: Array<BillLineDto & { taxAmount: number; lineTotal: number; quantity: number }>;
    subtotal: number;
    taxAmount: number;
    total: number;
  } {
    let subtotal = 0;
    let taxAmount = 0;
    const computed = lines.map((l) => {
      const qty = l.quantity ?? 1;
      const net = round2(qty * l.unitPrice);
      const tax = round2(net * ((l.taxRate || 0) / 100));
      subtotal = round2(subtotal + net);
      taxAmount = round2(taxAmount + tax);
      return { ...l, quantity: qty, taxAmount: tax, lineTotal: round2(net + tax) };
    });
    return { computed, subtotal, taxAmount, total: round2(subtotal + taxAmount) };
  }

  async createBill(tenantId: string, dto: CreateBillDto): Promise<Bill> {
    const vendor = await this.findVendor(tenantId, dto.vendorId);
    // validate expense accounts exist
    for (const l of dto.lines) await this.glService.findAccount(tenantId, l.accountId);

    const { computed, subtotal, taxAmount, total } = this.computeBillLines(dto.lines);
    const dueDate =
      dto.dueDate ||
      this.addDays(dto.billDate, vendor.paymentTerms || 30);

    return this.dataSource.transaction(async (manager) => {
      const bill = manager.create(Bill, {
        tenantId,
        billNumber: dto.billNumber,
        vendorId: dto.vendorId,
        billDate: dto.billDate,
        dueDate,
        status: BillStatus.DRAFT,
        subtotal,
        taxAmount,
        total,
        amountPaid: 0,
        balanceDue: total,
        currency: dto.currency || vendor.currency || 'USD',
        reference: dto.reference,
        notes: dto.notes,
      });
      const saved = await manager.save(bill);
      await this.persistBillLines(manager, tenantId, saved.id, computed);
      return this.findBill(tenantId, saved.id, manager);
    });
  }

  private async persistBillLines(
    manager: any,
    tenantId: string,
    billId: string,
    lines: Array<BillLineDto & { taxAmount: number; lineTotal: number; quantity: number }>,
  ): Promise<void> {
    const entities = lines.map((l, idx) =>
      manager.create(BillLine, {
        tenantId,
        billId,
        lineNumber: idx + 1,
        description: l.description,
        accountId: l.accountId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate || 0,
        taxAmount: l.taxAmount,
        lineTotal: l.lineTotal,
      }),
    );
    await manager.save(entities);
  }

  private addDays(date: string, days: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  async findBills(
    tenantId: string,
    pagination: PaginationDto,
    filters: { status?: BillStatus; vendorId?: string },
  ): Promise<PaginatedResponseDto<Bill>> {
    const { page = 1, limit = 20, sortBy = 'billDate', sortOrder = 'DESC' } = pagination;
    const qb = this.billRepo
      .createQueryBuilder('b')
      .where('b.tenantId = :tenantId', { tenantId });
    if (filters.status) qb.andWhere('b.status = :status', { status: filters.status });
    if (filters.vendorId) qb.andWhere('b.vendorId = :vendorId', { vendorId: filters.vendorId });
    const validSort = ['billDate', 'dueDate', 'total', 'createdAt'];
    qb.orderBy(`b.${validSort.includes(sortBy) ? sortBy : 'billDate'}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findBill(
    tenantId: string,
    id: string,
    manager = this.billRepo.manager,
  ): Promise<Bill & { lines: BillLine[] }> {
    const bill = await manager.findOne(Bill, { where: { id, tenantId } });
    if (!bill) throw new NotFoundException(`Bill ${id} not found`);
    const lines = await manager.find(BillLine, {
      where: { billId: id, tenantId },
      order: { lineNumber: 'ASC' },
    });
    return { ...bill, lines } as Bill & { lines: BillLine[] };
  }

  async getBillForPrint(
    tenantId: string,
    id: string,
  ): Promise<{ bill: Bill; vendor: Vendor | null; lines: BillLine[] }> {
    const bill = await this.billRepo.findOne({ where: { id, tenantId } });
    if (!bill) throw new NotFoundException(`Bill ${id} not found`);
    const lines = await this.billLineRepo.find({
      where: { billId: id, tenantId },
      order: { lineNumber: 'ASC' },
    });
    const vendor = await this.vendorRepo.findOne({ where: { id: bill.vendorId, tenantId } });
    return { bill, vendor, lines };
  }

  async updateBill(tenantId: string, id: string, dto: UpdateBillDto): Promise<Bill> {
    const bill = await this.billRepo.findOne({ where: { id, tenantId } });
    if (!bill) throw new NotFoundException(`Bill ${id} not found`);
    if (bill.status !== BillStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT bills can be edited');
    }
    return this.dataSource.transaction(async (manager) => {
      if (dto.lines) {
        for (const l of dto.lines) await this.glService.findAccount(tenantId, l.accountId);
        const { computed, subtotal, taxAmount, total } = this.computeBillLines(dto.lines);
        bill.subtotal = subtotal;
        bill.taxAmount = taxAmount;
        bill.total = total;
        bill.balanceDue = round2(total - bill.amountPaid);
        await manager.delete(BillLine, { billId: id, tenantId });
        await this.persistBillLines(manager, tenantId, id, computed);
      }
      if (dto.billDate !== undefined) bill.billDate = dto.billDate;
      if (dto.dueDate !== undefined) bill.dueDate = dto.dueDate;
      if (dto.reference !== undefined) bill.reference = dto.reference;
      if (dto.notes !== undefined) bill.notes = dto.notes;
      await manager.save(bill);
      return this.findBill(tenantId, id, manager);
    });
  }

  /** Post a bill: Dr expense lines + Dr tax payable, Cr AP control. */
  async postBill(tenantId: string, id: string, userId: string): Promise<Bill> {
    return this.dataSource.transaction(async (manager) => {
      const bill = await manager.findOne(Bill, { where: { id, tenantId } });
      if (!bill) throw new NotFoundException(`Bill ${id} not found`);
      if (bill.status !== BillStatus.DRAFT) {
        throw new BadRequestException(`Bill is already ${bill.status}; only DRAFT bills can be posted`);
      }
      const lines = await manager.find(BillLine, { where: { billId: id, tenantId } });
      if (lines.length === 0) throw new BadRequestException('Bill has no lines');

      const vendor = await manager.findOne(Vendor, { where: { id: bill.vendorId, tenantId } });
      const apAccount = vendor?.apAccountId
        ? await this.glService.findAccount(tenantId, vendor.apAccountId)
        : await this.resolveAccountByCode(tenantId, DEFAULT_ACCOUNT_CODES.AP_CONTROL);

      const jeLines: any[] = lines.map((l) => ({
        accountId: l.accountId,
        description: l.description,
        debit: round2(l.quantity * l.unitPrice),
        credit: 0,
      }));
      if (bill.taxAmount > 0) {
        const taxAccount = await this.resolveAccountByCode(
          tenantId,
          DEFAULT_ACCOUNT_CODES.TAX_PAYABLE,
        );
        jeLines.push({
          accountId: taxAccount.id,
          description: 'Input tax',
          debit: bill.taxAmount,
          credit: 0,
        });
      }
      jeLines.push({
        accountId: apAccount.id,
        description: `AP - ${vendor?.name || 'Vendor'} - ${bill.billNumber}`,
        debit: 0,
        credit: bill.total,
      });

      const je = await this.glService.postJournalEntry(
        tenantId,
        {
          date: bill.billDate,
          description: `Vendor bill ${bill.billNumber}`,
          reference: bill.reference || bill.billNumber,
          source: JournalSource.AP,
          currency: bill.currency,
          lines: jeLines,
        },
        userId,
        manager,
      );

      bill.journalEntryId = je.id;
      bill.status = BillStatus.OPEN;

      // FX conversion: store base-currency equivalent at posting time
      const billDate = new Date(bill.billDate);
      const fxResult = await this.currencyService.convert(
        tenantId, bill.total, bill.currency,
        billDate.getFullYear(), billDate.getMonth() + 1,
      );
      if (fxResult) {
        bill.baseCurrency = fxResult.baseCurrency;
        bill.exchangeRate = fxResult.rate;
        bill.totalBase = fxResult.baseAmount;
      }

      await manager.save(bill);
      return this.findBill(tenantId, id, manager);
    });
  }

  async voidBill(tenantId: string, id: string, userId: string): Promise<Bill> {
    return this.dataSource.transaction(async (manager) => {
      const bill = await manager.findOne(Bill, { where: { id, tenantId } });
      if (!bill) throw new NotFoundException(`Bill ${id} not found`);
      if (bill.amountPaid > 0) {
        throw new BadRequestException('Cannot void a bill that has payments applied');
      }
      if (bill.journalEntryId) {
        await this.glService.reverseJournalEntry(tenantId, bill.journalEntryId, userId);
      }
      bill.status = BillStatus.VOID;
      bill.balanceDue = 0;
      await manager.save(bill);
      return this.findBill(tenantId, id, manager);
    });
  }

  // -------------------- Vendor Payments --------------------

  async createVendorPayment(
    tenantId: string,
    dto: CreateVendorPaymentDto,
    userId: string,
  ): Promise<VendorPayment> {
    const vendor = await this.findVendor(tenantId, dto.vendorId);
    if (dto.amount <= 0) throw new BadRequestException('Payment amount must be positive');

    return this.dataSource.transaction(async (manager) => {
      // resolve credit account (Bank/Cash)
      let creditAccountId = dto.creditAccountId;
      if (dto.bankAccountId) {
        const bankAccount = await manager.findOne(BankAccount, {
          where: { id: dto.bankAccountId, tenantId },
        });
        if (!bankAccount) throw new BadRequestException('Bank account not found');
        creditAccountId = bankAccount.glAccountId;
      }
      if (!creditAccountId) {
        const cash = await this.resolveAccountByCode(tenantId, DEFAULT_ACCOUNT_CODES.BANK);
        creditAccountId = cash.id;
      } else {
        await this.glService.findAccount(tenantId, creditAccountId);
      }

      const apAccount = vendor.apAccountId
        ? await this.glService.findAccount(tenantId, vendor.apAccountId)
        : await this.resolveAccountByCode(tenantId, DEFAULT_ACCOUNT_CODES.AP_CONTROL);

      // JE: Dr AP control, Cr Bank/Cash
      const je = await this.glService.postJournalEntry(
        tenantId,
        {
          date: dto.paymentDate,
          description: `Payment to ${vendor.name}`,
          reference: dto.reference,
          source: JournalSource.AP,
          currency: dto.currency || vendor.currency || 'USD',
          lines: [
            { accountId: apAccount.id, debit: round2(dto.amount), credit: 0 },
            { accountId: creditAccountId, debit: 0, credit: round2(dto.amount) },
          ],
        },
        userId,
        manager,
      );

      const paymentNumber = await this.nextNumber(
        tenantId,
        this.paymentRepo,
        'paymentNumber',
        'PAY',
      );
      const payment = manager.create(VendorPayment, {
        tenantId,
        paymentNumber,
        vendorId: dto.vendorId,
        paymentDate: dto.paymentDate,
        amount: round2(dto.amount),
        method: dto.method,
        reference: dto.reference,
        bankAccountId: dto.bankAccountId || null,
        currency: dto.currency || vendor.currency || 'USD',
        journalEntryId: je.id,
        unappliedAmount: round2(dto.amount),
      });
      const saved = await manager.save(payment);

      if (dto.allocations?.length) {
        await this.applyAllocations(manager, tenantId, saved, dto.allocations);
      }
      return manager.findOne(VendorPayment, { where: { id: saved.id, tenantId } });
    });
  }

  private async applyAllocations(
    manager: any,
    tenantId: string,
    payment: VendorPayment,
    allocations: PaymentAllocationDto[],
  ): Promise<void> {
    let remaining = payment.unappliedAmount;
    for (const alloc of allocations) {
      if (alloc.amount <= 0) continue;
      const bill = await manager.findOne(Bill, { where: { id: alloc.billId, tenantId } });
      if (!bill) throw new NotFoundException(`Bill ${alloc.billId} not found`);
      if (bill.status === BillStatus.DRAFT || bill.status === BillStatus.VOID) {
        throw new BadRequestException(
          `Bill ${bill.billNumber} cannot receive payment in status ${bill.status}`,
        );
      }
      const applyAmount = round2(Math.min(alloc.amount, bill.balanceDue, remaining));
      if (applyAmount <= 0) continue;

      await manager.save(
        manager.create(PaymentAllocation, {
          tenantId,
          vendorPaymentId: payment.id,
          billId: bill.id,
          amount: applyAmount,
        }),
      );

      bill.amountPaid = round2(bill.amountPaid + applyAmount);
      bill.balanceDue = round2(bill.total - bill.amountPaid);
      bill.status =
        bill.balanceDue <= 0
          ? BillStatus.PAID
          : bill.amountPaid > 0
            ? BillStatus.PARTIAL
            : BillStatus.OPEN;
      await manager.save(bill);

      remaining = round2(remaining - applyAmount);
      if (remaining <= 0) break;
    }
    payment.unappliedAmount = round2(remaining);
    await manager.save(payment);
  }

  async allocatePayment(
    tenantId: string,
    paymentId: string,
    dto: AllocatePaymentDto,
  ): Promise<VendorPayment> {
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(VendorPayment, {
        where: { id: paymentId, tenantId },
      });
      if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);
      if (payment.unappliedAmount <= 0) {
        throw new BadRequestException('Payment is already fully allocated');
      }
      await this.applyAllocations(manager, tenantId, payment, dto.allocations);
      return manager.findOne(VendorPayment, { where: { id: paymentId, tenantId } });
    });
  }

  async findVendorPayments(
    tenantId: string,
    pagination: PaginationDto,
    vendorId?: string,
  ): Promise<PaginatedResponseDto<VendorPayment>> {
    const { page = 1, limit = 20 } = pagination;
    const where: any = { tenantId };
    if (vendorId) where.vendorId = vendorId;
    const [items, total] = await this.paymentRepo.findAndCount({
      where,
      order: { paymentDate: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findVendorPayment(tenantId: string, id: string): Promise<any> {
    const payment = await this.paymentRepo.findOne({ where: { id, tenantId } });
    if (!payment) throw new NotFoundException(`Payment ${id} not found`);
    const allocations = await this.allocationRepo.find({
      where: { vendorPaymentId: id, tenantId },
    });
    return { ...payment, allocations };
  }

  // -------------------- AP Ageing --------------------

  async getAgeing(tenantId: string, asOf?: string): Promise<any> {
    const asOfDate = asOf || new Date().toISOString().slice(0, 10);
    const bills = await this.billRepo
      .createQueryBuilder('b')
      .where('b.tenantId = :tenantId', { tenantId })
      .andWhere('b.status IN (:...statuses)', {
        statuses: [BillStatus.OPEN, BillStatus.PARTIAL],
      })
      .getMany();

    const vendors = await this.vendorRepo.find({ where: { tenantId } });
    const vendorMap = new Map(vendors.map((v) => [v.id, v]));

    const buckets = () => ({ current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b90plus: 0, total: 0 });
    const byVendor: Record<string, any> = {};
    const totals = buckets();

    for (const bill of bills) {
      const due = bill.balanceDue;
      if (due <= 0) continue;
      const daysOverdue = Math.floor(
        (new Date(asOfDate).getTime() - new Date(bill.dueDate).getTime()) / 86400000,
      );
      let bucket: keyof ReturnType<typeof buckets>;
      if (daysOverdue <= 0) bucket = 'current';
      else if (daysOverdue <= 30) bucket = 'b1_30';
      else if (daysOverdue <= 60) bucket = 'b31_60';
      else if (daysOverdue <= 90) bucket = 'b61_90';
      else bucket = 'b90plus';

      if (!byVendor[bill.vendorId]) {
        byVendor[bill.vendorId] = {
          vendorId: bill.vendorId,
          vendorName: vendorMap.get(bill.vendorId)?.name || 'Unknown',
          ...buckets(),
        };
      }
      byVendor[bill.vendorId][bucket] = round2(byVendor[bill.vendorId][bucket] + due);
      byVendor[bill.vendorId].total = round2(byVendor[bill.vendorId].total + due);
      totals[bucket] = round2(totals[bucket] + due);
      totals.total = round2(totals.total + due);
    }

    return { asOf: asOfDate, rows: Object.values(byVendor), totals };
  }
}
