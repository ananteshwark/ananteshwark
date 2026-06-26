import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ZxRegime, ZxTax, ZxStatus, ZxRate } from './entities/zx-hierarchy.entity';
import { ZxRule, ZxRuleType } from './entities/zx-rule.entity';
import { ZxRegistration, ZxPartyType } from './entities/zx-registration.entity';
import { TaxLine, TaxDocumentType } from './entities/tax-line.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface TaxContext {
  date: string;
  country?: string;
  amount: number;
  partyType?: string;
  partyId?: string;
  partyRegistered?: boolean;
  supplierState?: string;
  customerState?: string;
  placeOfSupply?: string;
  itemCategory?: string;
  intraState?: boolean;
  [k: string]: any;
}

export interface DeterminedTax {
  taxId: string;
  taxCode: string;
  taxName: string;
  statusCode: string;
  rateCode: string;
  rate: number;
  baseAmount: number;
  taxAmount: number;
  glAccountId: string | null;
  rulesApplied: string[];
}

@Injectable()
export class ZxTaxService {
  constructor(
    @InjectRepository(ZxRegime) private readonly regimeRepo: Repository<ZxRegime>,
    @InjectRepository(ZxTax) private readonly taxRepo: Repository<ZxTax>,
    @InjectRepository(ZxStatus) private readonly statusRepo: Repository<ZxStatus>,
    @InjectRepository(ZxRate) private readonly rateRepo: Repository<ZxRate>,
    @InjectRepository(ZxRule) private readonly ruleRepo: Repository<ZxRule>,
    @InjectRepository(ZxRegistration) private readonly regRepo: Repository<ZxRegistration>,
    @InjectRepository(TaxLine) private readonly taxLineRepo: Repository<TaxLine>,
  ) {}

  // ─── Ph-121: Hierarchy CRUD ───────────────────────────────────────

  listRegimes(tenantId: string) {
    return this.regimeRepo.find({ where: { tenantId }, order: { code: 'ASC' } });
  }
  async createRegime(tenantId: string, data: Partial<ZxRegime>) {
    if (!data.code) throw new BadRequestException('code is required');
    const dup = await this.regimeRepo.findOne({ where: { tenantId, code: data.code } });
    if (dup) throw new BadRequestException(`Regime ${data.code} already exists`);
    return this.save(this.regimeRepo, { tenantId, isActive: true, ...data });
  }
  listTaxes(tenantId: string, regimeId: string) {
    return this.taxRepo.find({ where: { tenantId, regimeId }, order: { code: 'ASC' } });
  }
  async createTax(tenantId: string, data: Partial<ZxTax>) {
    if (!data.regimeId || !data.code) throw new BadRequestException('regimeId and code are required');
    return this.save(this.taxRepo, { tenantId, isActive: true, ...data });
  }
  listStatuses(tenantId: string, taxId: string) {
    return this.statusRepo.find({ where: { tenantId, taxId }, order: { code: 'ASC' } });
  }
  createStatus(tenantId: string, data: Partial<ZxStatus>) {
    if (!data.taxId || !data.code) throw new BadRequestException('taxId and code are required');
    return this.save(this.statusRepo, { tenantId, ...data });
  }
  listRates(tenantId: string, statusId: string) {
    return this.rateRepo.find({ where: { tenantId, statusId }, order: { effectiveFrom: 'DESC' } });
  }
  createRate(tenantId: string, data: Partial<ZxRate>) {
    if (!data.statusId) throw new BadRequestException('statusId is required');
    return this.save(this.rateRepo, { tenantId, ...data });
  }

  // ─── Ph-122: Rules ────────────────────────────────────────────────

  listRules(tenantId: string, regimeId?: string) {
    const where: any = { tenantId };
    if (regimeId) where.regimeId = regimeId;
    return this.ruleRepo.find({ where, order: { regimeId: 'ASC', ruleType: 'ASC', priority: 'ASC' } });
  }
  async createRule(tenantId: string, data: Partial<ZxRule>) {
    if (!data.regimeId || !data.ruleType) throw new BadRequestException('regimeId and ruleType are required');
    if (data.conditionExpression) this.validateCondition(data.conditionExpression);
    return this.save(this.ruleRepo, { tenantId, isActive: true, priority: 50, ...data });
  }
  async deleteRule(tenantId: string, id: string) {
    const rule = await this.ruleRepo.findOne({ where: { id, tenantId } });
    if (!rule) throw new NotFoundException(`Rule ${id} not found`);
    await this.ruleRepo.remove(rule);
  }

  // ─── Ph-123: Registrations ────────────────────────────────────────

