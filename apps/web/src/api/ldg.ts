import { apiClient } from './client';

export const ldgApi = {
  list: () => apiClient.get('/payroll/ldg'),
  resolve: (countryCode: string) => apiClient.get('/payroll/ldg/resolve', { params: { countryCode } }),
  create: (data: any) => apiClient.post('/payroll/ldg', data),
  update: (id: string, data: any) => apiClient.patch(`/payroll/ldg/${id}`, data),
  seedDefaults: () => apiClient.post('/payroll/ldg/seed-defaults'),
};
