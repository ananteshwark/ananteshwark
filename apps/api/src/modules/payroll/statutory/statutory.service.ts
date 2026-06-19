import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StatutoryConfig } from './entities/statutory-config.entity';
import { TaxSlab, TaxRegime } from './entities/tax-slab.entity';
import { Form16 } from './entities/form16.entity';
import {
  ComplianceCalendarItem,
  ComplianceType,
  ComplianceFrequency,
  ComplianceStatus,
} from './entities/compliance-calendar-item.entity';
import { StatutoryType } from '../components/entities/pay-component.entity';
import {
  UpsertStatutoryConfigDto,
  CreateComplianceItemDto,
} from './dto/statutory.dto';
import { LocalizationRegistry } from '../../localization/localization.registry';
import {
  LocalizationPack,
  TaxCalculationInput,
  TaxCalculationResult,
} from '../../localization/localization.types';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface PfResult {
  employee: number;
  employer: number;
}
export interface EsiResult {
  employee: number;
  employer: number;
}

// India statutory defaults (FY 2025-26)
export const INDIA_DEFAULTS = {
  PF: { rate: 0.12, wageCeiling: 15000 }, // 12% of basic, capped at 15,000 basic
  ESI: { employeeRate: 0.0075, employerRate: 0.0325, grossThreshold: 21000 },
  PT: {
    state: 'Maharashtra',
    slabs: [
      { upTo: 7500, amount: 0 },
      { upTo: 10000, amount: 175 },
      { upTo: null as number | null, amount: 200 },
    ],
    februaryExtra: 100, // ₹300 in Feb for top slab (200 + 100)
  },
  TDS: {
    standardDeduction: 75000,
    rebate87ALimit: 700000,
    cess: 0.04,
  },
};

@Injectable()
export class StatutoryService implements LocalizationPack {
  readonly country = 'IN';
  readonly name = 'India (IN)';

  constructor(
    @InjectRepository(StatutoryConfig)
    private readonly configRepo: Repository<StatutoryConfig>,
    @InjectRepository(TaxSlab)
    private readonly slabRepo: Repository<TaxSlab>,
    @InjectRepository(Form16)
    private readonly form16Repo: Repository<Form16>,
    @InjectRepository(ComplianceCalendarItem)
    private readonly calendarRepo: Repository<ComplianceCalendarItem>,
    @Optional() private readonly localizationRegistry?: LocalizationRegistry,
  ) {
    // Self-register with the localization registry if available
    if (this.localizationRegistry) {
      this.localizationRegistry.register(this);
    }
  }

  /** LocalizationPack interface — synchronous statutory calculation for India. */
  calculateStatutory(input: TaxCalculationInput): TaxCalculationResult {
    const { grossMonthly, basicMonthly } = input;

    // PF: 12% of basic, capped at ₹15,000 basic
    const pfBase = Math.min(basicMonthly, INDIA_DEFAULTS.PF.wageCeiling);
    const pfAmount = round2(pfBase * INDIA_DEFAULTS.PF.rate);

    // ESI: employee 0.75%, employer 3.25% if gross <= ₹21,000
    let esiEmployee = 0;
    let esiEmployer = 0;
    if (grossMonthly <= INDIA_DEFAULTS.ESI.grossThreshold) {
      esiEmployee = round2(grossMonthly * INDIA_DEFAULTS.ESI.employeeRate);
      esiEmployer = round2(grossMonthly * INDIA_DEFAULTS.ESI.employerRate);
    }

    // PT: Maharashtra default slab
    let ptAmount = 0;
    const slabs = INDIA_DEFAULTS.PT.slabs;
    for (let i = 0; i < slabs.length; i++) {
      const slab = slabs[i];
      if (slab.upTo === null || slab.upTo === undefined || grossMonthly <= slab.upTo) {
        ptAmount = slab.amount;
        break;
      }
    }

    // TDS: simplified — use NEW regime FY2025-26 defaults (in-memory)
    const annualTaxable = Math.max(0, input.annualTaxableIncome - INDIA_DEFAULTS.TDS.standardDeduction);
    let annualTax = 0;
    if (annualTaxable > INDIA_DEFAULTS.TDS.rebate87ALimit) {
      const newRegimeBrackets = [
        { from: 0, to: 300000, rate: 0 },
        { from: 300000, to: 700000, rate: 0.05 },
        { from: 700000, to: 1000000, rate: 0.10 },
        { from: 1000000, to: 1200000, rate: 0.15 },
        { from: 1200000, to: 1500000, rate: 0.20 },
        { from: 1500000, to: Infinity, rate: 0.30 },
      ];
      for (const bracket of newRegimeBrackets) {
        if (annualTaxable <= bracket.from) break;
        const taxable = Math.min(annualTaxable, bracket.to) - bracket.from;
        annualTax += taxable * bracket.rate;
      }
      annualTax = round2(annualTax * (1 + INDIA_DEFAULTS.TDS.cess));
    }
    const tdsMonthly = round2(annualTax / 12);

    const employeeDeductions: TaxCalculationResult['employeeDeductions'] = [
      { code: 'PF_EMPLOYEE', name: 'Provident Fund (Employee)', amount: pfAmount },
      { code: 'ESI_EMPLOYEE', name: 'ESI (Employee)', amount: esiEmployee },
      { code: 'PT', name: 'Professional Tax', amount: ptAmount },
      { code: 'TDS', name: 'Income Tax (TDS)', amount: tdsMonthly },
    ];

    const employerContributions: TaxCalculationResult['employerContributions'] = [
      { code: 'PF_EMPLOYER', name: 'Provident Fund (Employer)', amount: pfAmount },
      { code: 'ESI_EMPLOYER', name: 'ESI (Employer)', amount: esiEmployer },
    ];

    const totalDeductions = employeeDeductions.reduce((s, d) => s + d.amount, 0);

    return {
      employeeDeductions,
      employerContributions,
      netPay: round2(grossMonthly - totalDeductions),
    };
  }

