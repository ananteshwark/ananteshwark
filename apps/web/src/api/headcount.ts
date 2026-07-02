import { apiClient } from './client';

export const headcountApi = {
  listBudgets: (fiscalYear?: number) => apiClient.get('/hr/headcount/budgets', { params: fiscalYear ? { fiscalYear } : {} }),
  createBudget: (data: any) => apiClient.post('/hr/headcount/budgets', data),
  updateBudget: (id: string, data: any) => apiClient.patch(`/hr/headcount/budgets/${id}`, data),
  check: (positionId: string, fiscalYear: number, requestedFte = 1) => apiClient.get('/hr/headcount/check', { params: { positionId, fiscalYear, requestedFte } }),
  listScenarios: () => apiClient.get('/hr/headcount/scenarios'),
  createScenario: (data: any) => apiClient.post('/hr/headcount/scenarios', data),
  addChange: (id: string, data: any) => apiClient.post(`/hr/headcount/scenarios/${id}/changes`, data),
  projection: (id: string) => apiClient.get(`/hr/headcount/scenarios/${id}/projection`),
  finalize: (id: string) => apiClient.post(`/hr/headcount/scenarios/${id}/finalize`),
  discard: (id: string) => apiClient.post(`/hr/headcount/scenarios/${id}/discard`),
};
