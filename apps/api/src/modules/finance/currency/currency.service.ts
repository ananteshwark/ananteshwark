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
import {
  CreateCurrencyDto,
  UpdateCurrencyDto,
  CreateExchangeRateDto,
} from './dto/currency.dto';

/** Seeded when a tenant has no currencies yet, so the dropdown is usable. */
const DEFAULT_CURRENCIES: Array<{
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  isBase: boolean;
}> = [
  { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2, isBase: true },
  { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2, isBase: false },
  { code: 'GBP', name: 'British Pound', symbol: '£', decimalPlaces: 2, isBase: false },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimalPlaces: 2, isBase: false },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimalPlaces: 0, isBase: false },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimalPlaces: 2, isBase: false },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimalPlaces: 2, isBase: false },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimalPlaces: 2, isBase: false },
  { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', decimalPlaces: 2, isBase: false },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimalPlaces: 2, isBase: false },
];

@Injectable()
export class CurrencyService {
  constructor(
    @InjectRepository(Currency)
    private readonly currencyRepo: Repository<Currency>,
    @InjectRepository(ExchangeRate)
    private readonly rateRepo: Repository<ExchangeRate>,
  ) {}

  // ─── Currencies ──────────────────────────────────────────────

  async listCurrencies(tenantId: string, includeInactive = false): Promise<Currency[]> {
    let currencies = await this.currencyRepo.find({
      where: { tenantId },
      order: { code: 'ASC' },
    });
    if (currencies.length === 0) {
      currencies = await this.seedDefaults(tenantId);
    }
    if (!includeInactive) {
      currencies = currencies.filter((c) => c.isActive);
    }
    return currencies;
  }

  private async seedDefaults(tenantId: string): Promise<Currency[]> {
    const entities = DEFAULT_CURRENCIES.map((c) =>
      this.currencyRepo.create({ ...c, tenantId, isActive: true }),
    );
    return this.currencyRepo.save(entities);
  }

  async createCurrency(tenantId: string, dto: CreateCurrencyDto): Promise<Currency> {
    const code = dto.code.trim().toUpperCase();
    const existing = await this.currencyRepo.findOne({ where: { tenantId, code } });
    if (existing) throw new ConflictException(`Currency ${code} already exists`);

    if (dto.isBase) {
      await this.currencyRepo.update({ tenantId, isBase: true }, { isBase: false });
    }

    return this.currencyRepo.save(
      this.currencyRepo.create({
        tenantId,
        code,
        name: dto.name,
        symbol: dto.symbol ?? null,
        decimalPlaces: dto.decimalPlaces ?? 2,
        isBase: dto.isBase ?? false,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async updateCurrency(tenantId: string, id: string, dto: UpdateCurrencyDto): Promise<Currency> {
    const currency = await this.currencyRepo.findOne({ where: { tenantId, id } });
    if (!currency) throw new NotFoundException(`Currency ${id} not found`);

    if (dto.isBase) {
      await this.currencyRepo.update({ tenantId, isBase: true }, { isBase: false });
    }
    if (dto.code) currency.code = dto.code.trim().toUpperCase();
    if (dto.name !== undefined) currency.name = dto.name;
    if (dto.symbol !== undefined) currency.symbol = dto.symbol ?? null;
    if (dto.decimalPlaces !== undefined) currency.decimalPlaces = dto.decimalPlaces;
    if (dto.isBase !== undefined) currency.isBase = dto.isBase;
    if (dto.isActive !== undefined) currency.isActive = dto.isActive;

    return this.currencyRepo.save(currency);
  }

  // ─── Exchange Rates ──────────────────────────────────────────

  async listRates(
    tenantId: string,
    filters?: { year?: number; month?: number },
  ): Promise<ExchangeRate[]> {
    const where: any = { tenantId };
    if (filters?.year) where.year = filters.year;
    if (filters?.month) where.month = filters.month;
    return this.rateRepo.find({
      where,
      order: { year: 'DESC', month: 'DESC', fromCurrency: 'ASC', toCurrency: 'ASC' },
    });
  }

  async upsertRate(tenantId: string, dto: CreateExchangeRateDto): Promise<ExchangeRate> {
    const fromCurrency = dto.fromCurrency.trim().toUpperCase();
    const toCurrency = dto.toCurrency.trim().toUpperCase();
    if (fromCurrency === toCurrency) {
      throw new BadRequestException('From and To currencies must differ');
    }

    let rate = await this.rateRepo.findOne({
      where: { tenantId, fromCurrency, toCurrency, year: dto.year, month: dto.month },
    });
    if (rate) {
      rate.rate = dto.rate;
      rate.notes = dto.notes ?? null;
    } else {
      rate = this.rateRepo.create({
        tenantId,
        fromCurrency,
        toCurrency,
        year: dto.year,
        month: dto.month,
        rate: dto.rate,
        notes: dto.notes ?? null,
      });
    }
    return this.rateRepo.save(rate);
  }

  async deleteRate(tenantId: string, id: string): Promise<{ deleted: boolean }> {
    const rate = await this.rateRepo.findOne({ where: { tenantId, id } });
    if (!rate) throw new NotFoundException(`Exchange rate ${id} not found`);
    await this.rateRepo.remove(rate);
    return { deleted: true };
  }
}
