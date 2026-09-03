import { apiClient } from './client';

export const atpApi = {
  check: (data: any) => apiClient.post('/sales/atp/check', data),
  getDashboard: () => apiClient.get('/sales/atp/dashboard'),
};
