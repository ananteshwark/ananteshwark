import { apiClient } from './client';

export const taxApi = {
  listCodes: () => apiClient.get('/finance/tax/codes'),
  createCode: (data: any) => apiClient.post('/finance/tax/codes', data),
  updateCode: (id: string, data: any) => apiClient.patch(`/finance/tax/codes/${id}`, data),
  deleteCode: (id: string) => apiClient.delete(`/finance/tax/codes/${id}`),
  calculate: (id: string, baseAmount: number) =>
    apiClient.get(`/finance/tax/codes/${id}/calculate`, { params: { baseAmount } }),
  report: (params: any) => apiClient.get('/finance/tax/report', { params }),
};
