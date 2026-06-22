import { apiClient } from './client';

export const payrollGlApi = {
  getGlMappings: () => apiClient.get('/payroll/gl-mappings'),
  saveGlMappings: (items: any[]) =>
    apiClient.post('/payroll/gl-mappings', { items }),
  postToGl: (runId: string) => apiClient.post(`/payroll/runs/${runId}/post-gl`),
};
