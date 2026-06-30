import { apiClient } from './client';

export const spendAnalysisApi = {
  upsertSpend: (data: any) => apiClient.post('/procurement/spend-analysis/spend', data),
  rebuild: () => apiClient.post('/procurement/spend-analysis/rebuild'),
  cube: (groupBy?: string, period?: string) => apiClient.get('/procurement/spend-analysis/cube', { params: { groupBy, period } }),
  logSavings: (data: any) => apiClient.post('/procurement/spend-analysis/savings', data),
  savings: (period?: string) => apiClient.get('/procurement/spend-analysis/savings', { params: period ? { period } : {} }),
  maverick: (approvedVendorIds: string[]) => apiClient.post('/procurement/spend-analysis/maverick', { approvedVendorIds }),
};
