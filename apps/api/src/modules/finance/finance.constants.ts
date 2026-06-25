/**
 * Default account codes used by the seeded chart of accounts. Sub-ledgers
 * (AP/AR/Bank) fall back to these when a specific control account is not set
 * on the vendor/customer/bank-account record.
 */
export const DEFAULT_ACCOUNT_CODES = {
  CASH: '1000',
  BANK: '1010',
  AR_CONTROL: '1100',
  INVENTORY: '1200',
  FIXED_ASSETS: '1500',
  AP_CONTROL: '2000',
  TAX_PAYABLE: '2100',
  SALES_REVENUE: '4000',
  COGS: '5000',
  // Payroll (Phase 4)
  PF_PAYABLE: '2110',
  ESI_PAYABLE: '2120',
  PT_PAYABLE: '2130',
  TDS_PAYABLE: '2140',
  SALARIES_PAYABLE: '2150',
  SALARY_EXPENSE: '6000',
  EMPLOYER_PF_EXPENSE: '6010',
  EMPLOYER_ESI_EXPENSE: '6020',
  // FX revaluation
  FX_GAIN: '7000',
  FX_LOSS: '7010',
  // Cash discounts (Phase 85)
  CASH_DISCOUNT_RECEIVED: '7100', // AP early-payment discount taken (other income)
  CASH_DISCOUNT_GRANTED: '7110', // AR early-payment discount granted (expense)
  // Revenue recognition (Phase 87) — IFRS 15 / ASC 606
  DEFERRED_REVENUE: '2200', // contract liability: billed-but-unrecognised revenue
  CONTRACT_ASSET: '1150', // unbilled receivable: recognised-but-unbilled revenue
  // Lease accounting (Phase 88) — IFRS 16
  ROU_ASSET: '1600', // right-of-use asset
  ACCUM_AMORT_ROU: '1610', // accumulated amortisation on ROU asset (contra)
  LEASE_LIABILITY: '2300', // lease liability
  LEASE_AMORT_EXPENSE: '6100', // ROU amortisation expense
  INTEREST_EXPENSE: '7200', // interest on lease liability (unwinding of discount)
};
