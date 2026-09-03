import { apiClient } from './client';

const BASE = '/finance/revenue-recognition';

export const revenueRecognitionApi = {
  // Contracts
  listContracts: (params?: { status?: string; customerId?: string }) =>
    apiClient.get(`${BASE}/contracts`, { params: params ?? {} }),
  getContract: (id: string) => apiClient.get(`${BASE}/contracts/${id}`),
  createContract: (data: any) => apiClient.post(`${BASE}/contracts`, data),

  // Obligations
  fulfillObligation: (id: string, fulfilledDate?: string) =>
    apiClient.post(`${BASE}/obligations/${id}/fulfill`, { fulfilledDate }),

  // Recognition
  recognize: (data: { periodEnd: string; contractId?: string }) =>
    apiClient.post(`${BASE}/recognize`, data),

  // Reporting
  waterfall: () => apiClient.get(`${BASE}/waterfall`),
};
