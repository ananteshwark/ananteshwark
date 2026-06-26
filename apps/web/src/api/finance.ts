import { apiClient } from './client';

// Chart of Accounts
export const financeApi = {
  // GL Accounts
  getAccounts: (params?: any) => apiClient.get('/finance/accounts', { params }),
  getAccountTree: () => apiClient.get('/finance/accounts/tree'),
  createAccount: (data: any) => apiClient.post('/finance/accounts', data),
  updateAccount: (id: string, data: any) => apiClient.patch(`/finance/accounts/${id}`, data),

  // Journal Entries
  getJournalEntries: (params?: any) => apiClient.get('/finance/journal-entries', { params }),
  getJournalEntry: (id: string) => apiClient.get(`/finance/journal-entries/${id}`),
  createJournalEntry: (data: any) => apiClient.post('/finance/journal-entries', data),
  updateJournalEntry: (id: string, data: any) => apiClient.patch(`/finance/journal-entries/${id}`, data),
  postJournalEntry: (id: string) => apiClient.post(`/finance/journal-entries/${id}/post`),
  reverseJournalEntry: (id: string) => apiClient.post(`/finance/journal-entries/${id}/reverse`),
  deleteJournalEntry: (id: string) => apiClient.delete(`/finance/journal-entries/${id}`),

  // Vendors
  getVendors: (params?: any) => apiClient.get('/finance/ap/vendors', { params }),
  getVendor: (id: string) => apiClient.get(`/finance/ap/vendors/${id}`),
  createVendor: (data: any) => apiClient.post('/finance/ap/vendors', data),
  updateVendor: (id: string, data: any) => apiClient.patch(`/finance/ap/vendors/${id}`, data),
  getVendorSummary: (id: string) => apiClient.get(`/finance/ap/vendors/${id}/summary`),

  // Bills
  getBills: (params?: any) => apiClient.get('/finance/ap/bills', { params }),
  getBill: (id: string) => apiClient.get(`/finance/ap/bills/${id}`),
  createBill: (data: any) => apiClient.post('/finance/ap/bills', data),
  updateBill: (id: string, data: any) => apiClient.patch(`/finance/ap/bills/${id}`, data),
  postBill: (id: string) => apiClient.post(`/finance/ap/bills/${id}/post`),
  voidBill: (id: string) => apiClient.post(`/finance/ap/bills/${id}/void`),

  // Phase 99: AP Invoice Holds
  listApHolds: (params?: { billId?: string; status?: string }) => apiClient.get('/finance/ap/holds', { params }),
  placeApHold: (data: { billId: string; holdType: string; reason: string }) => apiClient.post('/finance/ap/holds', data),
  releaseApHold: (id: string, releaseReason: string) => apiClient.post(`/finance/ap/holds/${id}/release`, { releaseReason }),

  // Phase 109-111: Collections Workbench
  getCollectionsWorkbench: (asOf?: string) => apiClient.get('/finance/collections/workbench', { params: asOf ? { asOf } : {} }),
  getCollectionsCustomer: (id: string, asOf?: string) => apiClient.get(`/finance/collections/customers/${id}`, { params: asOf ? { asOf } : {} }),
  addCollectionNote: (data: any) => apiClient.post('/finance/collections/notes', data),
  listPromises: (params?: { customerId?: string; status?: string }) => apiClient.get('/finance/collections/promises', { params }),
  createPromise: (data: any) => apiClient.post('/finance/collections/promises', data),
  resolvePromise: (id: string, data: { status: string; amountKept?: number }) => apiClient.patch(`/finance/collections/promises/${id}/resolve`, data),
  sweepBrokenPromises: (asOf?: string) => apiClient.post('/finance/collections/promises/sweep-broken', { asOf }),
  listDisputes: (params?: { customerId?: string; invoiceId?: string; status?: string }) => apiClient.get('/finance/collections/disputes', { params }),
  raiseDispute: (data: any) => apiClient.post('/finance/collections/disputes', data),
  updateDispute: (id: string, data: any) => apiClient.patch(`/finance/collections/disputes/${id}`, data),

  // Phase 103-105: Withholding Tax (TDS)
  listWhtCodes: () => apiClient.get('/finance/ap/wht/codes'),
  createWhtCode: (data: any) => apiClient.post('/finance/ap/wht/codes', data),
  updateWhtCode: (id: string, data: any) => apiClient.patch(`/finance/ap/wht/codes/${id}`, data),
  deleteWhtCode: (id: string) => apiClient.post(`/finance/ap/wht/codes/${id}/delete`),
  computeWht: (data: { whtCodeId: string; grossAmount: number }) => apiClient.post('/finance/ap/wht/compute', data),
  listWhtCertificates: (vendorId?: string) => apiClient.get('/finance/ap/wht/certificates', { params: vendorId ? { vendorId } : {} }),
  generateWhtCertificate: (data: any) => apiClient.post('/finance/ap/wht/certificates/generate', data),

  // Customers
  getCustomers: (params?: any) => apiClient.get('/finance/ar/customers', { params }),
  getCustomer: (id: string) => apiClient.get(`/finance/ar/customers/${id}`),
  createCustomer: (data: any) => apiClient.post('/finance/ar/customers', data),
  updateCustomer: (id: string, data: any) => apiClient.patch(`/finance/ar/customers/${id}`, data),

  // Invoices
  getInvoices: (params?: any) => apiClient.get('/finance/ar/invoices', { params }),
  getInvoice: (id: string) => apiClient.get(`/finance/ar/invoices/${id}`),
  createInvoice: (data: any) => apiClient.post('/finance/ar/invoices', data),
  updateInvoice: (id: string, data: any) => apiClient.patch(`/finance/ar/invoices/${id}`, data),
  postInvoice: (id: string) => apiClient.post(`/finance/ar/invoices/${id}/post`),
  voidInvoice: (id: string) => apiClient.post(`/finance/ar/invoices/${id}/void`),

  // Bank
  getBankAccounts: (params?: any) => apiClient.get('/finance/bank/accounts', { params }),
  createBankAccount: (data: any) => apiClient.post('/finance/bank/accounts', data),
  getTransactions: (params?: any) => apiClient.get('/finance/bank/transactions', { params }),

  // Fixed Assets
  getAssetCategories: (params?: any) => apiClient.get('/finance/fixed-assets/categories', { params }),
  createAssetCategory: (data: any) => apiClient.post('/finance/fixed-assets/categories', data),
  getFixedAssets: (params?: any) => apiClient.get('/finance/fixed-assets', { params }),
  getFixedAsset: (id: string) => apiClient.get(`/finance/fixed-assets/${id}`),
  createFixedAsset: (data: any) => apiClient.post('/finance/fixed-assets', data),
  updateFixedAsset: (id: string, data: any) => apiClient.patch(`/finance/fixed-assets/${id}`, data),
  disposeAsset: (id: string, data: any) => apiClient.post(`/finance/fixed-assets/${id}/dispose`, data),
  getAssetSchedule: (id: string) => apiClient.get(`/finance/fixed-assets/${id}/schedule`),
  getDepreciationRuns: (params?: any) => apiClient.get('/finance/fixed-assets/depreciation-runs', { params }),
  runDepreciation: (data: any) => apiClient.post('/finance/fixed-assets/depreciation-runs', data),
  postDepreciationRun: (id: string) => apiClient.post(`/finance/fixed-assets/depreciation-runs/${id}/post`),
  getRunLines: (id: string) => apiClient.get(`/finance/fixed-assets/depreciation-runs/${id}/lines`),

  // Currencies & Exchange Rates
  getCurrencies: (params?: any) => apiClient.get('/finance/currencies', { params }),
  createCurrency: (data: any) => apiClient.post('/finance/currencies', data),
  updateCurrency: (id: string, data: any) => apiClient.patch(`/finance/currencies/${id}`, data),
  getExchangeRates: (params?: any) => apiClient.get('/finance/currencies/rates', { params }),
  upsertExchangeRate: (data: any) => apiClient.post('/finance/currencies/rates', data),
  deleteExchangeRate: (id: string) => apiClient.delete(`/finance/currencies/rates/${id}`),
  runRevaluation: (data: { year: number; month: number }) => apiClient.post('/finance/currencies/revalue', data),

  // Reports
  getTrialBalance: (params?: any) => apiClient.get('/finance/reports/trial-balance', { params }),
  getProfitLoss: (params?: any) => apiClient.get('/finance/reports/profit-loss', { params }),
  getBalanceSheet: (params?: any) => apiClient.get('/finance/reports/balance-sheet', { params }),
  getGlDetail: (params?: any) => apiClient.get('/finance/reports/gl-detail', { params }),
  getCashFlow: (params?: any) => apiClient.get('/finance/reports/cash-flow', { params }),

  // Phase 74: Internal Orders + CO-PA
  getInternalOrders: () => apiClient.get('/finance/controlling/internal-orders'),
  getInternalOrder: (id: string) => apiClient.get(`/finance/controlling/internal-orders/${id}`),
  createInternalOrder: (data: any) => apiClient.post('/finance/controlling/internal-orders', data),
  updateInternalOrder: (id: string, data: any) => apiClient.patch(`/finance/controlling/internal-orders/${id}`, data),
  releaseInternalOrder: (id: string) => apiClient.post(`/finance/controlling/internal-orders/${id}/release`),
  getInternalOrderActuals: (id: string) => apiClient.get(`/finance/controlling/internal-orders/${id}/actuals`),
  settleInternalOrder: (id: string) => apiClient.post(`/finance/controlling/internal-orders/${id}/settle`),
  getCopaReport: (from: string, to: string) => apiClient.get('/finance/controlling/copa-report', { params: { from, to } }),

  // Phase 72: Document Splitting
  getSplittingRules: () => apiClient.get('/finance/splitting-rules'),
  createSplittingRule: (data: any) => apiClient.post('/finance/splitting-rules', data),
  updateSplittingRule: (id: string, data: any) => apiClient.patch(`/finance/splitting-rules/${id}`, data),
  applySplitting: (journalEntryId: string) => apiClient.post(`/finance/journal-entries/${journalEntryId}/apply-splitting`),
  getSegmentTrialBalance: (params: { from: string; to: string; ledgerCode?: string }) =>
    apiClient.get('/finance/segment-trial-balance', { params }),

  // Phase 76: Recurring Journals
  getRecurringJournals: () => apiClient.get('/finance/recurring-journals'),
  createRecurringJournal: (data: any) => apiClient.post('/finance/recurring-journals', data),
  updateRecurringJournal: (id: string, data: any) => apiClient.patch(`/finance/recurring-journals/${id}`, data),
  runRecurringJournals: (asOfDate?: string) => apiClient.post('/finance/recurring-journals/run', { asOfDate }),

  // Phase 76: Accrual Engine
  getAccrualConfigs: () => apiClient.get('/finance/accrual-configs'),
  createAccrualConfig: (data: any) => apiClient.post('/finance/accrual-configs', data),
  updateAccrualConfig: (id: string, data: any) => apiClient.patch(`/finance/accrual-configs/${id}`, data),
  postAccrual: (id: string, period: string) => apiClient.post(`/finance/accrual-configs/${id}/post`, { period }),

  // Periods list
  getPeriods: (params?: any) => apiClient.get('/finance/periods', { params }),

  // Phase 76: Period-Close Cockpit
  getPeriodCloseCockpit: (periodId: string) => apiClient.get(`/finance/periods/${periodId}/close-cockpit`),

  // Phase 77: Treasury & Cash Management
  getCashPositions: (params?: any) => apiClient.get('/finance/treasury/cash-positions', { params }),
  createCashPosition: (data: any) => apiClient.post('/finance/treasury/cash-positions', data),
  getCashPositionSummary: (date: string) => apiClient.get('/finance/treasury/cash-positions/summary', { params: { date } }),
  getGuarantees: (params?: any) => apiClient.get('/finance/treasury/guarantees', { params }),
  createGuarantee: (data: any) => apiClient.post('/finance/treasury/guarantees', data),
  updateGuaranteeStatus: (id: string, data: any) => apiClient.patch(`/finance/treasury/guarantees/${id}/status`, data),
  getInstruments: (params?: any) => apiClient.get('/finance/treasury/instruments', { params }),
  createInstrument: (data: any) => apiClient.post('/finance/treasury/instruments', data),
  accrueInstrumentInterest: (id: string) => apiClient.post(`/finance/treasury/instruments/${id}/accrue`),
  redeemInstrument: (id: string) => apiClient.post(`/finance/treasury/instruments/${id}/redeem`),
  getLiquidityForecast: (params: any) => apiClient.get('/finance/treasury/liquidity-forecast', { params }),
  getSweepRules: () => apiClient.get('/finance/treasury/sweep-rules'),
  createSweepRule: (data: any) => apiClient.post('/finance/treasury/sweep-rules', data),
  updateSweepRule: (id: string, data: any) => apiClient.patch(`/finance/treasury/sweep-rules/${id}`, data),
  executeSweep: (id: string) => apiClient.post(`/finance/treasury/sweep-rules/${id}/execute`),
  getSweepLogs: (params?: any) => apiClient.get('/finance/treasury/sweep-logs', { params }),

  // Phase 79: Activity Types + Overhead Costing
  getActivityTypes: () => apiClient.get('/finance/controlling/activity-types'),
  createActivityType: (data: any) => apiClient.post('/finance/controlling/activity-types', data),
  updateActivityType: (id: string, data: any) => apiClient.patch(`/finance/controlling/activity-types/${id}`, data),
  getActivityPrices: (fiscalYear?: number) => apiClient.get('/finance/controlling/activity-prices', { params: fiscalYear ? { fiscalYear } : {} }),
  setActivityPrice: (data: any) => apiClient.post('/finance/controlling/activity-prices', data),
  confirmActivity: (data: any) => apiClient.post('/finance/controlling/activity-confirmations', data),
  getOverheadSheets: () => apiClient.get('/finance/controlling/overhead-sheets'),
  createOverheadSheet: (data: any) => apiClient.post('/finance/controlling/overhead-sheets', data),
  updateOverheadSheet: (id: string, data: any) => apiClient.patch(`/finance/controlling/overhead-sheets/${id}`, data),
  applyOverheadToOrder: (sheetId: string, data: any) => apiClient.post(`/finance/controlling/overhead-sheets/${sheetId}/apply`, data),

  // Phase 83: Parallel ledgers
  getLedgers: () => apiClient.get('/finance/ledgers'),
  createLedger: (data: any) => apiClient.post('/finance/ledgers', data),
  updateLedger: (id: string, data: any) => apiClient.patch(`/finance/ledgers/${id}`, data),
  seedDefaultLedgers: () => apiClient.post('/finance/ledgers/seed-defaults'),
  getLedgerGroups: () => apiClient.get('/finance/ledgers/groups'),
  getLedgerGroup: (code: string) => apiClient.get(`/finance/ledgers/groups/${code}`),
  createLedgerGroup: (data: any) => apiClient.post('/finance/ledgers/groups', data),
  updateLedgerGroup: (id: string, data: any) => apiClient.patch(`/finance/ledgers/groups/${id}`, data),
  getLedgerPostingRules: () => apiClient.get('/finance/ledgers/posting-rules'),
  upsertLedgerPostingRule: (data: any) => apiClient.post('/finance/ledgers/posting-rules', data),
  getLedgerTrialBalance: (ledgerCode: string, params?: any) =>
    apiClient.get(`/finance/ledgers/${ledgerCode}/trial-balance`, { params }),
  getLedgerReconciliation: (groupCode: string, params?: any) =>
    apiClient.get(`/finance/ledgers/groups/${groupCode}/reconciliation`, { params }),
  getLedgerGroupCloseCockpit: (groupCode: string, periodId: string) =>
    apiClient.get(`/finance/ledgers/groups/${groupCode}/close-cockpit/${periodId}`),

  // Phase 85: Cash discounts / payment terms
  getPaymentTerms: (params?: any) => apiClient.get('/finance/cash-discount/payment-terms', { params }),
  getPaymentTerm: (id: string) => apiClient.get(`/finance/cash-discount/payment-terms/${id}`),
  createPaymentTerm: (data: any) => apiClient.post('/finance/cash-discount/payment-terms', data),
  updatePaymentTerm: (id: string, data: any) => apiClient.patch(`/finance/cash-discount/payment-terms/${id}`, data),
  deletePaymentTerm: (id: string) => apiClient.delete(`/finance/cash-discount/payment-terms/${id}`),
  seedDefaultPaymentTerms: () => apiClient.post('/finance/cash-discount/payment-terms/seed-defaults'),
  computeCashDiscount: (data: any) => apiClient.post('/finance/cash-discount/compute', data),
  getCashDiscountRecords: (params?: any) => apiClient.get('/finance/cash-discount/records', { params }),
  getCashDiscountUtilization: (params?: any) => apiClient.get('/finance/cash-discount/utilization', { params }),

  // Phase 93–95: Subledger Accounting Engine (SLA)
  listSlaRules: (eventClass?: string) => apiClient.get('/finance/sla/rules', { params: eventClass ? { eventClass } : {} }),
  getSlaRule: (id: string) => apiClient.get(`/finance/sla/rules/${id}`),
  createSlaRule: (data: any) => apiClient.post('/finance/sla/rules', data),
  updateSlaRule: (id: string, data: any) => apiClient.patch(`/finance/sla/rules/${id}`, data),
  deleteSlaRule: (id: string) => apiClient.delete(`/finance/sla/rules/${id}`),
  deriveAccount: (data: { eventClass: string; lineType: string; eventContext: Record<string, any> }) =>
    apiClient.post('/finance/sla/derive-account', data),
  getSlaAuditTrail: (params?: { sourceDocumentId?: string; journalEntryId?: string; eventClass?: string; limit?: number }) =>
    apiClient.get('/finance/sla/audit-trail', { params }),

  // Phase 96–98: COA Structure (segments, trees, cross-validation)
  listSegments: () => apiClient.get('/finance/coa/segments'),
  createSegment: (data: any) => apiClient.post('/finance/coa/segments', data),
  updateSegment: (id: string, data: any) => apiClient.patch(`/finance/coa/segments/${id}`, data),
  deleteSegment: (id: string) => apiClient.delete(`/finance/coa/segments/${id}`),
  listSegmentValues: (segmentId: string) => apiClient.get(`/finance/coa/segments/${segmentId}/values`),
  createSegmentValue: (data: any) => apiClient.post('/finance/coa/segment-values', data),
  deleteSegmentValue: (id: string) => apiClient.delete(`/finance/coa/segment-values/${id}`),
  validateAccountCode: (code: string) => apiClient.post('/finance/coa/validate-code', { code }),
  listTrees: () => apiClient.get('/finance/coa/trees'),
  createTree: (data: any) => apiClient.post('/finance/coa/trees', data),
  deleteTree: (id: string) => apiClient.delete(`/finance/coa/trees/${id}`),
  getTreeStructure: (id: string) => apiClient.get(`/finance/coa/trees/${id}/structure`),
  addTreeNode: (treeId: string, data: any) => apiClient.post(`/finance/coa/trees/${treeId}/nodes`, data),
  deleteTreeNode: (id: string) => apiClient.delete(`/finance/coa/tree-nodes/${id}`),
  listCrossValidationRules: () => apiClient.get('/finance/coa/cross-validation-rules'),
  createCrossValidationRule: (data: any) => apiClient.post('/finance/coa/cross-validation-rules', data),
  deleteCrossValidationRule: (id: string) => apiClient.delete(`/finance/coa/cross-validation-rules/${id}`),
  validateCombination: (code: string) => apiClient.post('/finance/coa/validate-combination', { code }),
};
