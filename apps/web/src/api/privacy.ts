import { apiClient } from './client';

export const privacyApi = {
  listPii: (entityName?: string) => apiClient.get('/privacy/pii-fields', { params: entityName ? { entityName } : {} }),
  registerPii: (data: any) => apiClient.post('/privacy/pii-fields', data),
  recordConsent: (data: any) => apiClient.post('/privacy/consents', data),
  listConsents: (subjectId: string) => apiClient.get(`/privacy/consents/${subjectId}`),
  requestErasure: (data: any) => apiClient.post('/privacy/erasure', data),
  processErasures: (asOf: string) => apiClient.post('/privacy/erasure/process', { asOf }),
  fulfilDsar: (data: any) => apiClient.post('/privacy/dsar', data),
};
