import { apiClient } from './client';

export const payrollCostingApi = {
  listRules: (componentCode?: string) => apiClient.get('/payroll/costing/rules', { params: componentCode ? { componentCode } : {} }),
  createRule: (data: any) => apiClient.post('/payroll/costing/rules', data),
  deleteRule: (id: string) => apiClient.delete(`/payroll/costing/rules/${id}`),
  distribute: (runId: string, lines: any[]) => apiClient.post(`/payroll/costing/runs/${runId}/distribute`, { lines }),
  listDistribution: (runId: string) => apiClient.get(`/payroll/costing/runs/${runId}/distribution`),
  laborReport: (params?: { payrollRunId?: string; groupBy?: string }) => apiClient.get('/payroll/costing/labor-report', { params }),
};
