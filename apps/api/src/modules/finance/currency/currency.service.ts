import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Currency } from './entities/currency.entity';
import { ExchangeRate } from './entities/exchange-rate.entity';
import { Bill, BillStatus } from '../ap/entities/bill.entity';
import { Invoice, InvoiceStatus } from '../ar/entities/invoice.entity';
import { GlService } from '../gl/gl.service';
import { JournalSource } from '../gl/entities/journal-entry.entity';
import { DEFAULT_ACCOUNT_CODES } from '../finance.constants';
import {
  CreateCurrencyDto,
  UpdateCurrencyDto,
  CreateExchangeRateDto,
} from './dto/currency.dto';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Seeded when a tenant has no currencies yet, so the dropdown is usable. */
const DEFAULT_CURRENCIES = [
  { code: 'USD', name: 'US Dollar',        symbol: '$',    decimalPlaces: 2, isBase: true  },
  { code: 'EUR', name: 'Euro',             symbol: '€',    decimalPlaces: 2, isBase: false },
  { code: 'GBP', name: 'British Pound',    symbol: '£',    decimalPlaces: 2, isBase: false },
  { code: 'INR', name: 'Indian Rupee',     symbol: '₹',    decimalPlaces: 2, isBase: false },
  { code: 'JPY', name: 'Japanese Yen',     symbol: '¥',    decimalPlaces: 0, isBase: false },
  { code: 'AUD', name: 'Australian Dollar',symbol: 'A$',   decimalPlaces: 2, isBase: false },
  { code: 'CAD', name: 'Canadian Dollar',  symbol: 'C$',   decimalPlaces: 2, isBase: false },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$',   decimalPlaces: 2, isBase: false },
  { code: 'AED', name: 'UAE Dirham',       symbol: 'د.إ',  decimalPlaces: 2, isBase: false },
  { code: 'CNY', name: 'Chinese Yuan',     symbol: '¥',    decimalPlaces: 2, isBase: false },
];

export interface ConvertResult {
  baseCurrency: string;
  rate: number;
  baseAmount: number;
}

@Injectable()
export class CurrencyService {
  constructor(
    @InjectRepository(Currency)
    private readonly currencyRepo: Repository<Currency>,
    @InjectRepository(ExchangeRate)
    private readonly rateRepo: Repository<ExchangeRate>,
    @InjectRepository(Bill)
    private readonly billRepo: Repository<Bill>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    private readonly glService: GlService,
  ) {}

  // ─── Currencies ──────────────────────────────────────────────

  async listCurrencies(tenantId: string, includeInactive = false): Promise<Currency[]> {
    let currencies = await this.currencyRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
    if (currencies.length === 0) currencies = await this.seedDefaults(tenantId);
    return includeInactive ? currencies : currencies.filter((c) => c.isActive);
  }

  private async seedDefaults(tenantId: string): Promise<Currency[]> {
    return this.currencyRepo.save(
      DEFAULT_CURRENCIES.map((c) => this.currencyRepo.create({ ...c, tenantId, isActive: true })),
    );
  }

  async createCurrency(tenantId: string, dto: CreateCurrencyDto): Promise<Currency> {
    const code = dto.code.trim().toUpperCase();
    if (await this.currencyRepo.findOne({ where: { tenantId, code } })) {
      throw new ConflictException(`Currency ${code} already exists`);
    }
    if (dto.isBase) await this.currencyRepo.update({ tenantId, isBase: true }, { isBase: false });
    return this.currencyRepo.save(
      this.currencyRepo.create({ tenantId, code, name: dto.name, symbol: dto.symbol ?? null,
        decimalPlaces: dto.decimalPlaces ?? 2, isBase: dto.isBase ?? false, isActive: dto.isActive ?? true }),
    );
  }

  async updateCurrency(tenantId: string, id: string, dto: UpdateCurrencyDto): Promise<Currency> {
    const currency = await this.currencyRepo.findOne({ where: { tenantId, id } });
    if (!currency) throw new NotFoundException(`Currency ${id} not found`);
    if (dto.isBase) await this.currencyRepo.update({ tenantId, isBase: true }, { isBase: false });
    Object.assign(currency, {
      ...(dto.code && { code: dto.code.trim().toUpperCase() }),
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.symbol !== undefined && { symbol: dto.symbol ?? null }),
      ...(dto.decimalPlaces !== undefined && { decimalPlaces: dto.decimalPlaces }),
      ...(dto.isBase !== undefined && { isBase: dto.isBase }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    });
    return this.currencyRepo.save(currency);
  }

  // ─── Exchange Rates ──────────────────────────────────────────

  async listRates(tenantId: string, filters?: { year?: number; month?: number }): Promise<ExchangeRate[]> {
    const where: any = { tenantId };
    if (filters?.year) where.year = filters.year;
    if (filters?.month) where.month = filters.month;
    return this.rateRepo.find({ where, order: { year: 'DESC', month: 'DESC', fromCurrency: 'ASC', toCurrency: 'ASC' } });
  }

