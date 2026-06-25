import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  StatutoryForm,
  StatutoryFormType,
  StatutoryFormStatus,
} from './entities/statutory-form.entity';
import {
  EosbSettlement,
  EosbSettlementStatus,
  EosbTerminationType,
} from './entities/eosb-settlement.entity';
import { Payslip } from '../../runs/entities/payslip.entity';
import { Employee } from '../../../hr/employees/entities/employee.entity';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** US federal payroll-tax constants (tax year 2025). */
export const US_TAX_2025 = {
  ssWageBase: 176100,
  ssRate: 0.062,
  medicareRate: 0.0145,
  additionalMedicareRate: 0.009, // on wages over threshold
  additionalMedicareThreshold: 200000,
};

/** Maps a deduction/earning code to the W-2 box it contributes to. */
function classifyDeduction(code: string): 'fed' | 'ss' | 'medicare' | 'state' | 'local' | null {
  const c = (code || '').toUpperCase();
  if (/(FED|FIT|FEDERAL)/.test(c) && !/STATE/.test(c)) return 'fed';
  if (/(OASDI|SOCIAL|SOC_SEC|^SS$|_SS_|SS_TAX)/.test(c)) return 'ss';
  if (/(MEDICARE|MEDI)/.test(c)) return 'medicare';
  if (/(SIT|STATE)/.test(c)) return 'state';
  if (/(LOCAL|CITY)/.test(c)) return 'local';
  return null;
}

export interface W2Options {
  employerEin?: string;
  employerName?: string;
  stateCode?: string;
  employeeSsn?: string;
}

export interface Form1099Options {
  payerTin?: string;
  payerName?: string;
  recipientTin?: string;
  recipientName?: string;
  /** Total nonemployee compensation (box 1) — if not derivable from payslips. */
  nonemployeeCompensation?: number;
  federalTaxWithheld?: number;
}

@Injectable()
export class StatutoryFormsService {
  constructor(
    @InjectRepository(StatutoryForm)
    private readonly formRepo: Repository<StatutoryForm>,
    @InjectRepository(EosbSettlement)
    private readonly eosbRepo: Repository<EosbSettlement>,
    @InjectRepository(Payslip)
    private readonly payslipRepo: Repository<Payslip>,
    @InjectRepository(Employee)
    private readonly employeeRepo: Repository<Employee>,
  ) {}

  // ─── Listing / lifecycle ───────────────────────────────────────────────────

  async listForms(
    tenantId: string,
    filter: { formType?: StatutoryFormType; taxYear?: number; employeeId?: string } = {},
  ): Promise<StatutoryForm[]> {
    const where: any = { tenantId };
    if (filter.formType) where.formType = filter.formType;
    if (filter.taxYear) where.taxYear = filter.taxYear;
    if (filter.employeeId) where.employeeId = filter.employeeId;
    return this.formRepo.find({ where, order: { generatedAt: 'DESC' } });
  }

  async getForm(tenantId: string, id: string): Promise<StatutoryForm> {
    const form = await this.formRepo.findOne({ where: { id, tenantId } });
    if (!form) throw new NotFoundException(`Statutory form ${id} not found`);
    return form;
  }

  async fileForm(tenantId: string, id: string): Promise<StatutoryForm> {
    const form = await this.getForm(tenantId, id);
    form.status = StatutoryFormStatus.FILED;
    return this.formRepo.save(form);
  }

  /** Mark prior GENERATED forms of the same scope SUPERSEDED before saving a new one. */
  private async supersede(
    tenantId: string,
    formType: StatutoryFormType,
    taxYear: number,
    employeeId: string | null,
  ): Promise<void> {
    const where: any = { tenantId, formType, taxYear, status: StatutoryFormStatus.GENERATED };
    where.employeeId = employeeId; // null matches employer-level forms
    const existing = await this.formRepo.find({ where });
    for (const old of existing) {
      old.status = StatutoryFormStatus.SUPERSEDED;
      await this.formRepo.save(old);
    }
  }

  // ─── US: W-2 (boxes 1–20) ──────────────────────────────────────────────────

