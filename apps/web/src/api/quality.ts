import { apiClient } from './client';

export const qualityApi = {
  // Inspection Plans
  getPlans: (params?: any) => apiClient.get('/quality/inspection-plans', { params }),
  getPlan: (id: string) => apiClient.get(`/quality/inspection-plans/${id}`),
  createPlan: (data: any) => apiClient.post('/quality/inspection-plans', data),

  // Inspection Lots
  getLots: (params?: any) => apiClient.get('/quality/inspection-lots', { params }),
  getLot: (id: string) => apiClient.get(`/quality/inspection-lots/${id}`),
  createLot: (data: any) => apiClient.post('/quality/inspection-lots', data),
  recordResults: (id: string, data: any) => apiClient.post(`/quality/inspection-lots/${id}/record-results`, data),

  // NCRs
  getNcrs: (params?: any) => apiClient.get('/quality/ncrs', { params }),
  createNcr: (data: any) => apiClient.post('/quality/ncrs', data),
  resolveNcr: (id: string, data: any) => apiClient.post(`/quality/ncrs/${id}/resolve`, data),
  closeNcr: (id: string) => apiClient.post(`/quality/ncrs/${id}/close`),
};
