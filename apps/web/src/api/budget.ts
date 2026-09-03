import { apiClient } from './client';

export const budgetApi = {
  vsActual: (params: { fiscalYear: number; period?: string; costCenterId?: string }) =>
    apiClient.get('/finance/budget/vs-actual', { params }),
  check: (data: any) => apiClient.post('/finance/budget/check', data),
  listLines: (fiscalYear?: number) =>
    apiClient.get('/finance/budget/lines', { params: fiscalYear ? { fiscalYear } : {} }),
  createLine: (data: any) => apiClient.post('/finance/budget/lines', data),
  updateLine: (id: string, data: any) => apiClient.patch(`/finance/budget/lines/${id}`, data),
  deleteLine: (id: string) => apiClient.delete(`/finance/budget/lines/${id}`),
  listAccounts: () => apiClient.get('/finance/accounts', { params: { limit: 500 } }),
  listCostCenters: () => apiClient.get('/finance/cost-centers'),
};
