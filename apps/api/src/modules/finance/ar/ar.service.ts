import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Customer } from './entities/customer.entity';
import { Invoice, InvoiceStatus } from './entities/invoice.entity';
import { InvoiceLine } from './entities/invoice-line.entity';
import { CustomerReceipt } from './entities/customer-receipt.entity';
import { ReceiptAllocation } from './entities/receipt-allocation.entity';
import { Account } from '../gl/entities/account.entity';
import { BankAccount } from '../bank/entities/bank-account.entity';
import { GlService } from '../gl/gl.service';
import { JournalSource } from '../gl/entities/journal-entry.entity';
import { DEFAULT_ACCOUNT_CODES } from '../finance.constants';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CreateInvoiceDto,
  UpdateInvoiceDto,
  CreateCustomerReceiptDto,
  AllocateReceiptDto,
  InvoiceLineDto,
  ReceiptAllocationDto,
} from './dto/ar.dto';
import { PaginationDto, PaginatedResponseDto } from '../../../common/dto/pagination.dto';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

@Injectable()
export class ArService {
  constructor(
    @InjectRepository(Customer) private readonly customerRepo: Repository<Customer>,
    @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(InvoiceLine) private readonly invoiceLineRepo: Repository<InvoiceLine>,
    @InjectRepository(CustomerReceipt)
    private readonly receiptRepo: Repository<CustomerReceipt>,
    @InjectRepository(ReceiptAllocation)
    private readonly allocationRepo: Repository<ReceiptAllocation>,
    @InjectRepository(Account) private readonly accountRepo: Repository<Account>,
    @InjectRepository(BankAccount) private readonly bankAccountRepo: Repository<BankAccount>,
    private readonly glService: GlService,
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

  private addDays(date: string, days: number): string {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // -------------------- Customers --------------------

  async createCustomer(tenantId: string, dto: CreateCustomerDto): Promise<Customer> {
    const existing = await this.customerRepo.findOne({ where: { tenantId, code: dto.code } });
    if (existing) throw new ConflictException(`Customer code ${dto.code} already exists`);
    if (dto.arAccountId) await this.glService.findAccount(tenantId, dto.arAccountId);
    const customer = this.customerRepo.create({ ...dto, tenantId });
    return this.customerRepo.save(customer);
  }

  async findCustomers(
    tenantId: string,
    pagination: PaginationDto,
    search?: string,
  ): Promise<PaginatedResponseDto<Customer>> {
    const { page = 1, limit = 20, sortBy = 'name', sortOrder = 'ASC' } = pagination;
    const qb = this.customerRepo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId });
    if (search) {
      qb.andWhere('(c.name ILIKE :s OR c.code ILIKE :s OR c.email ILIKE :s)', {
        s: `%${search}%`,
      });
    }
    const validSort = ['name', 'code', 'createdAt'];
    qb.orderBy(`c.${validSort.includes(sortBy) ? sortBy : 'name'}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findCustomer(tenantId: string, id: string): Promise<Customer> {
    const customer = await this.customerRepo.findOne({ where: { id, tenantId } });
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    return customer;
  }

  async updateCustomer(
    tenantId: string,
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<Customer> {
    const customer = await this.findCustomer(tenantId, id);
    if (dto.arAccountId) await this.glService.findAccount(tenantId, dto.arAccountId);
    Object.assign(customer, dto);
    return this.customerRepo.save(customer);
  }

  // -------------------- Invoices --------------------

  private computeInvoiceLines(lines: InvoiceLineDto[]): {
    computed: Array<InvoiceLineDto & { taxAmount: number; lineTotal: number; quantity: number }>;
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

  async createInvoice(tenantId: string, dto: CreateInvoiceDto): Promise<Invoice> {
    const customer = await this.findCustomer(tenantId, dto.customerId);
    for (const l of dto.lines) await this.glService.findAccount(tenantId, l.accountId);

    const { computed, subtotal, taxAmount, total } = this.computeInvoiceLines(dto.lines);
    const dueDate = dto.dueDate || this.addDays(dto.invoiceDate, customer.paymentTerms || 30);

    return this.dataSource.transaction(async (manager) => {
      const invoice = manager.create(Invoice, {
        tenantId,
        invoiceNumber: dto.invoiceNumber,
        customerId: dto.customerId,
        invoiceDate: dto.invoiceDate,
        dueDate,
        status: InvoiceStatus.DRAFT,
        subtotal,
        taxAmount,
        total,
        amountPaid: 0,
        balanceDue: total,
        currency: dto.currency || customer.currency || 'USD',
        reference: dto.reference,
        notes: dto.notes,
      });
      const saved = await manager.save(invoice);
      await this.persistInvoiceLines(manager, tenantId, saved.id, computed);
      return this.findInvoice(tenantId, saved.id, manager);
    });
  }

  private async persistInvoiceLines(
    manager: any,
    tenantId: string,
    invoiceId: string,
    lines: Array<InvoiceLineDto & { taxAmount: number; lineTotal: number; quantity: number }>,
  ): Promise<void> {
    const entities = lines.map((l, idx) =>
      manager.create(InvoiceLine, {
        tenantId,
        invoiceId,
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

  async findInvoices(
    tenantId: string,
    pagination: PaginationDto,
    filters: { status?: InvoiceStatus; customerId?: string },
  ): Promise<PaginatedResponseDto<Invoice>> {
    const { page = 1, limit = 20, sortBy = 'invoiceDate', sortOrder = 'DESC' } = pagination;
    const qb = this.invoiceRepo
      .createQueryBuilder('i')
      .where('i.tenantId = :tenantId', { tenantId });
    if (filters.status) qb.andWhere('i.status = :status', { status: filters.status });
    if (filters.customerId)
      qb.andWhere('i.customerId = :customerId', { customerId: filters.customerId });
    const validSort = ['invoiceDate', 'dueDate', 'total', 'createdAt'];
    qb.orderBy(`i.${validSort.includes(sortBy) ? sortBy : 'invoiceDate'}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);
    const [items, total] = await qb.getManyAndCount();
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findInvoice(
    tenantId: string,
    id: string,
    manager = this.invoiceRepo.manager,
  ): Promise<Invoice & { lines: InvoiceLine[] }> {
    const invoice = await manager.findOne(Invoice, { where: { id, tenantId } });
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    const lines = await manager.find(InvoiceLine, {
      where: { invoiceId: id, tenantId },
      order: { lineNumber: 'ASC' },
    });
    return { ...invoice, lines } as Invoice & { lines: InvoiceLine[] };
  }

  async updateInvoice(tenantId: string, id: string, dto: UpdateInvoiceDto): Promise<Invoice> {
    const invoice = await this.invoiceRepo.findOne({ where: { id, tenantId } });
    if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT invoices can be edited');
    }
    return this.dataSource.transaction(async (manager) => {
      if (dto.lines) {
        for (const l of dto.lines) await this.glService.findAccount(tenantId, l.accountId);
        const { computed, subtotal, taxAmount, total } = this.computeInvoiceLines(dto.lines);
        invoice.subtotal = subtotal;
        invoice.taxAmount = taxAmount;
        invoice.total = total;
        invoice.balanceDue = round2(total - invoice.amountPaid);
        await manager.delete(InvoiceLine, { invoiceId: id, tenantId });
        await this.persistInvoiceLines(manager, tenantId, id, computed);
      }
      if (dto.invoiceDate !== undefined) invoice.invoiceDate = dto.invoiceDate;
      if (dto.dueDate !== undefined) invoice.dueDate = dto.dueDate;
      if (dto.reference !== undefined) invoice.reference = dto.reference;
      if (dto.notes !== undefined) invoice.notes = dto.notes;
      await manager.save(invoice);
      return this.findInvoice(tenantId, id, manager);
    });
  }

