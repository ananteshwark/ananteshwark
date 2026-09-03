import { apiClient } from './client';

export const grcApi = {
  listSodRules: () => apiClient.get('/grc/sod-rules'),
  createSodRule: (data: any) => apiClient.post('/grc/sod-rules', data),
  updateSodRule: (id: string, data: any) => apiClient.patch(`/grc/sod-rules/${id}`, data),
  scan: (assignments: any[]) => apiClient.post('/grc/sod-scan', { assignments }),
  listControls: () => apiClient.get('/grc/controls'),
  createControl: (data: any) => apiClient.post('/grc/controls', data),
  updateControl: (id: string, data: any) => apiClient.patch(`/grc/controls/${id}`, data),
  testControl: (id: string, data: any) => apiClient.post(`/grc/controls/${id}/test`, data),
  listRisks: () => apiClient.get('/grc/risks'),
  createRisk: (data: any) => apiClient.post('/grc/risks', data),
  updateRisk: (id: string, data: any) => apiClient.patch(`/grc/risks/${id}`, data),
  heatMap: () => apiClient.get('/grc/risks/heat-map'),
};
