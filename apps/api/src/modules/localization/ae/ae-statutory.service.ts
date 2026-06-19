import { Injectable, OnModuleInit } from '@nestjs/common';
import { LocalizationRegistry } from '../localization.registry';
import {
  LocalizationPack,
  TaxCalculationInput,
  TaxCalculationResult,
} from '../localization.types';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// UAE GOSI rates for UAE/GCC nationals
const GOSI_EMPLOYEE_RATE = 0.05;      // 5%
const GOSI_EMPLOYER_RATE = 0.125;     // 12.5%
// Government contributes 2.5% but is not deducted from payroll

// End of Service Gratuity accrual rates
// First 5 years: 21 working days per year of service
// After 5 years: 30 working days per year of service
const EOSG_DAYS_FIRST_5_YEARS = 21;
const EOSG_DAYS_AFTER_5_YEARS = 30;

@Injectable()
export class AeStatutoryService implements LocalizationPack, OnModuleInit {
  readonly country = 'AE';
  readonly name = 'United Arab Emirates (AE)';

  constructor(private readonly registry: LocalizationRegistry) {}

  onModuleInit() {
    this.registry.register(this);
  }

  calculateStatutory(input: TaxCalculationInput): TaxCalculationResult {
    const { grossMonthly, basicMonthly, employeeData = {} } = input;

    const isUaeNational: boolean = employeeData?.isUaeNational === true;
    const yearsOfService: number = employeeData?.yearsOfService ?? 0;

    // ---------- No personal income tax in UAE ----------
    const employeeDeductions: TaxCalculationResult['employeeDeductions'] = [];
    const employerContributions: TaxCalculationResult['employerContributions'] = [];

    if (isUaeNational) {
      // GOSI applies for UAE/GCC nationals
      const gosiBase = grossMonthly; // GOSI is calculated on total salary
      const gosiEmployee = round2(gosiBase * GOSI_EMPLOYEE_RATE);
      const gosiEmployer = round2(gosiBase * GOSI_EMPLOYER_RATE);

      employeeDeductions.push({
        code: 'GOSI_EMPLOYEE',
        name: 'GOSI (Employee 5%)',
        amount: gosiEmployee,
      });

      employerContributions.push({
        code: 'GOSI_EMPLOYER',
        name: 'GOSI (Employer 12.5%)',
        amount: gosiEmployer,
      });
    } else {
      // Expatriates: no GOSI; employer accrues EOSG
      // Monthly accrual: basicSalary × days/30 / 12
      const accrualDays =
        yearsOfService >= 5 ? EOSG_DAYS_AFTER_5_YEARS : EOSG_DAYS_FIRST_5_YEARS;
      const eosgMonthlyAccrual = round2((basicMonthly * accrualDays) / 30 / 12);

      employerContributions.push({
        code: 'EOSG_ACCRUAL',
        name: 'End of Service Gratuity (Accrual)',
        amount: eosgMonthlyAccrual,
      });
    }

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

    // WPS must be processed by 15th of the following month
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    const wpsMonth = String(nextMonth).padStart(2, '0');

    const items = [
      {
        title: `WPS Payroll Processing (${year}-${mm})`,
        dueDate: `${nextYear}-${wpsMonth}-15`,
        type: 'WPS',
      },
      {
        title: `GOSI Contribution (${year}-${mm}) — UAE Nationals`,
        dueDate: `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`,
        type: 'GOSI',
      },
    ];

    // VAT quarterly filing: Q1→Apr28, Q2→Jul28, Q3→Oct28, Q4→Jan28
    const vatDates: Record<number, string> = {
      3: `${year}-04-28`,
      6: `${year}-07-28`,
      9: `${year}-10-28`,
      12: `${year + 1}-01-28`,
    };
    if (vatDates[month]) {
      items.push({
        title: `VAT Quarterly Filing (Q${Math.ceil(month / 3)} ${year})`,
        dueDate: vatDates[month],
        type: 'VAT',
      });
    }

    return items;
  }
}
