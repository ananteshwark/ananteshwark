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

  // Transfer Pricing (Phase 86)
  listTransferPrices: (params?: { sellingEntityId?: string; buyingEntityId?: string; itemCode?: string }) =>
    apiClient.get('/finance/intercompany/transfer-prices', { params: params ?? {} }),
  createTransferPrice: (data: any) =>
    apiClient.post('/finance/intercompany/transfer-prices', data),
  updateTransferPrice: (id: string, data: any) =>
    apiClient.patch(`/finance/intercompany/transfer-prices/${id}`, data),
  resolveTransferPrice: (data: any) =>
    apiClient.post('/finance/intercompany/transfer-prices/resolve', data),

  // IC Billing + Eliminations (Phase 86)
  generateMirrorBill: (arInvoiceId: string, relationshipId: string) =>
    apiClient.post('/finance/intercompany/mirror-bill', { arInvoiceId, relationshipId }),
  generateEliminations: (periodEnd: string, groupId?: string) =>
    apiClient.post('/finance/intercompany/eliminations', { periodEnd, groupId }),
};
