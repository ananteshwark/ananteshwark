import { apiClient } from './client';

export const advancesApi = {
  listVendor: (vendorId?: string) =>
    apiClient.get('/finance/advances/vendor', { params: vendorId ? { vendorId } : {} }),
  createVendor: (data: any) => apiClient.post('/finance/advances/vendor', data),
  payVendor: (id: string, data: any) => apiClient.post(`/finance/advances/vendor/${id}/pay`, data),
  clearVendor: (id: string, data: any) => apiClient.post(`/finance/advances/vendor/${id}/clear`, data),
  listCustomer: (customerId?: string) =>
    apiClient.get('/finance/advances/customer', { params: customerId ? { customerId } : {} }),
  createCustomer: (data: any) => apiClient.post('/finance/advances/customer', data),
  clearCustomer: (id: string, data: any) =>
    apiClient.post(`/finance/advances/customer/${id}/clear`, data),
  aging: () => apiClient.get('/finance/advances/aging'),
};
