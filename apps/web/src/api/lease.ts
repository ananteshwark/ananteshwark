import { apiClient } from './client';

const BASE = '/finance/leases';

export const leaseApi = {
  list: (params?: { status?: string }) => apiClient.get(BASE, { params: params ?? {} }),
  get: (id: string) => apiClient.get(`${BASE}/${id}`),
  create: (data: any) => apiClient.post(BASE, data),
  postPeriods: (data: { periodEnd: string; leaseId?: string }) =>
    apiClient.post(`${BASE}/post-periods`, data),
  portfolio: () => apiClient.get(`${BASE}/portfolio`),
  maturity: () => apiClient.get(`${BASE}/maturity`),
};