  async upsertRate(tenantId: string, dto: CreateExchangeRateDto): Promise<ExchangeRate> {
    const fromCurrency = dto.fromCurrency.trim().toUpperCase();
    const toCurrency = dto.toCurrency.trim().toUpperCase();
    if (fromCurrency === toCurrency) throw new BadRequestException('From and To currencies must differ');

    let rate = await this.rateRepo.findOne({ where: { tenantId, fromCurrency, toCurrency, year: dto.year, month: dto.month } });
    if (rate) {
      rate.rate = dto.rate;
      rate.notes = dto.notes ?? null;
    } else {
      rate = this.rateRepo.create({ tenantId, fromCurrency, toCurrency, year: dto.year, month: dto.month, rate: dto.rate, notes: dto.notes ?? null });
    }
    return this.rateRepo.save(rate);
  }

  async deleteRate(tenantId: string, id: string): Promise<{ deleted: boolean }> {
    const rate = await this.rateRepo.findOne({ where: { tenantId, id } });
    if (!rate) throw new NotFoundException(`Exchange rate ${id} not found`);
    await this.rateRepo.remove(rate);
    return { deleted: true };
  }

  // ─── Conversion helper (used by AP/AR at posting time) ───────

  async getBaseCurrencyCode(tenantId: string): Promise<string> {
    const base = await this.currencyRepo.findOne({ where: { tenantId, isBase: true } });
    return base?.code ?? 'USD';
  }

  /**
   * Convert an amount from `fromCode` to the tenant's base currency using the
   * monthly rate for the given year/month. Returns null if no rate is defined
   * (the caller should still record the transaction but without FX conversion).
   */
  async convert(
    tenantId: string,
    amount: number,
    fromCode: string,
    year: number,
    month: number,
  ): Promise<ConvertResult | null> {
    const baseCode = await this.getBaseCurrencyCode(tenantId);
    if (fromCode === baseCode) {
      return { baseCurrency: baseCode, rate: 1, baseAmount: round2(amount) };
    }
    const rateRow = await this.rateRepo.findOne({
      where: { tenantId, fromCurrency: fromCode, toCurrency: baseCode, year, month },
    });
    if (!rateRow) return null;
    return {
      baseCurrency: baseCode,
      rate: rateRow.rate,
      baseAmount: round2(amount * rateRow.rate),
    };
  }

  // ─── FX Revaluation ──────────────────────────────────────────