  /** LocalizationPack interface — India compliance calendar items. */
  getComplianceCalendarItems(
    month: number,
    year: number,
  ): Array<{ title: string; dueDate: string; type: string }> {
    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    return [
      { title: `TDS Payment (${year}-${mm})`, dueDate: `${year}-${mm}-07`, type: 'TDS' },
      { title: `PF Contribution (${year}-${mm})`, dueDate: `${year}-${mm}-15`, type: 'PF' },
      { title: `ESI Contribution (${year}-${mm})`, dueDate: `${year}-${mm}-15`, type: 'ESI' },
      {
        title: `Professional Tax (${year}-${mm})`,
        dueDate: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
        type: 'PT',
      },
    ];
  }

  // ---------------------------------------------------------------------------
  // Config helpers
  // ---------------------------------------------------------------------------

  private async getConfig(tenantId: string, type: StatutoryType): Promise<any> {
    const cfg = await this.configRepo.findOne({ where: { tenantId, type } });
    if (cfg && cfg.isEnabled && cfg.config && Object.keys(cfg.config).length) {
      return cfg.config;
    }
    return null;
  }

  async getStatutoryConfigs(tenantId: string): Promise<StatutoryConfig[]> {
    return this.configRepo.find({ where: { tenantId }, order: { type: 'ASC' } });
  }

  async upsertStatutoryConfig(
    tenantId: string,
    dto: UpsertStatutoryConfigDto,
  ): Promise<StatutoryConfig> {
    let cfg = await this.configRepo.findOne({ where: { tenantId, type: dto.type } });
    if (!cfg) {
      cfg = this.configRepo.create({
        tenantId,
        type: dto.type,
        country: 'IN',
        isEnabled: dto.isEnabled ?? true,
        config: dto.config ?? {},
        effectiveFrom: dto.effectiveFrom ?? this.todayStr(),
      });
    } else {
      if (dto.isEnabled !== undefined) cfg.isEnabled = dto.isEnabled;
      if (dto.config !== undefined) cfg.config = dto.config;
      if (dto.effectiveFrom !== undefined) cfg.effectiveFrom = dto.effectiveFrom;
    }
    return this.configRepo.save(cfg);
  }

  // ---------------------------------------------------------------------------
  // India calculation engine
  // ---------------------------------------------------------------------------

  /** PF: employee 12% & employer 12% of basic, basic capped at wage ceiling. */
  async calculatePF(tenantId: string, basic: number): Promise<PfResult> {
    const cfg = (await this.getConfig(tenantId, StatutoryType.PF)) || INDIA_DEFAULTS.PF;
    const rate = cfg.rate ?? INDIA_DEFAULTS.PF.rate;
    const ceiling = cfg.wageCeiling ?? INDIA_DEFAULTS.PF.wageCeiling;
    const pfBase = Math.min(basic, ceiling);
    const amount = round2(pfBase * rate);
    return { employee: amount, employer: amount };
  }

  /** ESI: if gross <= threshold, employee 0.75% & employer 3.25% of gross; else 0. */
  async calculateESI(tenantId: string, grossMonthly: number): Promise<EsiResult> {
    const cfg = (await this.getConfig(tenantId, StatutoryType.ESI)) || INDIA_DEFAULTS.ESI;
    const threshold = cfg.grossThreshold ?? INDIA_DEFAULTS.ESI.grossThreshold;
    if (grossMonthly > threshold) return { employee: 0, employer: 0 };
    const empRate = cfg.employeeRate ?? INDIA_DEFAULTS.ESI.employeeRate;
    const erRate = cfg.employerRate ?? INDIA_DEFAULTS.ESI.employerRate;
    return {
      employee: round2(grossMonthly * empRate),
      employer: round2(grossMonthly * erRate),
    };
  }

