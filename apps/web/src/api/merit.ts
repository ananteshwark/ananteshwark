import { apiClient } from './client';

// Merit planning & compensation modelling.
export const meritApi = {
  listPlans: () => apiClient.get('/compensation/merit/plans'),
  getPlan: (id: string) => apiClient.get(`/compensation/merit/plans/${id}`),
  createPlan: (data: any) => apiClient.post('/compensation/merit/plans', data),
  configurePlan: (id: string, data: any) => apiClient.patch(`/compensation/merit/plans/${id}`, data),
  modelGrid: (id: string, data: any) => apiClient.post(`/compensation/merit/plans/${id}/model-grid`, data),
  submitHrbp: (id: string) => apiClient.post(`/compensation/merit/plans/${id}/submit-hrbp`),
  launch: (id: string) => apiClient.post(`/compensation/merit/plans/${id}/launch`),
  approve: (id: string) => apiClient.post(`/compensation/merit/plans/${id}/approve`),
  getOutputs: (id: string) => apiClient.get(`/compensation/merit/plans/${id}/outputs`),
  getBiasScreen: (id: string) => apiClient.get(`/compensation/merit/plans/${id}/bias-screen`),
  getBudgetConsumption: (id: string) => apiClient.get(`/compensation/merit/plans/${id}/budget-consumption`),
  listLines: (id: string) => apiClient.get(`/compensation/merit/plans/${id}/lines`),
  addLine: (id: string, data: any) => apiClient.post(`/compensation/merit/plans/${id}/lines`, data),
  proposeLine: (lineId: string, data: any) => apiClient.post(`/compensation/merit/lines/${lineId}/propose`, data),
  approveLine: (lineId: string) => apiClient.post(`/compensation/merit/lines/${lineId}/approve`),
  rejectLine: (lineId: string, reason?: string) => apiClient.post(`/compensation/merit/lines/${lineId}/reject`, { reason }),
};
