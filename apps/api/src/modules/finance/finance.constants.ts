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
};
