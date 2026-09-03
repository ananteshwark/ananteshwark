export interface TaxCalculationInput {
  grossMonthly: number;
  basicMonthly: number;
  annualTaxableIncome: number;
  state?: string;
  country: string;
  employeeData?: Record<string, any>;
}

export interface TaxCalculationResult {
  employeeDeductions: Array<{ code: string; name: string; amount: number }>;
  employerContributions: Array<{ code: string; name: string; amount: number }>;
  netPay: number;
}

export interface LocalizationPack {
  country: string; // 'IN', 'US', 'AE'
  name: string;
  calculateStatutory(input: TaxCalculationInput): TaxCalculationResult;
  getComplianceCalendarItems(month: number, year: number): Array<{ title: string; dueDate: string; type: string }>;
}
