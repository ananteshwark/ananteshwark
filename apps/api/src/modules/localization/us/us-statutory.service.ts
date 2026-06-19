import { Injectable, OnModuleInit } from '@nestjs/common';
import { LocalizationRegistry } from '../localization.registry';
import {
  LocalizationPack,
  TaxCalculationInput,
  TaxCalculationResult,
} from '../localization.types';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// 2024 Federal Income Tax — SINGLE filer annual brackets
const FEDERAL_BRACKETS_2024 = [
  { from: 0, to: 11600, rate: 0.10 },
  { from: 11600, to: 47150, rate: 0.12 },
  { from: 47150, to: 100525, rate: 0.22 },
  { from: 100525, to: 191950, rate: 0.24 },
  { from: 191950, to: 243725, rate: 0.32 },
  { from: 243725, to: 609350, rate: 0.35 },
  { from: 609350, to: Infinity, rate: 0.37 },
];

const STANDARD_DEDUCTION_2024 = 14600;
const SS_WAGE_BASE_2024 = 168600;
const SS_RATE = 0.062;
const MEDICARE_RATE = 0.0145;
const ADDITIONAL_MEDICARE_RATE = 0.009;
const ADDITIONAL_MEDICARE_THRESHOLD_ANNUAL = 200000;
const FUTA_EFFECTIVE_RATE = 0.006; // 6% reduced to 0.6% after state credit
const FUTA_WAGE_BASE = 7000;

// California state income tax brackets (annual approximation)
const CA_BRACKETS = [
  { from: 0, to: 10099, rate: 0.01 },
  { from: 10099, to: 23942, rate: 0.02 },
  { from: 23942, to: 37788, rate: 0.04 },
  { from: 37788, to: 52455, rate: 0.06 },
  { from: 52455, to: 66295, rate: 0.08 },
  { from: 66295, to: 338639, rate: 0.093 },
  { from: 338639, to: Infinity, rate: 0.103 },
];

function calcProgressiveTax(
  annualIncome: number,
  brackets: Array<{ from: number; to: number; rate: number }>,
): number {
  let tax = 0;
  for (const bracket of brackets) {
    if (annualIncome <= bracket.from) break;
    const taxable = Math.min(annualIncome, bracket.to) - bracket.from;
    tax += taxable * bracket.rate;
  }
  return tax;
}

@Injectable()
export class UsStatutoryService implements LocalizationPack, OnModuleInit {
  readonly country = 'US';
  readonly name = 'United States (US)';

  constructor(private readonly registry: LocalizationRegistry) {}

  onModuleInit() {
    this.registry.register(this);
  }

  calculateStatutory(input: TaxCalculationInput): TaxCalculationResult {
    const { grossMonthly, annualTaxableIncome } = input;

    // ---------- Federal Income Tax ----------
    const annualAfterStdDeduction = Math.max(
      0,
      annualTaxableIncome - STANDARD_DEDUCTION_2024,
    );
    const annualFederalTax = calcProgressiveTax(
      annualAfterStdDeduction,
      FEDERAL_BRACKETS_2024,
    );
    const monthlyFederalTax = round2(annualFederalTax / 12);

    // ---------- Social Security (FICA SS) ----------
    const annualSSWageBase = SS_WAGE_BASE_2024;
    const monthlySSCap = round2(annualSSWageBase / 12);
    const ssBase = Math.min(grossMonthly, monthlySSCap);
    const ssEmployee = round2(ssBase * SS_RATE);
    const ssEmployer = round2(ssBase * SS_RATE);

    // ---------- Medicare ----------
    const medicareEmployee = round2(grossMonthly * MEDICARE_RATE);
    const medicareEmployer = round2(grossMonthly * MEDICARE_RATE);

    // Additional Medicare Tax (employee only, annual > $200,000)
    let additionalMedicare = 0;
    if (annualTaxableIncome > ADDITIONAL_MEDICARE_THRESHOLD_ANNUAL) {
      const additionalAnnual =
        (annualTaxableIncome - ADDITIONAL_MEDICARE_THRESHOLD_ANNUAL) *
        ADDITIONAL_MEDICARE_RATE;
      additionalMedicare = round2(additionalAnnual / 12);
    }

    // ---------- California State Income Tax ----------
    const annualStateTax = calcProgressiveTax(annualTaxableIncome, CA_BRACKETS);
    const monthlyStateTax = round2(annualStateTax / 12);

    // ---------- FUTA (employer only) ----------
    // Apply only to first $7,000 annual wages
    const monthlyFuta =
      annualTaxableIncome <= FUTA_WAGE_BASE
        ? round2(grossMonthly * FUTA_EFFECTIVE_RATE)
        : annualTaxableIncome - grossMonthly < FUTA_WAGE_BASE
          ? round2(
              (FUTA_WAGE_BASE - (annualTaxableIncome - grossMonthly)) *
                FUTA_EFFECTIVE_RATE,
            )
          : 0;

    // ---------- Assemble result ----------
    const employeeDeductions: TaxCalculationResult['employeeDeductions'] = [
      { code: 'FED_INCOME_TAX', name: 'Federal Income Tax', amount: monthlyFederalTax },
      { code: 'SS_EMPLOYEE', name: 'Social Security (Employee)', amount: ssEmployee },
      { code: 'MEDICARE_EMPLOYEE', name: 'Medicare (Employee)', amount: medicareEmployee },
      { code: 'STATE_INCOME_TAX', name: 'CA State Income Tax', amount: monthlyStateTax },
    ];

    if (additionalMedicare > 0) {
      employeeDeductions.push({
        code: 'ADDITIONAL_MEDICARE',
        name: 'Additional Medicare Tax',
        amount: additionalMedicare,
      });
    }

    const employerContributions: TaxCalculationResult['employerContributions'] = [
      { code: 'SS_EMPLOYER', name: 'Social Security (Employer)', amount: ssEmployer },
      { code: 'MEDICARE_EMPLOYER', name: 'Medicare (Employer)', amount: medicareEmployer },
      { code: 'FUTA', name: 'FUTA (Federal Unemployment)', amount: monthlyFuta },
    ];

    const totalEmployeeDeductions = employeeDeductions.reduce(
      (sum, d) => sum + d.amount,
      0,
    );

    return {
      employeeDeductions,
      employerContributions,
      netPay: round2(grossMonthly - totalEmployeeDeductions),
    };
  }

  getComplianceCalendarItems(
    month: number,
    year: number,
  ): Array<{ title: string; dueDate: string; type: string }> {
    const mm = String(month).padStart(2, '0');
    const items = [
      {
        title: `Federal Tax Deposit (${year}-${mm})`,
        dueDate: `${year}-${mm}-15`,
        type: 'FEDERAL_TAX',
      },
      {
        title: `Social Security Deposit (${year}-${mm})`,
        dueDate: `${year}-${mm}-15`,
        type: 'FICA',
      },
      {
        title: `CA State Tax Deposit (${year}-${mm})`,
        dueDate: `${year}-${mm}-15`,
        type: 'STATE_TAX',
      },
    ];

    // FUTA quarterly: Q1→Apr30, Q2→Jul31, Q3→Oct31, Q4→Jan31
    const futaDates: Record<number, string> = {
      3: `${year}-04-30`,
      6: `${year}-07-31`,
      9: `${year}-10-31`,
      12: `${year + 1}-01-31`,
    };
    if (futaDates[month]) {
      items.push({
        title: `FUTA Quarterly Filing (Q${Math.ceil(month / 3)} ${year})`,
        dueDate: futaDates[month],
        type: 'FUTA',
      });
    }

    return items;
  }
}
