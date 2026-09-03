import { apiClient } from './client';

export const creditApi = {
  getReport: () => apiClient.get('/sales/customers/credit-report'),
  updateSettings: (id: string, data: any) => apiClient.patch(`/sales/customers/${id}/credit-settings`, data),
  recalculate: (id: string) => apiClient.post(`/sales/customers/${id}/recalculate-exposure`),
};