  listRegistrations(tenantId: string, params: { partyType?: ZxPartyType; partyId?: string } = {}) {
    const where: any = { tenantId };
    if (params.partyType) where.partyType = params.partyType;
    if (params.partyId) where.partyId = params.partyId;
    return this.regRepo.find({ where, order: { createdAt: 'DESC' } });
  }
  createRegistration(tenantId: string, data: Partial<ZxRegistration>) {
    if (!data.partyId || !data.regimeId || !data.registrationNumber) {
      throw new BadRequestException('partyId, regimeId and registrationNumber are required');
    }
    return this.save(this.regRepo, { tenantId, isActive: true, ...data });
  }
  async isPartyRegistered(tenantId: string, partyType: ZxPartyType, partyId: string, regimeId: string, date: string): Promise<boolean> {
    const regs = await this.regRepo.find({ where: { tenantId, partyType, partyId, regimeId, isActive: true } });
    return regs.some((r) => this.effectiveOn(r.effectiveFrom, r.effectiveTo, date));
  }

  // ─── Determination Engine ─────────────────────────────────────────

  /**
   * Determine all applicable taxes for a transaction context. For each tax in
   * the active regime, evaluate APPLICABILITY → STATUS → RATE rules (falling
   * back to defaults), then compute the tax amount.
   */
  async determineTax(tenantId: string, regimeCode: string, ctx: TaxContext): Promise<DeterminedTax[]> {
    const regime = await this.regimeRepo.findOne({ where: { tenantId, code: regimeCode } });
    if (!regime) throw new NotFoundException(`Regime ${regimeCode} not found`);
    if (!this.effectiveOn(regime.effectiveFrom, regime.effectiveTo, ctx.date)) {
      throw new BadRequestException(`Regime ${regimeCode} is not effective on ${ctx.date}`);
    }

    const taxes = await this.taxRepo.find({ where: { tenantId, regimeId: regime.id, isActive: true } });
    const rules = await this.ruleRepo.find({
      where: { tenantId, regimeId: regime.id, isActive: true },
      order: { priority: 'ASC' },
    });
    const results: DeterminedTax[] = [];

    for (const tax of taxes) {
      const taxRules = rules.filter((r) => !r.taxId || r.taxId === tax.id);
      const applied: string[] = [];

      // 1) Applicability — default applicable unless a rule says otherwise
      const applRule = taxRules.find(
        (r) => r.ruleType === ZxRuleType.APPLICABILITY && this.matches(r, ctx),
      );
      if (applRule) {
        applied.push(applRule.name);
        if (applRule.resultApplicable === false) continue;
      }

      // 2) Status — rule wins, else default status
      let status: ZxStatus | null = null;
      const statusRule = taxRules.find((r) => r.ruleType === ZxRuleType.STATUS && this.matches(r, ctx));
      if (statusRule?.resultStatusId) {
        status = await this.statusRepo.findOne({ where: { id: statusRule.resultStatusId, tenantId } });
        if (status) applied.push(statusRule.name);
      }
      if (!status) {
        const statuses = await this.statusRepo.find({ where: { tenantId, taxId: tax.id } });
        status = statuses.find((s) => s.isDefault) ?? statuses[0] ?? null;
      }
      if (!status) continue;

      // 3) Rate — rule wins, else default/effective rate for the status
      let rate: ZxRate | null = null;
      const rateRule = taxRules.find((r) => r.ruleType === ZxRuleType.RATE && this.matches(r, ctx));
      if (rateRule?.resultRateId) {
        rate = await this.rateRepo.findOne({ where: { id: rateRule.resultRateId, tenantId } });
        if (rate) applied.push(rateRule.name);
      }
      if (!rate) {
        const rates = await this.rateRepo.find({ where: { tenantId, statusId: status.id } });
        const effective = rates.filter((r) => this.effectiveOn(r.effectiveFrom, r.effectiveTo, ctx.date));
        rate = effective.find((r) => r.isDefault) ?? effective[0] ?? null;
      }
      if (!rate) continue;

      const taxAmount = round2((ctx.amount * Number(rate.rate)) / 100);
      results.push({
        taxId: tax.id,
        taxCode: tax.code,
        taxName: tax.name,
        statusCode: status.code,
        rateCode: rate.code,
        rate: Number(rate.rate),
        baseAmount: round2(ctx.amount),
        taxAmount,
        glAccountId: rate.glAccountId,
        rulesApplied: applied,
      });
    }
    return results;
  }

  // ─── Ph-124: Reporting ────────────────────────────────────────────

