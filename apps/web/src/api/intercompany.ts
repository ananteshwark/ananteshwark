import { apiClient } from './client';

export const intercompanyApi = {
  // Relationships
  listRelationships: () => apiClient.get('/finance/intercompany/relationships'),
  createRelationship: (data: any) =>
    apiClient.post('/finance/intercompany/relationships', data),
  updateRelationship: (id: string, data: any) =>
    apiClient.patch(`/finance/intercompany/relationships/${id}`, data),

  // Transactions
  listTransactions: (params?: { entityId?: string; status?: string }) =>
    apiClient.get('/finance/intercompany/transactions', { params: params ?? {} }),
  getTransaction: (id: string) =>
    apiClient.get(`/finance/intercompany/transactions/${id}`),
  createTransaction: (data: any) =>
    apiClient.post('/finance/intercompany/transactions', data),
  postTransaction: (id: string) =>
    apiClient.post(`/finance/intercompany/transactions/${id}/post`, {}),
  eliminateTransaction: (id: string) =>
    apiClient.post(`/finance/intercompany/transactions/${id}/eliminate`, {}),

  // Reconciliation
  reconciliation: () => apiClient.get('/finance/intercompany/reconciliation'),
};
