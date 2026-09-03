import { apiClient } from './client';

// Cross-module AI anomaly layer: statistical screening of every module.
export const aiAnomaliesApi = {
  scan: (modules?: string[]) =>
    apiClient.get('/ai/anomalies', { params: modules?.length ? { modules: modules.join(',') } : {} }),
  coverage: () => apiClient.get('/ai/anomalies/coverage'),
};
