import { apiClient } from './client';

export const compWorkbenchApi = {
  listBudgets: (cycleId?: string) => apiClient.get('/benefits/comp-workbench/budgets', { params: cycleId ? { cycleId } : {} }),
  createBudget: (data: any) => apiClient.post('/benefits/comp-workbench/budgets', data),
  listAwards: (cycleId: string) => apiClient.get('/benefits/comp-workbench/awards', { params: { cycleId } }),
  proposeAward: (data: any) => apiClient.post('/benefits/comp-workbench/awards', data),
  updateAward: (id: string, amount: number) => apiClient.patch(`/benefits/comp-workbench/awards/${id}`, { amount }),
  submit: (id: string) => apiClient.post(`/benefits/comp-workbench/awards/${id}/submit`),
  approve: (id: string) => apiClient.post(`/benefits/comp-workbench/awards/${id}/approve`),
  reject: (id: string, reason?: string) => apiClient.post(`/benefits/comp-workbench/awards/${id}/reject`, { reason }),
  execute: (id: string, assignmentChangeId: string) => apiClient.post(`/benefits/comp-workbench/awards/${id}/execute`, { assignmentChangeId }),
  totalComp: (params: { employeeId: string; baseSalary?: number; employerBenefits?: number }) =>
    apiClient.get('/benefits/comp-workbench/total-comp', { params }),
};
