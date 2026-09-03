import { apiClient } from './client';

export const territoriesApi = {
  list: () => apiClient.get('/crm/territories'),
  create: (data: any) => apiClient.post('/crm/territories', data),
  update: (id: string, data: any) => apiClient.patch(`/crm/territories/${id}`, data),
  match: (params: { accountId?: string; region?: string; industry?: string }) => apiClient.get('/crm/territories/match', { params }),
  setQuota: (data: any) => apiClient.post('/crm/territories/quotas', data),
  listQuotas: (period: string) => apiClient.get('/crm/territories/quotas', { params: { period } }),
  attainment: (period: string, repId?: string) => apiClient.get('/crm/territories/attainment', { params: repId ? { period, repId } : { period } }),
};
