import { apiClient } from './client';

// Cross-module reporting engine: catalog, column metadata, runs, CSV export.
export const reportsApi = {
  catalog: () => apiClient.get('/reports/catalog'),
  describe: (code: string) => apiClient.get(`/reports/${code}/describe`),
  run: (code: string, query: any) => apiClient.post(`/reports/${code}/run`, query),
  exportCsv: (code: string, query: any) =>
    apiClient.post(`/reports/${code}/export`, query, { responseType: 'blob' }),
};
