import { apiClient } from './client';

export const incentiveApi = {
  listPlans: () => apiClient.get('/sales/incentive/plans'),
  createPlan: (data: any) => apiClient.post('/sales/incentive/plans', data),
  calculate: (data: any) => apiClient.post('/sales/incentive/calculate', data),
  listTransactions: (params?: { repId?: string; period?: string; status?: string }) => apiClient.get('/sales/incentive/transactions', { params }),
  approve: (id: string) => apiClient.post(`/sales/incentive/transactions/${id}/approve`),
  raiseDispute: (data: any) => apiClient.post('/sales/incentive/disputes', data),
  resolveDispute: (id: string, data: any) => apiClient.post(`/sales/incentive/disputes/${id}/resolve`, data),
  payrollExport: (period: string) => apiClient.post('/sales/incentive/payroll-export', { period }),
};
