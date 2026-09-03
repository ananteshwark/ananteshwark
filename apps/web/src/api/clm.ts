import { apiClient } from './client';

export const clmApi = {
  listClauses: (approvedOnly?: boolean) => apiClient.get('/contracts/clm/clauses', { params: approvedOnly ? { approvedOnly: true } : {} }),
  createClause: (data: any) => apiClient.post('/contracts/clm/clauses', data),
  updateClause: (id: string, data: any) => apiClient.patch(`/contracts/clm/clauses/${id}`, data),
  approveClause: (id: string) => apiClient.post(`/contracts/clm/clauses/${id}/approve`),
  assemble: (clauseCodes: string[]) => apiClient.post('/contracts/clm/assemble', { clauseCodes }),
  recordDeviation: (data: any) => apiClient.post('/contracts/clm/deviations', data),
  listDeviations: (params?: { contractId?: string; status?: string }) => apiClient.get('/contracts/clm/deviations', { params }),
  reviewDeviation: (id: string, decision: 'APPROVE' | 'REJECT', notes?: string) => apiClient.post(`/contracts/clm/deviations/${id}/review`, { decision, notes }),
  createEnvelope: (data: any) => apiClient.post('/contracts/clm/envelopes', data),
  sendEnvelope: (id: string, sentAt: string) => apiClient.post(`/contracts/clm/envelopes/${id}/send`, { sentAt }),
  updateSignature: (id: string, data: any) => apiClient.post(`/contracts/clm/envelopes/${id}/signature`, data),
  listEnvelopes: (contractId: string) => apiClient.get('/contracts/clm/envelopes', { params: { contractId } }),
  renewalAlerts: (asOf: string) => apiClient.get('/contracts/clm/renewal-alerts', { params: { asOf } }),
  renew: (id: string, newEndDate: string) => apiClient.post(`/contracts/clm/contracts/${id}/renew`, { newEndDate }),
};
