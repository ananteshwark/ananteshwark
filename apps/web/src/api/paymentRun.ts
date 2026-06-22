import { apiClient } from './client';

export const paymentRunApi = {
  list: () => apiClient.get('/finance/payment-runs'),
  create: (data: { dueByDate: string; paymentMethod: string; bankAccountId?: string }) =>
    apiClient.post('/finance/payment-runs', data),
  get: (id: string) => apiClient.get(`/finance/payment-runs/${id}`),
  toggleItem: (itemId: string, included: boolean) =>
    apiClient.patch(`/finance/payment-runs/items/${itemId}`, { included }),
  approve: (id: string) => apiClient.post(`/finance/payment-runs/${id}/approve`),
  post: (id: string) => apiClient.post(`/finance/payment-runs/${id}/post`),
  bankFileUrl: (id: string) => `/finance/payment-runs/${id}/bank-file`,
};