  /** Aggregate a year of payslips for one employee into W-2 box figures. */
  async computeW2Boxes(
    tenantId: string,
    employeeId: string,
    taxYear: number,
  ): Promise<Record<string, number>> {
    const payslips = await this.payslipRepo.find({
      where: { tenantId, employeeId, payPeriodYear: taxYear },
    });

    let gross = 0;
    let fed = 0;
    let ssTax = 0;
    let medicareTax = 0;
    let stateTax = 0;
    let localTax = 0;

    for (const p of payslips) {
      gross += Number(p.grossEarnings ?? 0);
      const deductions = (p.deductions as any[]) ?? [];
      for (const d of deductions) {
        const klass = classifyDeduction(d.code);
        const amt = Number(d.amount ?? 0);
        if (klass === 'fed') fed += amt;
        else if (klass === 'ss') ssTax += amt;
        else if (klass === 'medicare') medicareTax += amt;
        else if (klass === 'state') stateTax += amt;
        else if (klass === 'local') localTax += amt;
      }
    }

    // Social-security wages are capped at the annual wage base.
    const ssWages = Math.min(gross, US_TAX_2025.ssWageBase);
    const medicareWages = gross; // no cap

    // Where withholding isn't itemised in payslips, fall back to statutory rates.
    if (ssTax === 0 && ssWages > 0) ssTax = round2(ssWages * US_TAX_2025.ssRate);
    if (medicareTax === 0 && medicareWages > 0) {
      medicareTax = round2(medicareWages * US_TAX_2025.medicareRate);
      if (medicareWages > US_TAX_2025.additionalMedicareThreshold) {
        medicareTax += round2(
          (medicareWages - US_TAX_2025.additionalMedicareThreshold) *
            US_TAX_2025.additionalMedicareRate,
        );
      }
    }

    return {
      box1: round2(gross),          // Wages, tips, other compensation
      box2: round2(fed),            // Federal income tax withheld
      box3: round2(ssWages),        // Social security wages
      box4: round2(ssTax),          // Social security tax withheld
      box5: round2(medicareWages),  // Medicare wages and tips
      box6: round2(medicareTax),    // Medicare tax withheld
      box16: round2(gross),         // State wages
      box17: round2(stateTax),      // State income tax
      box18: round2(localTax > 0 ? gross : 0), // Local wages
      box19: round2(localTax),      // Local income tax
    };
  }

  async generateW2(
    tenantId: string,
    employeeId: string,
    taxYear: number,
    opts: W2Options = {},
    userId?: string,
  ): Promise<StatutoryForm> {
    const employee = await this.employeeRepo.findOne({ where: { id: employeeId, tenantId } });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);

    const boxes = await this.computeW2Boxes(tenantId, employeeId, taxYear);
    if (boxes.box1 <= 0) {
      throw new BadRequestException(`No payroll earnings found for employee in ${taxYear}`);
    }

    const recipientName = `${employee.firstName} ${employee.lastName}`.trim();
    await this.supersede(tenantId, StatutoryFormType.W2, taxYear, employeeId);

    const data = {
      ...boxes,
      stateCode: opts.stateCode ?? employee.currentState ?? '',
      employerEin: opts.employerEin ?? '',
      employerName: opts.employerName ?? '',
      employeeSsn: opts.employeeSsn ?? '',
      address: {
        line1: employee.currentAddressLine1 ?? '',
        line2: employee.currentAddressLine2 ?? '',
        city: employee.currentCity ?? '',
        state: employee.currentState ?? '',
        zip: employee.currentPincode ?? '',
      },
    };

