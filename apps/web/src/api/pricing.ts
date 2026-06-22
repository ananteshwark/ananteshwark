import { apiClient } from './client';

export const pricingApi = {
  list: () => apiClient.get('/sales/pricing-conditions'),
  create: (data: any) => apiClient.post('/sales/pricing-conditions', data),
  update: (id: string, data: any) => apiClient.patch(`/sales/pricing-conditions/${id}`, data),
  remove: (id: string) => apiClient.delete(`/sales/pricing-conditions/${id}`),
  preview: (data: any) => apiClient.post('/sales/pricing-conditions/preview', data),
};
