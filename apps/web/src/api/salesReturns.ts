import { apiClient } from './client';

export const salesReturnsApi = {
  // Return orders
  listReturns: (params?: { customerId?: string; status?: string }) =>
    apiClient.get('/sales/returns', { params }),
  getReturn: (id: string) => apiClient.get(`/sales/returns/${id}`),
  createReturn: (data: any) => apiClient.post('/sales/returns', data),
  receiveReturn: (id: string) => apiClient.post(`/sales/returns/${id}/receive`),
  cancelReturn: (id: string) => apiClient.post(`/sales/returns/${id}/cancel`),

  // Credit notes
  listCreditNotes: (params?: { customerId?: string; status?: string }) =>
    apiClient.get('/sales/credit-notes', { params }),
  createCreditNote: (data: any) => apiClient.post('/sales/credit-notes', data),
  issueCreditNote: (id: string) => apiClient.post(`/sales/credit-notes/${id}/issue`),
  applyCreditNote: (id: string, invoiceId: string) =>
    apiClient.post(`/sales/credit-notes/${id}/apply`, { invoiceId }),
};
