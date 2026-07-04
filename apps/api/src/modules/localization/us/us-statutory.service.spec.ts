import { UsStatutoryService } from './us-statutory.service';

/**
 * US payroll statutory math: progressive federal tax after the standard
 * deduction, FICA social-security wage-base cap, Medicare + the additional
 * 0.9% above $200k, FUTA limited to the first $7,000 of annual wages, and
 * registry self-registration.
 */
describe('UsStatutoryService', () => {
  let service: UsStatutoryService;
  let registry: any;

  beforeEach(() => {
    registry = { register: jest.fn() };
    service = new UsStatutoryService(registry);
  });

  const find = (list: any[], code: string) => list.find((d) => d.code === code);

  it('registers itself as the US localization pack on init', () => {
    service.onModuleInit();
    expect(registry.register).toHaveBeenCalledWith(service);
    expect(service.country).toBe('US');
  });

  it('income below the standard deduction pays zero federal tax', () => {
    const r = service.calculateStatutory({ grossMonthly: 1000, annualTaxableIncome: 12000 } as any);
    expect(find(r.employeeDeductions, 'FED_INCOME_TAX').amount).toBe(0);
  });

  it('federal tax is progressive: $60k annual lands across three brackets', () => {
    // taxable = 60000 - 14600 = 45400 → 11600*10% + 33800*12% = 1160 + 4056 = 5216/yr
    const r = service.calculateStatutory({ grossMonthly: 5000, annualTaxableIncome: 60000 } as any);
    expect(find(r.employeeDeductions, 'FED_INCOME_TAX').amount).toBeCloseTo(5216 / 12, 2);
  });

  it('social security is capped at the monthly wage-base equivalent, employee = employer', () => {
    // monthly cap = 168600/12 = 14050 → SS = 14050 * 6.2% = 871.10 despite 50k gross
    const r = service.calculateStatutory({ grossMonthly: 50000, annualTaxableIncome: 600000 } as any);
    expect(find(r.employeeDeductions, 'SS_EMPLOYEE').amount).toBe(871.1);
    expect(find(r.employerContributions, 'SS_EMPLOYER').amount).toBe(871.1);
  });

  it('additional 0.9% Medicare applies only above $200k annual', () => {
    const below = service.calculateStatutory({ grossMonthly: 10000, annualTaxableIncome: 150000 } as any);
    expect(find(below.employeeDeductions, 'ADDITIONAL_MEDICARE')).toBeUndefined();

    const above = service.calculateStatutory({ grossMonthly: 25000, annualTaxableIncome: 300000 } as any);
    // (300000-200000) * 0.9% / 12 = 75/month
    expect(find(above.employeeDeductions, 'ADDITIONAL_MEDICARE').amount).toBe(75);
    // employer does NOT match the additional Medicare
    expect(find(above.employerContributions, 'ADDITIONAL_MEDICARE')).toBeUndefined();
  });

  it('FUTA applies only to the first $7,000 of annual wages', () => {
    const early = service.calculateStatutory({ grossMonthly: 3000, annualTaxableIncome: 3000 } as any);
    expect(find(early.employerContributions, 'FUTA').amount).toBe(18); // 3000 * 0.6%

    const past = service.calculateStatutory({ grossMonthly: 3000, annualTaxableIncome: 60000 } as any);
    expect(find(past.employerContributions, 'FUTA').amount).toBe(0); // base long exceeded
  });

  it('FUTA prorates the month that crosses the $7,000 base', () => {
    // prior wages = 6000, this month 3000 → only 1000 still FUTA-able → 6.00
    const r = service.calculateStatutory({ grossMonthly: 3000, annualTaxableIncome: 9000 } as any);
    expect(find(r.employerContributions, 'FUTA').amount).toBe(6);
  });
});