  /**
   * VAT/GST return summary over a period: output tax (on invoices) vs input
   * tax (on bills), net payable. Aggregated from persisted tax_lines.
   */
  async taxReturnSummary(tenantId: string, from: string, to: string): Promise<any> {
    const lines = await this.taxLineRepo
      .createQueryBuilder('tl')
      .where('tl.tenant_id = :tenantId', { tenantId })
      .andWhere('tl.created_at >= :from', { from })
      .andWhere('tl.created_at <= :to', { to: `${to} 23:59:59` })
      .getMany();

    const output = lines.filter((l) => l.documentType === TaxDocumentType.INVOICE);
    const input = lines.filter((l) => l.documentType === TaxDocumentType.BILL);
    const sum = (arr: TaxLine[], k: 'baseAmount' | 'taxAmount') =>
      round2(arr.reduce((s, l) => s + Number(l[k]), 0));

    const byComponent = (arr: TaxLine[]) => {
      const map = new Map<string, { base: number; tax: number }>();
      for (const l of arr) {
        const key = l.componentName || l.taxCodeCode;
        const e = map.get(key) ?? { base: 0, tax: 0 };
        e.base = round2(e.base + Number(l.baseAmount));
        e.tax = round2(e.tax + Number(l.taxAmount));
        map.set(key, e);
      }
      return [...map.entries()].map(([component, v]) => ({ component, ...v }));
    };

    const outputTax = sum(output, 'taxAmount');
    const inputTax = sum(input, 'taxAmount');
    return {
      period: { from, to },
      outputTax,
      outputBase: sum(output, 'baseAmount'),
      inputTax,
      inputBase: sum(input, 'baseAmount'),
      netPayable: round2(outputTax - inputTax),
      outputByComponent: byComponent(output),
      inputByComponent: byComponent(input),
    };
  }

  /** GالسTR-3B style block (India): outward + inward summary. */
  async gstr3bSummary(tenantId: string, from: string, to: string): Promise<any> {
    const s = await this.taxReturnSummary(tenantId, from, to);
    return {
      period: s.period,
      outwardSupplies: { taxableValue: s.outputBase, taxAmount: s.outputTax, breakdown: s.outputByComponent },
      inwardSupplies: { taxableValue: s.inputBase, itc: s.inputTax, breakdown: s.inputByComponent },
      netTaxPayable: s.netPayable,
    };
  }

  // ─── helpers ──────────────────────────────────────────────────────

  private async save<T>(repo: Repository<any>, data: any): Promise<T> {
    const e = repo.create(data as any);
    return (repo.save(e) as unknown) as Promise<T>;
  }

  private effectiveOn(from: string, to: string | null, date: string): boolean {
    if (date < from) return false;
    if (to && date > to) return false;
    return true;
  }

  private matches(rule: ZxRule, ctx: TaxContext): boolean {
    if (!rule.conditionExpression) return true;
    return this.evaluateCondition(rule.conditionExpression, ctx);
  }

  /** Same grammar as the SLA condition evaluator (leaf / and / or / not). */
  evaluateCondition(expr: any, context: Record<string, any>): boolean {
    if (!expr || typeof expr !== 'object') return true;
    if (Array.isArray(expr.and)) return expr.and.every((s: any) => this.evaluateCondition(s, context));
    if (Array.isArray(expr.or)) return expr.or.some((s: any) => this.evaluateCondition(s, context));
    if (expr.not) return !this.evaluateCondition(expr.not, context);
    const { field, op, value } = expr;
    if (!field || !op) return true;
    const actual = field.split('.').reduce((o: any, k: string) => o?.[k], context);
    return this.applyOp(op, actual, value);
  }

  private applyOp(op: string, actual: any, expected: any): boolean {
    switch (op) {
      case 'eq': return actual === expected;
      case 'neq': return actual !== expected;
      case 'gt': return Number(actual) > Number(expected);
      case 'gte': return Number(actual) >= Number(expected);
      case 'lt': return Number(actual) < Number(expected);
      case 'lte': return Number(actual) <= Number(expected);
      case 'in': return Array.isArray(expected) && expected.includes(actual);
      case 'nin': return Array.isArray(expected) && !expected.includes(actual);
      case 'isTrue': return actual === true;
      case 'isFalse': return actual === false || actual === undefined || actual === null;
      default: return true;
    }
  }

  private validateCondition(expr: any): void {
    if (expr === null) return;
    if (typeof expr !== 'object') throw new BadRequestException('conditionExpression must be an object or null');
    if (Array.isArray(expr.and) || Array.isArray(expr.or) || expr.not) return;
    if (!expr.field || !expr.op) throw new BadRequestException('Leaf condition needs field and op');
  }
}
