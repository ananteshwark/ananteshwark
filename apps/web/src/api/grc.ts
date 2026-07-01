import { apiClient } from './client';

export const grcApi = {
  listSodRules: () => apiClient.get('/grc/sod-rules'),
  createSodRule: (data: any) => apiClient.post('/grc/sod-rules', data),
  scan: (assignments: any[]) => apiClient.post('/grc/sod-scan', { assignments }),
  listControls: () => apiClient.get('/grc/controls'),
  createControl: (data: any) => apiClient.post('/grc/controls', data),
  testControl: (id: string, data: any) => apiClient.post(`/grc/controls/${id}/test`, data),
  listRisks: () => apiClient.get('/grc/risks'),
  createRisk: (data: any) => apiClient.post('/grc/risks', data),
  heatMap: () => apiClient.get('/grc/risks/heat-map'),
};
