import { apiClient } from './client';

export const analyticsApi = {
  // Reports
  getReports: (params?: any) => apiClient.get('/analytics/reports', { params }),
  createReport: (data: any) => apiClient.post('/analytics/reports', data),
  getReport: (id: string) => apiClient.get(`/analytics/reports/${id}`),
  runReport: (id: string, data?: any) => apiClient.post(`/analytics/reports/${id}/run`, data ?? {}),

  // Schedules
  getSchedules: () => apiClient.get('/analytics/schedules'),
  createSchedule: (data: any) => apiClient.post('/analytics/schedules', data),

  // Budgets
  getBudgets: (params?: any) => apiClient.get('/analytics/budgets', { params }),
  createBudget: (data: any) => apiClient.post('/analytics/budgets', data),
  approveBudget: (id: string) => apiClient.post(`/analytics/budgets/${id}/approve`),
  getBudgetVariance: (id: string) => apiClient.get(`/analytics/budgets/${id}/variance`),

  // KPIs
  getKpis: () => apiClient.get('/analytics/kpis'),
  createKpi: (data: any) => apiClient.post('/analytics/kpis', data),
  getKpiDashboard: () => apiClient.get('/analytics/kpis/dashboard'),
  evaluateKpi: (id: string) => apiClient.get(`/analytics/kpis/${id}/evaluate`),
};