  /** Professional Tax — state slab (Maharashtra default). isFebruary adds extra for top slab. */
  async calculatePT(
    tenantId: string,
    grossMonthly: number,
    isFebruary = false,
    _state?: string,
  ): Promise<number> {
    const cfg = (await this.getConfig(tenantId, StatutoryType.PT)) || INDIA_DEFAULTS.PT;
    const slabs = cfg.slabs ?? INDIA_DEFAULTS.PT.slabs;
    const febExtra = cfg.februaryExtra ?? INDIA_DEFAULTS.PT.februaryExtra;
    let amount = 0;
    let isTopSlab = false;
    for (let i = 0; i < slabs.length; i++) {
      const slab = slabs[i];
      if (slab.upTo === null || slab.upTo === undefined || grossMonthly <= slab.upTo) {
        amount = slab.amount;
        isTopSlab = i === slabs.length - 1;
        break;
      }
    }
    if (isFebruary && isTopSlab && amount > 0) amount += febExtra;
    return round2(amount);
  }

  /**
   * TDS — applies regime tax slabs to annual taxable income.
   * Returns { annual, monthly }. Uses DB tax slabs if present, else NEW regime FY25-26 defaults.
   */
  async calculateTDS(
    tenantId: string,
    annualTaxableIncome: number,
    regime: TaxRegime = TaxRegime.NEW,
    financialYear = '2025-26',
  ): Promise<{ annual: number; monthly: number }> {
    const cfg = (await this.getConfig(tenantId, StatutoryType.TDS)) || INDIA_DEFAULTS.TDS;
    const stdDeduction = cfg.standardDeduction ?? INDIA_DEFAULTS.TDS.standardDeduction;
    const rebateLimit = cfg.rebate87ALimit ?? INDIA_DEFAULTS.TDS.rebate87ALimit;
    const cess = cfg.cess ?? INDIA_DEFAULTS.TDS.cess;

    const taxable = Math.max(0, annualTaxableIncome - stdDeduction);

    // 87A rebate: NEW regime — taxable <= rebate limit -> nil tax
    if (regime === TaxRegime.NEW && taxable <= rebateLimit) {
      return { annual: 0, monthly: 0 };
    }

    const slabs = await this.getTaxSlabs(tenantId, regime, financialYear);
    let tax = 0;
    for (const slab of slabs) {
      const from = slab.fromAmount;
      const to = slab.toAmount ?? Infinity;
      if (taxable > from) {
        const slabIncome = Math.min(taxable, to) - from;
        tax += (slabIncome * slab.rate) / 100;
      }
    }
    tax = round2(tax * (1 + cess));
    return { annual: tax, monthly: round2(tax / 12) };
  }

  /** Gratuity: (15/26) * lastDrawnBasic * years, eligible >= 5 years. */
  calculateGratuity(lastDrawnBasic: number, yearsOfService: number): number {
    if (yearsOfService < 5) return 0;
    return round2((15 / 26) * lastDrawnBasic * yearsOfService);
  }

  // ---------------------------------------------------------------------------
  // Tax slabs
  // ---------------------------------------------------------------------------

  async getTaxSlabs(
    tenantId: string,
    regime: TaxRegime,
    financialYear: string,
  ): Promise<TaxSlab[]> {
    const slabs = await this.slabRepo.find({
      where: { tenantId, regime, financialYear },
      order: { fromAmount: 'ASC' },
    });
    if (slabs.length) return slabs;
    // Fall back to NEW regime FY2025-26 defaults (in-memory, not persisted)
    return this.defaultNewRegimeSlabs(tenantId, financialYear);
  }

  async listTaxSlabs(tenantId: string): Promise<TaxSlab[]> {
    return this.slabRepo.find({
      where: { tenantId },
      order: { financialYear: 'DESC', regime: 'ASC', fromAmount: 'ASC' },
    });
  }

  private defaultNewRegimeSlabs(tenantId: string, financialYear: string): TaxSlab[] {
    const raw = [
      { from: 0, to: 300000, rate: 0 },
      { from: 300000, to: 700000, rate: 5 },
      { from: 700000, to: 1000000, rate: 10 },
      { from: 1000000, to: 1200000, rate: 15 },
      { from: 1200000, to: 1500000, rate: 20 },
      { from: 1500000, to: null, rate: 30 },
    ];
    return raw.map(
      (r) =>
        ({
          tenantId,
          regime: TaxRegime.NEW,
          financialYear,
          fromAmount: r.from,
          toAmount: r.to,
          rate: r.rate,
          surcharge: 0,
        }) as TaxSlab,
    );
  }

