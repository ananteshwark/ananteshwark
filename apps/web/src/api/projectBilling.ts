import { apiClient } from './client';

export const projectBillingApi = {
  createBudget: (projectId: string, data: any) => apiClient.post(`/projects/billing/${projectId}/budget`, data),
  revise: (projectId: string, data: any) => apiClient.post(`/projects/billing/${projectId}/budget/revise`, data),
  budgetLines: (projectId: string) => apiClient.get(`/projects/billing/${projectId}/budget/lines`),
  setRate: (data: any) => apiClient.post('/projects/billing/rates', data),
  budgetVsActual: (projectId: string) => apiClient.get(`/projects/billing/${projectId}/budget-vs-actual`),
  tmInvoice: (projectId: string, fromDate: string, toDate: string) => apiClient.get(`/projects/billing/${projectId}/tm-invoice`, { params: { fromDate, toDate } }),
  fixedPriceSchedule: (data: any) => apiClient.post('/projects/billing/fixed-price-schedule', data),
  recognizePoc: (projectId: string, data: any) => apiClient.post(`/projects/billing/${projectId}/recognize/poc`, data),
  recognizeMilestone: (projectId: string, data: any) => apiClient.post(`/projects/billing/${projectId}/recognize/milestone`, data),
  recognizeCompleted: (projectId: string, data: any) => apiClient.post(`/projects/billing/${projectId}/recognize/completed`, data),
  history: (projectId: string) => apiClient.get(`/projects/billing/${projectId}/recognition-history`),
};