    const form = this.formRepo.create({
      tenantId,
      formType: StatutoryFormType.W2,
      taxYear,
      employeeId,
      recipientName,
      recipientTaxId: opts.employeeSsn ?? null,
      data,
      totalAmount: boxes.box1,
      recipientCount: 1,
      generatedBy: userId ?? null,
    } as any);
    return (this.formRepo.save(form) as unknown) as Promise<StatutoryForm>;
  }

  /** Generate W-2s for every employee with earnings in the tax year. */
  async generateW2Batch(
    tenantId: string,
    taxYear: number,
    opts: W2Options = {},
    userId?: string,
  ): Promise<{ generated: number; skipped: number }> {
    const rows = await this.payslipRepo
      .createQueryBuilder('p')
      .select('DISTINCT p.employee_id', 'employeeId')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.pay_period_year = :taxYear', { taxYear })
      .getRawMany();

    let generated = 0;
    let skipped = 0;
    for (const r of rows) {
      try {
        await this.generateW2(tenantId, r.employeeId, taxYear, opts, userId);
        generated++;
      } catch {
        skipped++;
      }
    }
    return { generated, skipped };
  }

  // ─── US: 1099-NEC ──────────────────────────────────────────────────────────

  async generate1099Nec(
    tenantId: string,
    taxYear: number,
    opts: Form1099Options,
    userId?: string,
  ): Promise<StatutoryForm> {
    const nec = Number(opts.nonemployeeCompensation ?? 0);
    if (nec <= 0) {
      throw new BadRequestException('Nonemployee compensation (box 1) must be greater than zero');
    }

    const data = {
      box1: round2(nec),                                  // Nonemployee compensation
      box4: round2(Number(opts.federalTaxWithheld ?? 0)), // Federal income tax withheld
      payerTin: opts.payerTin ?? '',
      payerName: opts.payerName ?? '',
      recipientTin: opts.recipientTin ?? '',
    };

    await this.supersede(tenantId, StatutoryFormType.FORM_1099_NEC, taxYear, null);

    const form = this.formRepo.create({
      tenantId,
      formType: StatutoryFormType.FORM_1099_NEC,
      taxYear,
      employeeId: null,
      recipientName: opts.recipientName ?? null,
      recipientTaxId: opts.recipientTin ?? null,
      data,
      totalAmount: data.box1,
      recipientCount: 1,
      generatedBy: userId ?? null,
    } as any);
    return (this.formRepo.save(form) as unknown) as Promise<StatutoryForm>;
  }

  // ─── US: W-3 (employer transmittal summary) ────────────────────────────────

  async generateW3(
    tenantId: string,
    taxYear: number,
    opts: W2Options = {},
    userId?: string,
  ): Promise<StatutoryForm> {
    const w2s = await this.formRepo.find({
      where: {
        tenantId,
        formType: StatutoryFormType.W2,
        taxYear,
        status: StatutoryFormStatus.GENERATED,
      },
    });
    if (!w2s.length) {
      throw new BadRequestException(`No W-2 forms found for ${taxYear}. Generate W-2s first.`);
    }

    const sum = (box: string) => w2s.reduce((s, f) => s + Number(f.data?.[box] ?? 0), 0);
    const data = {
      box1: round2(sum('box1')),
      box2: round2(sum('box2')),
      box3: round2(sum('box3')),
      box4: round2(sum('box4')),
      box5: round2(sum('box5')),
      box6: round2(sum('box6')),
      box16: round2(sum('box16')),
      box17: round2(sum('box17')),
      box18: round2(sum('box18')),
      box19: round2(sum('box19')),
      employerEin: opts.employerEin ?? '',
      employerName: opts.employerName ?? '',
      numberOfW2: w2s.length,
    };

    await this.supersede(tenantId, StatutoryFormType.W3, taxYear, null);

    const form = this.formRepo.create({
      tenantId,
      formType: StatutoryFormType.W3,
      taxYear,
      employeeId: null,
      recipientName: opts.employerName ?? null,
      data,
      totalAmount: data.box1,
      recipientCount: w2s.length,
      generatedBy: userId ?? null,
    } as any);
    return (this.formRepo.save(form) as unknown) as Promise<StatutoryForm>;
  }

  // ─── US: SSA EFW2 electronic submission file ───────────────────────────────

  /** Build the SSA EFW2 fixed-width (512-char) submission file for a tax year. */
  async generateEfw2(
    tenantId: string,
    taxYear: number,
    opts: W2Options = {},
    userId?: string,
  ): Promise<StatutoryForm> {
    const w2s = await this.formRepo.find({
      where: {
        tenantId,
        formType: StatutoryFormType.W2,
        taxYear,
        status: StatutoryFormStatus.GENERATED,
      },
      order: { recipientName: 'ASC' },
    });
    if (!w2s.length) {
      throw new BadRequestException(`No W-2 forms found for ${taxYear}. Generate W-2s first.`);
    }

    const pad = (s: string | number, n: number) => String(s ?? '').slice(0, n).padEnd(n, ' ');
    const num = (v: number, n: number) => String(Math.round(Number(v ?? 0) * 100)).slice(0, n).padStart(n, '0');
    const line = (s: string) => s.padEnd(512, ' ').slice(0, 512);

    const ein = (opts.employerEin ?? '').replace(/\D/g, '');
    const employerName = opts.employerName ?? '';
    const records: string[] = [];

    // RA — Submitter record
    records.push(line('RA' + pad(ein, 9) + pad('', 5) + pad(employerName, 57)));

    // RE — Employer record
    records.push(line('RE' + String(taxYear) + pad('', 1) + pad(ein, 9) + pad(employerName, 57)));

    // RW — Employee wage records
    let totWages = 0;
    let totFed = 0;
    let totSsWages = 0;
    let totSsTax = 0;
    let totMedWages = 0;
    let totMedTax = 0;
    for (const f of w2s) {
      const d = f.data ?? {};
      totWages += Number(d.box1 ?? 0);
      totFed += Number(d.box2 ?? 0);
      totSsWages += Number(d.box3 ?? 0);
      totSsTax += Number(d.box4 ?? 0);
      totMedWages += Number(d.box5 ?? 0);
      totMedTax += Number(d.box6 ?? 0);
      records.push(
        line(
          'RW' +
            pad((f.recipientTaxId ?? '').replace(/\D/g, ''), 9) +
            pad(f.recipientName ?? '', 44) +
            num(d.box1, 11) + // wages
            num(d.box2, 11) + // federal tax
            num(d.box3, 11) + // ss wages
            num(d.box4, 11) + // ss tax
            num(d.box5, 11) + // medicare wages
            num(d.box6, 11),  // medicare tax
        ),
      );
    }

    // RT — Total record
    records.push(
      line(
        'RT' +
          String(w2s.length).padStart(7, '0') +
          num(totWages, 15) +
          num(totFed, 15) +
          num(totSsWages, 15) +
          num(totSsTax, 15) +
          num(totMedWages, 15) +
          num(totMedTax, 15),
      ),
    );

    // RF — Final record
    records.push(line('RF' + pad('', 5) + String(w2s.length).padStart(9, '0')));

    const content = records.join('\r\n');

    await this.supersede(tenantId, StatutoryFormType.EFW2, taxYear, null);
    const form = this.formRepo.create({
      tenantId,
      formType: StatutoryFormType.EFW2,
      taxYear,
      employeeId: null,
      recipientName: employerName || null,
      data: {
        totalWages: round2(totWages),
        totalFederalTax: round2(totFed),
        employeeCount: w2s.length,
      },
      content,
      totalAmount: round2(totWages),
      recipientCount: w2s.length,
      generatedBy: userId ?? null,
    } as any);
    return (this.formRepo.save(form) as unknown) as Promise<StatutoryForm>;
  }

  // ─── UAE: WPS SIF validation ───────────────────────────────────────────────

  /** Validate a WPS SIF file body against UAE MoHRE structural rules. */
  validateWpsSif(content: string): {
    valid: boolean;
    errors: string[];
    warnings: string[];
    summary: { edrCount: number; eerCount: number; declaredTotal: number; computedTotal: number };
  } {
    const errors: string[] = [];
    const warnings: string[] = [];
    const lines = (content ?? '').split(/\r?\n/).filter((l) => l.trim().length > 0);

    const edrLines = lines.filter((l) => l.startsWith('EDR|'));
    const eerLines = lines.filter((l) => l.startsWith('EER|'));

    if (lines.length === 0) errors.push('File is empty');
    if (edrLines.length === 0) errors.push('Missing EDR (Employer Detail Record)');
    if (edrLines.length > 1) errors.push('Multiple EDR records found; exactly one is required');
    if (lines[0] && !lines[0].startsWith('EDR|')) {
      errors.push('First record must be the EDR');
    }
    if (eerLines.length === 0) errors.push('No EER (Employee Entry Records) found');

    let declaredCount = 0;
    let declaredTotal = 0;
    if (edrLines.length === 1) {
      const fields = edrLines[0].split('|');
      // EDR|molId|year|month|currency|totalSalary|recordCount
      if (fields.length < 7) {
        errors.push(`EDR has ${fields.length} fields; expected at least 7`);
      } else {
        const molId = fields[1];
        declaredTotal = Number(fields[5]);
        declaredCount = parseInt(fields[6], 10);
        if (!/^\d{9,15}$/.test(molId)) {
          warnings.push(`MOL employer ID "${molId}" should be 9–15 digits`);
        }
        if (Number.isNaN(declaredTotal)) errors.push('EDR total salary is not numeric');
        if (Number.isNaN(declaredCount)) errors.push('EDR record count is not numeric');
      }
    }

    // Validate EER structure and accumulate the net-pay total.
    let computedTotal = 0;
    eerLines.forEach((l, i) => {
      const fields = l.split('|');
      if (fields.length < 14) {
        errors.push(`EER #${i + 1} has ${fields.length} fields; expected at least 14`);
        return;
      }
      const net = Number(fields[13]);
      if (Number.isNaN(net)) {
        errors.push(`EER #${i + 1} net pay is not numeric`);
      } else {
        computedTotal += net;
      }
    });
    computedTotal = round2(computedTotal);

    if (declaredCount && declaredCount !== eerLines.length) {
      errors.push(
        `EDR declares ${declaredCount} employees but ${eerLines.length} EER records present`,
      );
    }
    if (declaredTotal && Math.abs(declaredTotal - computedTotal) >= 0.01) {
      errors.push(
        `EDR total ${declaredTotal.toFixed(2)} does not match sum of EER net pay ${computedTotal.toFixed(2)}`,
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      summary: {
        edrCount: edrLines.length,
        eerCount: eerLines.length,
        declaredTotal,
        computedTotal,
      },
    };
  }

  // ─── UAE: EOSB (End of Service Benefit) ────────────────────────────────────

  /**
   * UAE EOSB: 21 days' basic per year for the first 5 years, 30 days per year
   * thereafter, capped at 24 months' basic. Eligible after 1 year of service.
   */
  calculateEosb(lastDrawnBasicMonthly: number, yearsOfService: number): number {
    if (yearsOfService < 1) return 0;
    const dailyWage = lastDrawnBasicMonthly / 30;
    const first5 = Math.min(yearsOfService, 5);
    const beyond5 = Math.max(0, yearsOfService - 5);
    const days = first5 * 21 + beyond5 * 30;
    const eosb = dailyWage * days;
    const cap = lastDrawnBasicMonthly * 24;
    return round2(Math.min(eosb, cap));
  }

  private yearsBetween(joinDate: string, separationDate: string): number {
    const start = new Date(joinDate).getTime();
    const end = new Date(separationDate).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
    const days = (end - start) / (1000 * 60 * 60 * 24);
    return Math.round((days / 365.25) * 1000) / 1000;
  }

  async listEosbSettlements(tenantId: string, employeeId?: string): Promise<EosbSettlement[]> {
    const where: any = { tenantId };
    if (employeeId) where.employeeId = employeeId;
    return this.eosbRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async createEosbSettlement(
    tenantId: string,
    dto: {
      employeeId: string;
      lastDrawnBasic: number;
      joinDate: string;
      separationDate: string;
      terminationType?: EosbTerminationType;
      currency?: string;
      remarks?: string;
    },
  ): Promise<EosbSettlement> {
    const employee = await this.employeeRepo.findOne({ where: { id: dto.employeeId, tenantId } });
    const yearsOfService = this.yearsBetween(dto.joinDate, dto.separationDate);
    if (yearsOfService <= 0) {
      throw new BadRequestException('Separation date must be after join date');
    }
    const eosbAmount = this.calculateEosb(Number(dto.lastDrawnBasic), yearsOfService);

    const settlement = this.eosbRepo.create({
      tenantId,
      employeeId: dto.employeeId,
      employeeName: employee ? `${employee.firstName} ${employee.lastName}`.trim() : null,
      lastDrawnBasic: Number(dto.lastDrawnBasic),
      joinDate: dto.joinDate,
      separationDate: dto.separationDate,
      yearsOfService,
      terminationType: dto.terminationType ?? EosbTerminationType.RESIGNATION,
      eosbAmount,
      currency: dto.currency ?? 'AED',
      status: EosbSettlementStatus.PENDING,
      remarks: dto.remarks ?? null,
    } as any);
    return (this.eosbRepo.save(settlement) as unknown) as Promise<EosbSettlement>;
  }

  async approveEosbSettlement(
    tenantId: string,
    id: string,
    approvedById: string,
  ): Promise<EosbSettlement> {
    const settlement = await this.eosbRepo.findOne({ where: { id, tenantId } });
    if (!settlement) throw new NotFoundException(`EOSB settlement ${id} not found`);
    if (settlement.status !== EosbSettlementStatus.PENDING) {
      throw new BadRequestException(`Only PENDING settlements can be approved`);
    }
    settlement.status = EosbSettlementStatus.APPROVED;
    settlement.approvedById = approvedById;
    settlement.approvedAt = new Date();
    return this.eosbRepo.save(settlement);
  }

  async rejectEosbSettlement(
    tenantId: string,
    id: string,
    remarks?: string,
  ): Promise<EosbSettlement> {
    const settlement = await this.eosbRepo.findOne({ where: { id, tenantId } });
    if (!settlement) throw new NotFoundException(`EOSB settlement ${id} not found`);
    if (settlement.status !== EosbSettlementStatus.PENDING) {
      throw new BadRequestException(`Only PENDING settlements can be rejected`);
    }
    settlement.status = EosbSettlementStatus.REJECTED;
    if (remarks !== undefined) settlement.remarks = remarks;
    return this.eosbRepo.save(settlement);
  }

  async markEosbPaid(tenantId: string, id: string): Promise<EosbSettlement> {
    const settlement = await this.eosbRepo.findOne({ where: { id, tenantId } });
    if (!settlement) throw new NotFoundException(`EOSB settlement ${id} not found`);
    if (settlement.status !== EosbSettlementStatus.APPROVED) {
      throw new BadRequestException(`Only APPROVED settlements can be marked paid`);
    }
    settlement.status = EosbSettlementStatus.PAID;
    settlement.paidAt = new Date();
    return this.eosbRepo.save(settlement);
  }
}