  // ---------------------------------------------------------------------------
  // Compliance calendar
  // ---------------------------------------------------------------------------

  async getComplianceCalendar(
    tenantId: string,
    month?: number,
    year?: number,
  ): Promise<ComplianceCalendarItem[]> {
    const qb = this.calendarRepo
      .createQueryBuilder('c')
      .where('c.tenantId = :tenantId', { tenantId });
    if (month && year) {
      const from = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      qb.andWhere('c.dueDate >= :from AND c.dueDate <= :to', { from, to });
    }
    qb.orderBy('c.dueDate', 'ASC');
    const items = await qb.getMany();
    // mark overdue (in-memory presentation)
    const today = this.todayStr();
    for (const item of items) {
      if (item.status === ComplianceStatus.PENDING && item.dueDate < today) {
        item.status = ComplianceStatus.OVERDUE;
      }
    }
    return items;
  }

  async createComplianceItem(
    tenantId: string,
    dto: CreateComplianceItemDto,
  ): Promise<ComplianceCalendarItem> {
    const item = this.calendarRepo.create({
      tenantId,
      title: dto.title,
      complianceType: dto.complianceType,
      dueDate: dto.dueDate,
      frequency: dto.frequency ?? ComplianceFrequency.MONTHLY,
      status: ComplianceStatus.PENDING,
      remarks: dto.remarks ?? null,
    });
    return this.calendarRepo.save(item);
  }

  async markFiled(
    tenantId: string,
    itemId: string,
    remarks?: string,
  ): Promise<ComplianceCalendarItem> {
    const item = await this.calendarRepo.findOne({ where: { id: itemId, tenantId } });
    if (!item) throw new NotFoundException(`Compliance item ${itemId} not found`);
    item.status = ComplianceStatus.FILED;
    item.filedAt = new Date();
    if (remarks !== undefined) item.remarks = remarks;
    return this.calendarRepo.save(item);
  }

  /** Generate standard monthly compliance items (PF/ESI by 15th, PT by month end, TDS by 7th). */
  async generateMonthlyComplianceItems(
    tenantId: string,
    month: number,
    year: number,
  ): Promise<ComplianceCalendarItem[]> {
    const mm = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const periodLabel = `${year}-${mm}`;
    const defs = [
      {
        title: `TDS Payment (${periodLabel})`,
        complianceType: ComplianceType.TDS,
        dueDate: `${year}-${mm}-07`,
      },
      {
        title: `PF Contribution (${periodLabel})`,
        complianceType: ComplianceType.PF,
        dueDate: `${year}-${mm}-15`,
      },
      {
        title: `ESI Contribution (${periodLabel})`,
        complianceType: ComplianceType.ESI,
        dueDate: `${year}-${mm}-15`,
      },
      {
        title: `Professional Tax (${periodLabel})`,
        complianceType: ComplianceType.PT,
        dueDate: `${year}-${mm}-${String(lastDay).padStart(2, '0')}`,
      },
    ];
    const created: ComplianceCalendarItem[] = [];
    for (const d of defs) {
      const exists = await this.calendarRepo.findOne({
        where: {
          tenantId,
          complianceType: d.complianceType,
          dueDate: d.dueDate,
        },
      });
      if (exists) {
        created.push(exists);
        continue;
      }
      const item = this.calendarRepo.create({
        tenantId,
        title: d.title,
        complianceType: d.complianceType,
        dueDate: d.dueDate,
        frequency: ComplianceFrequency.MONTHLY,
        status: ComplianceStatus.PENDING,
      });
      created.push(await this.calendarRepo.save(item));
    }
    return created;
  }

  // ---------------------------------------------------------------------------
  // Form 16
  // ---------------------------------------------------------------------------

  async generateForm16(
    tenantId: string,
    employeeId: string,
    financialYear: string,
    data: {
      grossSalary: number;
      totalDeductions: number;
      taxableIncome: number;
      taxPaid: number;
    },
  ): Promise<Form16> {
    let f16 = await this.form16Repo.findOne({
      where: { tenantId, employeeId, financialYear },
    });
    if (!f16) {
      f16 = this.form16Repo.create({ tenantId, employeeId, financialYear });
    }
    Object.assign(f16, data, { generatedAt: new Date() });
    return this.form16Repo.save(f16);
  }

  async listForm16(tenantId: string, employeeId?: string): Promise<Form16[]> {
    const where: any = { tenantId };
    if (employeeId) where.employeeId = employeeId;
    return this.form16Repo.find({ where, order: { financialYear: 'DESC' } });
  }

  private todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