  /** Post an invoice: Dr AR control, Cr income lines + Cr tax payable. */
  async postInvoice(tenantId: string, id: string, userId: string): Promise<Invoice> {
    return this.dataSource.transaction(async (manager) => {
      const invoice = await manager.findOne(Invoice, { where: { id, tenantId } });
      if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw new BadRequestException(
          `Invoice is already ${invoice.status}; only DRAFT invoices can be posted`,
        );
      }
      const lines = await manager.find(InvoiceLine, { where: { invoiceId: id, tenantId } });
      if (lines.length === 0) throw new BadRequestException('Invoice has no lines');

      const customer = await manager.findOne(Customer, {
        where: { id: invoice.customerId, tenantId },
      });
      const arAccount = customer?.arAccountId
        ? await this.glService.findAccount(tenantId, customer.arAccountId)
        : await this.resolveAccountByCode(tenantId, DEFAULT_ACCOUNT_CODES.AR_CONTROL);

      const jeLines: any[] = [
        {
          accountId: arAccount.id,
          description: `AR - ${customer?.name || 'Customer'} - ${invoice.invoiceNumber}`,
          debit: invoice.total,
          credit: 0,
        },
      ];
      for (const l of lines) {
        jeLines.push({
          accountId: l.accountId,
          description: l.description,
          debit: 0,
          credit: round2(l.quantity * l.unitPrice),
        });
      }
      if (invoice.taxAmount > 0) {
        const taxAccount = await this.resolveAccountByCode(
          tenantId,
          DEFAULT_ACCOUNT_CODES.TAX_PAYABLE,
        );
        jeLines.push({
          accountId: taxAccount.id,
          description: 'Output tax',
          debit: 0,
          credit: invoice.taxAmount,
        });
      }

      const je = await this.glService.postJournalEntry(
        tenantId,
        {
          date: invoice.invoiceDate,
          description: `Customer invoice ${invoice.invoiceNumber}`,
          reference: invoice.reference || invoice.invoiceNumber,
          source: JournalSource.AR,
          currency: invoice.currency,
          lines: jeLines,
        },
        userId,
        manager,
      );

      invoice.journalEntryId = je.id;
      invoice.status = InvoiceStatus.SENT;
      await manager.save(invoice);

      if (customer) {
        customer.balance = round2(customer.balance + invoice.total);
        await manager.save(customer);
      }
      return this.findInvoice(tenantId, id, manager);
    });
  }

  async voidInvoice(tenantId: string, id: string, userId: string): Promise<Invoice> {
    return this.dataSource.transaction(async (manager) => {
      const invoice = await manager.findOne(Invoice, { where: { id, tenantId } });
      if (!invoice) throw new NotFoundException(`Invoice ${id} not found`);
      if (invoice.amountPaid > 0) {
        throw new BadRequestException('Cannot void an invoice that has receipts applied');
      }
      if (invoice.journalEntryId) {
        await this.glService.reverseJournalEntry(tenantId, invoice.journalEntryId, userId);
      }
      const customer = await manager.findOne(Customer, {
        where: { id: invoice.customerId, tenantId },
      });
      if (customer && invoice.status !== InvoiceStatus.DRAFT) {
        customer.balance = round2(customer.balance - invoice.balanceDue);
        await manager.save(customer);
      }
      invoice.status = InvoiceStatus.VOID;
      invoice.balanceDue = 0;
      await manager.save(invoice);
      return this.findInvoice(tenantId, id, manager);
    });
  }

  // -------------------- Customer Receipts --------------------

  async createCustomerReceipt(
    tenantId: string,
    dto: CreateCustomerReceiptDto,
    userId: string,
  ): Promise<CustomerReceipt> {
    const customer = await this.findCustomer(tenantId, dto.customerId);
    if (dto.amount <= 0) throw new BadRequestException('Receipt amount must be positive');

    return this.dataSource.transaction(async (manager) => {
      let debitAccountId = dto.debitAccountId;
      if (dto.bankAccountId) {
        const bankAccount = await manager.findOne(BankAccount, {
          where: { id: dto.bankAccountId, tenantId },
        });
        if (!bankAccount) throw new BadRequestException('Bank account not found');
        debitAccountId = bankAccount.glAccountId;
      }
      if (!debitAccountId) {
        const bank = await this.resolveAccountByCode(tenantId, DEFAULT_ACCOUNT_CODES.BANK);
        debitAccountId = bank.id;
      } else {
        await this.glService.findAccount(tenantId, debitAccountId);
      }

      const arAccount = customer.arAccountId
        ? await this.glService.findAccount(tenantId, customer.arAccountId)
        : await this.resolveAccountByCode(tenantId, DEFAULT_ACCOUNT_CODES.AR_CONTROL);

      // JE: Dr Bank/Cash, Cr AR control
      const je = await this.glService.postJournalEntry(
        tenantId,
        {
          date: dto.receiptDate,
          description: `Receipt from ${customer.name}`,
          reference: dto.reference,
          source: JournalSource.AR,
          currency: dto.currency || customer.currency || 'USD',
          lines: [
            { accountId: debitAccountId, debit: round2(dto.amount), credit: 0 },
            { accountId: arAccount.id, debit: 0, credit: round2(dto.amount) },
          ],
        },
        userId,
        manager,
      );

      const receiptNumber = await this.nextNumber(
        tenantId,
        this.receiptRepo,
        'receiptNumber',
        'RCPT',
      );
      const receipt = manager.create(CustomerReceipt, {
        tenantId,
        receiptNumber,
        customerId: dto.customerId,
        receiptDate: dto.receiptDate,
        amount: round2(dto.amount),
        method: dto.method,
        reference: dto.reference,
        bankAccountId: dto.bankAccountId || null,
        currency: dto.currency || customer.currency || 'USD',
        journalEntryId: je.id,
        unappliedAmount: round2(dto.amount),
      });
      const saved = await manager.save(receipt);

      customer.balance = round2(customer.balance - dto.amount);
      await manager.save(customer);

      if (dto.allocations?.length) {
        await this.applyAllocations(manager, tenantId, saved, dto.allocations);
      }
      return manager.findOne(CustomerReceipt, { where: { id: saved.id, tenantId } });
    });
  }

  private async applyAllocations(
    manager: any,
    tenantId: string,
    receipt: CustomerReceipt,
    allocations: ReceiptAllocationDto[],
  ): Promise<void> {
    let remaining = receipt.unappliedAmount;
    for (const alloc of allocations) {
      if (alloc.amount <= 0) continue;
      const invoice = await manager.findOne(Invoice, {
        where: { id: alloc.invoiceId, tenantId },
      });
      if (!invoice) throw new NotFoundException(`Invoice ${alloc.invoiceId} not found`);
      if (invoice.status === InvoiceStatus.DRAFT || invoice.status === InvoiceStatus.VOID) {
        throw new BadRequestException(
          `Invoice ${invoice.invoiceNumber} cannot receive payment in status ${invoice.status}`,
        );
      }
      const applyAmount = round2(Math.min(alloc.amount, invoice.balanceDue, remaining));
      if (applyAmount <= 0) continue;

      await manager.save(
        manager.create(ReceiptAllocation, {
          tenantId,
          customerReceiptId: receipt.id,
          invoiceId: invoice.id,
          amount: applyAmount,
        }),
      );

      invoice.amountPaid = round2(invoice.amountPaid + applyAmount);
      invoice.balanceDue = round2(invoice.total - invoice.amountPaid);
      invoice.status =
        invoice.balanceDue <= 0
          ? InvoiceStatus.PAID
          : invoice.amountPaid > 0
            ? InvoiceStatus.PARTIAL
            : invoice.status;
      await manager.save(invoice);

      remaining = round2(remaining - applyAmount);
      if (remaining <= 0) break;
    }
    receipt.unappliedAmount = round2(remaining);
    await manager.save(receipt);
  }

  async allocateReceipt(
    tenantId: string,
    receiptId: string,
    dto: AllocateReceiptDto,
  ): Promise<CustomerReceipt> {
    return this.dataSource.transaction(async (manager) => {
      const receipt = await manager.findOne(CustomerReceipt, {
        where: { id: receiptId, tenantId },
      });
      if (!receipt) throw new NotFoundException(`Receipt ${receiptId} not found`);
      if (receipt.unappliedAmount <= 0) {
        throw new BadRequestException('Receipt is already fully allocated');
      }
      await this.applyAllocations(manager, tenantId, receipt, dto.allocations);
      return manager.findOne(CustomerReceipt, { where: { id: receiptId, tenantId } });
    });
  }

  async findReceipts(
    tenantId: string,
    pagination: PaginationDto,
    customerId?: string,
  ): Promise<PaginatedResponseDto<CustomerReceipt>> {
    const { page = 1, limit = 20 } = pagination;
    const where: any = { tenantId };
    if (customerId) where.customerId = customerId;
    const [items, total] = await this.receiptRepo.findAndCount({
      where,
      order: { receiptDate: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findReceipt(tenantId: string, id: string): Promise<any> {
    const receipt = await this.receiptRepo.findOne({ where: { id, tenantId } });
    if (!receipt) throw new NotFoundException(`Receipt ${id} not found`);
    const allocations = await this.allocationRepo.find({
      where: { customerReceiptId: id, tenantId },
    });
    return { ...receipt, allocations };
  }

  // -------------------- AR Ageing --------------------

  async getAgeing(tenantId: string, asOf?: string): Promise<any> {
    const asOfDate = asOf || new Date().toISOString().slice(0, 10);
    const invoices = await this.invoiceRepo
      .createQueryBuilder('i')
      .where('i.tenantId = :tenantId', { tenantId })
      .andWhere('i.status IN (:...statuses)', {
        statuses: [InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE],
      })
      .getMany();

    const customers = await this.customerRepo.find({ where: { tenantId } });
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    const buckets = () => ({ current: 0, b1_30: 0, b31_60: 0, b61_90: 0, b90plus: 0, total: 0 });
    const byCustomer: Record<string, any> = {};
    const totals = buckets();

    for (const invoice of invoices) {
      const due = invoice.balanceDue;
      if (due <= 0) continue;
      const daysOverdue = Math.floor(
        (new Date(asOfDate).getTime() - new Date(invoice.dueDate).getTime()) / 86400000,
      );
      let bucket: keyof ReturnType<typeof buckets>;
      if (daysOverdue <= 0) bucket = 'current';
      else if (daysOverdue <= 30) bucket = 'b1_30';
      else if (daysOverdue <= 60) bucket = 'b31_60';
      else if (daysOverdue <= 90) bucket = 'b61_90';
      else bucket = 'b90plus';

      if (!byCustomer[invoice.customerId]) {
        byCustomer[invoice.customerId] = {
          customerId: invoice.customerId,
          customerName: customerMap.get(invoice.customerId)?.name || 'Unknown',
          ...buckets(),
        };
      }
      byCustomer[invoice.customerId][bucket] = round2(byCustomer[invoice.customerId][bucket] + due);
      byCustomer[invoice.customerId].total = round2(byCustomer[invoice.customerId].total + due);
      totals[bucket] = round2(totals[bucket] + due);
      totals.total = round2(totals.total + due);
    }

    return { asOf: asOfDate, rows: Object.values(byCustomer), totals };
  }
}
