import { apiClient } from './client';

export const qualityApi = {
  // Inspection Plans
  getPlans: (params?: any) => apiClient.get('/quality/inspection-plans', { params }),
  getPlan: (id: string) => apiClient.get(`/quality/inspection-plans/${id}`),
  createPlan: (data: any) => apiClient.post('/quality/inspection-plans', data),
  updatePlan: (id: string, data: any) => apiClient.patch(`/quality/inspection-plans/${id}`, data),

  // Inspection Lots
  getLots: (params?: any) => apiClient.get('/quality/inspection-lots', { params }),
  getLot: (id: string) => apiClient.get(`/quality/inspection-lots/${id}`),
  createLot: (data: any) => apiClient.post('/quality/inspection-lots', data),
  recordResults: (id: string, data: any) => apiClient.post(`/quality/inspection-lots/${id}/record-results`, data),

  // Characteristics
  getCharacteristics: (planId: string) => apiClient.get(`/quality/plans/${planId}/characteristics`),
  createCharacteristic: (planId: string, data: any) => apiClient.post(`/quality/plans/${planId}/characteristics`, data),
  updateCharacteristic: (id: string, data: any) => apiClient.patch(`/quality/characteristics/${id}`, data),
  deleteCharacteristic: (id: string) => apiClient.delete(`/quality/characteristics/${id}`),

  // Results & Usage Decision
  getLotResults: (lotId: string) => apiClient.get(`/quality/lots/${lotId}/results`),
  recordLotResults: (lotId: string, data: any) => apiClient.post(`/quality/lots/${lotId}/results`, data),
  setUsageDecision: (lotId: string, data: any) => apiClient.post(`/quality/lots/${lotId}/usage-decision`, data),

  // NCRs
  getNcrs: (params?: any) => apiClient.get('/quality/ncrs', { params }),
  createNcr: (data: any) => apiClient.post('/quality/ncrs', data),
  resolveNcr: (id: string, data: any) => apiClient.post(`/quality/ncrs/${id}/resolve`, data),
  closeNcr: (id: string) => apiClient.post(`/quality/ncrs/${id}/close`),
};
