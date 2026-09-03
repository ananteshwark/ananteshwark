import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LegislativeDataGroup, RoundingRule } from './entities/legislative-data-group.entity';

/** Representative defaults for the three reference legislations. */
const DEFAULT_LDGS = [
  {
    code: 'IN_LDG', name: 'India', countryCode: 'IN', currency: 'INR',
    roundingRule: RoundingRule.NEAREST, roundingPrecision: 0,
    config: { regimes: ['OLD', 'NEW'], pfEmployeePct: 12, pfEmployerPct: 12, esiEmployeePct: 0.75, esiEmployerPct: 3.25, esiWageCeiling: 21000, pfWageCeiling: 15000, professionalTaxMonthly: 200 },
  },
  {
    code: 'UK_LDG', name: 'United Kingdom', countryCode: 'GB', currency: 'GBP',
    roundingRule: RoundingRule.DOWN, roundingPrecision: 2,
    config: { payeBands: 'standard', niClass1EmployeePct: 8, niClass1EmployerPct: 13.8, niPrimaryThreshold: 12570, studentLoanPlans: ['PLAN1', 'PLAN2', 'POSTGRAD'] },
  },
  {
    code: 'US_LDG', name: 'United States', countryCode: 'US', currency: 'USD',
    roundingRule: RoundingRule.NEAREST, roundingPrecision: 2,
    config: { ficaSsPct: 6.2, ficaSsWageBase: 168600, medicarePct: 1.45, additionalMedicarePct: 0.9, additionalMedicareThreshold: 200000, futaPct: 0.6, futaWageBase: 7000 },
  },
];

@Injectable()
export class LdgService {
  constructor(
    @InjectRepository(LegislativeDataGroup) private readonly repo: Repository<LegislativeDataGroup>,
  ) {}

  list(tenantId: string): Promise<LegislativeDataGroup[]> {
    return this.repo.find({ where: { tenantId }, order: { countryCode: 'ASC' } });
  }

  async get(tenantId: string, id: string): Promise<LegislativeDataGroup> {
    const ldg = await this.repo.findOne({ where: { id, tenantId } });
    if (!ldg) throw new NotFoundException(`LDG ${id} not found`);
    return ldg;
  }

  async create(tenantId: string, data: Partial<LegislativeDataGroup>): Promise<LegislativeDataGroup> {
    if (!data.code || !data.countryCode) throw new BadRequestException('code and countryCode are required');
    const dup = await this.repo.findOne({ where: { tenantId, code: data.code } });
    if (dup) throw new BadRequestException(`LDG ${data.code} already exists`);
    const ldg = this.repo.create({
      tenantId, currency: 'USD', roundingRule: RoundingRule.NEAREST, roundingPrecision: 0, config: {}, isActive: true, ...data,
    } as any) as unknown as LegislativeDataGroup;
    return (this.repo.save(ldg) as unknown) as Promise<LegislativeDataGroup>;
  }

  async update(tenantId: string, id: string, data: Partial<LegislativeDataGroup>): Promise<LegislativeDataGroup> {
    const ldg = await this.get(tenantId, id);
    Object.assign(ldg, data);
    return (this.repo.save(ldg) as unknown) as Promise<LegislativeDataGroup>;
  }

  /** Active LDG for a country (first match). */
  async resolveForCountry(tenantId: string, countryCode: string): Promise<LegislativeDataGroup | null> {
    return this.repo.findOne({ where: { tenantId, countryCode, isActive: true } });
  }

  /** Apply the LDG rounding rule to an amount. */
  applyRounding(ldg: LegislativeDataGroup, amount: number): number {
    const factor = Math.pow(10, ldg.roundingPrecision);
    const scaled = amount * factor;
    let r: number;
    if (ldg.roundingRule === RoundingRule.UP) r = Math.ceil(scaled);
    else if (ldg.roundingRule === RoundingRule.DOWN) r = Math.floor(scaled);
    else r = Math.round(scaled);
    return r / factor;
  }

  /** Seed IN / UK / US reference LDGs (idempotent). */
  async seedDefaults(tenantId: string): Promise<{ created: number }> {
    let created = 0;
    for (const d of DEFAULT_LDGS) {
      const exists = await this.repo.findOne({ where: { tenantId, code: d.code } });
      if (exists) continue;
      await this.repo.save(this.repo.create({ tenantId, isActive: true, ...d } as any));
      created++;
    }
    return { created };
  }
}
