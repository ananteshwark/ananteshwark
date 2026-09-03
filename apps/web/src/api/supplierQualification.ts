import { apiClient } from './client';

export const supplierQualApi = {
  listQuestionnaires: (category?: string) => apiClient.get('/procurement/supplier-qualification/questionnaires', { params: category ? { category } : {} }),
  createQuestionnaire: (data: any) => apiClient.post('/procurement/supplier-qualification/questionnaires', data),
  updateQuestionnaire: (id: string, data: any) => apiClient.patch(`/procurement/supplier-qualification/questionnaires/${id}`, data),
  submitResponse: (data: any) => apiClient.post('/procurement/supplier-qualification/responses', data),
  listResponses: (params?: { questionnaireId?: string; supplierId?: string; status?: string }) => apiClient.get('/procurement/supplier-qualification/responses', { params }),
  review: (id: string, decision: 'APPROVE' | 'REJECT', notes?: string) => apiClient.post(`/procurement/supplier-qualification/responses/${id}/review`, { decision, notes }),
  addCertificate: (data: any) => apiClient.post('/procurement/supplier-qualification/certificates', data),
  listCertificates: (supplierId: string, asOf: string) => apiClient.get('/procurement/supplier-qualification/certificates', { params: { supplierId, asOf } }),
  expiring: (asOf: string, withinDays = 30) => apiClient.get('/procurement/supplier-qualification/certificates/expiring', { params: { asOf, withinDays } }),
  upsertScorecard: (data: any) => apiClient.post('/procurement/supplier-qualification/scorecards', data),
  trend: (supplierId: string) => apiClient.get('/procurement/supplier-qualification/scorecards/trend', { params: { supplierId } }),
};