  /**
   * Mark-to-market all open AP bills and AR invoices in foreign currencies
   * for the given year/month. Posts FX gain/loss journal entries and updates
   * totalBase on each document to the revalued amount.
   */
  async runRevaluation(
    tenantId: string,
    year: number,
    month: number,
    userId: string,
  ): Promise<{ billsRevalued: number; invoicesRevalued: number; jeIds: string[] }> {
    const baseCode = await this.getBaseCurrencyCode(tenantId);
    const jeIds: string[] = [];
    let billsRevalued = 0;
    let invoicesRevalued = 0;

    // Resolve FX gain/loss accounts (best-effort — skip GL posting if missing)
    let fxGainAccountId: string | null = null;
    let fxLossAccountId: string | null = null;
    let apControlId: string | null = null;
    let arControlId: string | null = null;
    try {
      const [fxGain, fxLoss, apCtrl, arCtrl] = await Promise.all([
        this.glService.findAccounts(tenantId, { page: 1, limit: 1 } as any, { search: DEFAULT_ACCOUNT_CODES.FX_GAIN }),
        this.glService.findAccounts(tenantId, { page: 1, limit: 1 } as any, { search: DEFAULT_ACCOUNT_CODES.FX_LOSS }),
        this.glService.findAccounts(tenantId, { page: 1, limit: 1 } as any, { search: DEFAULT_ACCOUNT_CODES.AP_CONTROL }),
        this.glService.findAccounts(tenantId, { page: 1, limit: 1 } as any, { search: DEFAULT_ACCOUNT_CODES.AR_CONTROL }),
      ]);
      fxGainAccountId = fxGain.items[0]?.id ?? null;
      fxLossAccountId = fxLoss.items[0]?.id ?? null;
      apControlId = apCtrl.items[0]?.id ?? null;
      arControlId = arCtrl.items[0]?.id ?? null;
    } catch (_) { /* GL accounts optional */ }

    // ── Revalue open AP bills ────────────────────────────────────
    const openBills = await this.billRepo
      .createQueryBuilder('b')
      .where('b.tenantId = :tenantId', { tenantId })
      .andWhere('b.status IN (:...statuses)', { statuses: [BillStatus.OPEN, BillStatus.PARTIAL] })
      .andWhere('b.currency != :base', { base: baseCode })
      .getMany();

    for (const bill of openBills) {
      const rateRow = await this.rateRepo.findOne({
        where: { tenantId, fromCurrency: bill.currency, toCurrency: baseCode, year, month },
      });
      if (!rateRow) continue;

      const newTotalBase = round2(bill.total * rateRow.rate);
      const oldTotalBase = bill.totalBase ?? newTotalBase;
      const balanceProportion = bill.total > 0 ? bill.balanceDue / bill.total : 0;
      const fxDiff = round2((newTotalBase - oldTotalBase) * balanceProportion);

      if (fxDiff !== 0 && apControlId && (fxGainAccountId || fxLossAccountId)) {
        // AP: positive diff = FX loss (payable grew), negative diff = FX gain
        const isLoss = fxDiff > 0;
        const absAmount = Math.abs(fxDiff);
        const lossAccountId = fxLossAccountId ?? apControlId;
        const gainAccountId = fxGainAccountId ?? apControlId;
        try {
          const je = await this.glService.postJournalEntry(
            tenantId,
            {
              date: `${year}-${String(month).padStart(2, '0')}-01`,
              description: `FX revaluation – AP ${bill.billNumber} (${bill.currency}/${baseCode})`,
              source: JournalSource.SYSTEM,
              currency: baseCode,
              lines: isLoss
                ? [
                    { accountId: lossAccountId, debit: absAmount, credit: 0, description: 'FX loss – AP' },
                    { accountId: apControlId,   debit: 0, credit: absAmount, description: `AP reval ${bill.billNumber}` },
                  ]
                : [
                    { accountId: apControlId,   debit: absAmount, credit: 0, description: `AP reval ${bill.billNumber}` },
                    { accountId: gainAccountId, debit: 0, credit: absAmount, description: 'FX gain – AP' },
                  ],
            },
            userId,
          );
          jeIds.push(je.id);
        } catch (_) { /* non-blocking */ }
      }

      bill.totalBase = newTotalBase;
      bill.exchangeRate = rateRow.rate;
      bill.baseCurrency = baseCode;
      await this.billRepo.save(bill);
      billsRevalued++;
    }

    // ── Revalue open AR invoices ─────────────────────────────────
    const openInvoices = await this.invoiceRepo
      .createQueryBuilder('i')
      .where('i.tenantId = :tenantId', { tenantId })
      .andWhere('i.status IN (:...statuses)', { statuses: [InvoiceStatus.SENT, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE] })
      .andWhere('i.currency != :base', { base: baseCode })
      .getMany();

    for (const inv of openInvoices) {
      const rateRow = await this.rateRepo.findOne({
        where: { tenantId, fromCurrency: inv.currency, toCurrency: baseCode, year, month },
      });
      if (!rateRow) continue;

      const newTotalBase = round2(inv.total * rateRow.rate);
      const oldTotalBase = inv.totalBase ?? newTotalBase;
      const balanceProportion = inv.total > 0 ? inv.balanceDue / inv.total : 0;
      const fxDiff = round2((newTotalBase - oldTotalBase) * balanceProportion);

      if (fxDiff !== 0 && arControlId && (fxGainAccountId || fxLossAccountId)) {
        // AR: positive diff = FX gain (receivable grew), negative diff = FX loss
        const isGain = fxDiff > 0;
        const absAmount = Math.abs(fxDiff);
        const lossAccountId = fxLossAccountId ?? arControlId;
        const gainAccountId = fxGainAccountId ?? arControlId;
        try {
          const je = await this.glService.postJournalEntry(
            tenantId,
            {
              date: `${year}-${String(month).padStart(2, '0')}-01`,
              description: `FX revaluation – AR ${inv.invoiceNumber} (${inv.currency}/${baseCode})`,
              source: JournalSource.SYSTEM,
              currency: baseCode,
              lines: isGain
                ? [
                    { accountId: arControlId,   debit: absAmount, credit: 0, description: `AR reval ${inv.invoiceNumber}` },
                    { accountId: gainAccountId, debit: 0, credit: absAmount, description: 'FX gain – AR' },
                  ]
                : [
                    { accountId: lossAccountId, debit: absAmount, credit: 0, description: 'FX loss – AR' },
                    { accountId: arControlId,   debit: 0, credit: absAmount, description: `AR reval ${inv.invoiceNumber}` },
                  ],
            },
            userId,
          );
          jeIds.push(je.id);
        } catch (_) { /* non-blocking */ }
      }

      inv.totalBase = newTotalBase;
      inv.exchangeRate = rateRow.rate;
      inv.baseCurrency = baseCode;
      await this.invoiceRepo.save(inv);
      invoicesRevalued++;
    }

    return { billsRevalued, invoicesRevalued, jeIds };
  }
}
