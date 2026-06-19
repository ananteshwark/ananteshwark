import { apiClient } from './client';

// Chart of Accounts
export const financeApi = {
  // GL Accounts
  getAccounts: (params?: any) => apiClient.get('/finance/gl/accounts', { params }),
  getAccountTree: () => apiClient.get('/finance/gl/accounts/tree'),
  createAccount: (data: any) => apiClient.post('/finance/gl/accounts', data),
  updateAccount: (id: string, data: any) => apiClient.patch(`/finance/gl/accounts/${id}`, data),

  // Journal Entries
  getJournalEntries: (params?: any) => apiClient.get('/finance/gl/journal-entries', { params }),
  getJournalEntry: (id: string) => apiClient.get(`/finance/gl/journal-entries/${id}`),
  createJournalEntry: (data: any) => apiClient.post('/finance/gl/journal-entries', data),
  updateJournalEntry: (id: string, data: any) => apiClient.patch(`/finance/gl/journal-entries/${id}`, data),
  postJournalEntry: (id: string) => apiClient.post(`/finance/gl/journal-entries/${id}/post`),
  reverseJournalEntry: (id: string) => apiClient.post(`/finance/gl/journal-entries/${id}/reverse`),
  deleteJournalEntry: (id: string) => apiClient.delete(`/finance/gl/journal-entries/${id}`),

  // Vendors
  getVendors: (params?: any) => apiClient.get('/finance/ap/vendors', { params }),
  getVendor: (id: string) => apiClient.get(`/finance/ap/vendors/${id}`),
  createVendor: (data: any) => apiClient.post('/finance/ap/vendors', data),
  updateVendor: (id: string, data: any) => apiClient.patch(`/finance/ap/vendors/${id}`, data),

  // Bills
  getBills: (params?: any) => apiClient.get('/finance/ap/bills', { params }),
  getBill: (id: string) => apiClient.get(`/finance/ap/bills/${id}`),
  createBill: (data: any) => apiClient.post('/finance/ap/bills', data),
  updateBill: (id: string, data: any) => apiClient.patch(`/finance/ap/bills/${id}`, data),
  postBill: (id: string) => apiClient.post(`/finance/ap/bills/${id}/post`),
  voidBill: (id: string) => apiClient.post(`/finance/ap/bills/${id}/void`),

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

  // Reports
  getTrialBalance: (params?: any) => apiClient.get('/finance/reports/trial-balance', { params }),
  getProfitLoss: (params?: any) => apiClient.get('/finance/reports/profit-loss', { params }),
  getBalanceSheet: (params?: any) => apiClient.get('/finance/reports/balance-sheet', { params }),
  getGlDetail: (params?: any) => apiClient.get('/finance/reports/gl-detail', { params }),
  getCashFlow: (params?: any) => apiClient.get('/finance/reports/cash-flow', { params }),
};
