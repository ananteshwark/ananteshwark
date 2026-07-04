import { apiClient } from './client';

// Automation rules: when a business event fires and conditions match,
// run actions (notify / email / webhook).
export const automationApi = {
  getEvents: () => apiClient.get('/automation/events'),
  getRules: () => apiClient.get('/automation/rules'),
  createRule: (data: any) => apiClient.post('/automation/rules', data),
  updateRule: (id: string, data: any) => apiClient.patch(`/automation/rules/${id}`, data),
  deleteRule: (id: string) => apiClient.delete(`/automation/rules/${id}`),
  testRule: (id: string, payload: any) => apiClient.post(`/automation/rules/${id}/test`, payload),
  getRuns: (limit = 50) => apiClient.get('/automation/runs', { params: { limit } }),
  sweepNow: () => apiClient.post('/automation/sweep'),
};
