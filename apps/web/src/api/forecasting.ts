import { apiClient } from './client';

export const forecastingApi = {
  assignCategory: (data: any) => apiClient.post('/crm/forecasting/categories', data),
  listCategories: (period: string) => apiClient.get('/crm/forecasting/categories', { params: { period } }),
  rollup: (period: string) => apiClient.get('/crm/forecasting/rollup', { params: { period } }),
  setOverride: (data: any) => apiClient.post('/crm/forecasting/override', data),
  snapshot: (period: string, snapshotDate: string) => apiClient.post('/crm/forecasting/snapshot', { period, snapshotDate }),
  accuracy: (period: string) => apiClient.get('/crm/forecasting/accuracy', { params: { period } }),
  winRate: (period?: string) => apiClient.get('/crm/forecasting/win-rate', { params: period ? { period } : {} }),
};
