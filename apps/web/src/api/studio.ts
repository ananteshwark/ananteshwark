import { apiClient } from './client';

// Studio: API keys, lookup tables, integration scripts, scheduled jobs, API builder.
export const studioApi = {
  // API keys
  listKeys: () => apiClient.get('/studio/api-keys'),
  createKey: (data: any) => apiClient.post('/studio/api-keys', data),
  setKeyScopes: (id: string, scopes: string[]) => apiClient.patch(`/studio/api-keys/${id}/scopes`, { scopes }),
  revokeKey: (id: string) => apiClient.post(`/studio/api-keys/${id}/revoke`),

  // Lookup tables
  listTables: () => apiClient.get('/studio/lookup-tables'),
  createTable: (data: any) => apiClient.post('/studio/lookup-tables', data),
  getTable: (key: string) => apiClient.get(`/studio/lookup-tables/${key}`),
  listRows: (key: string) => apiClient.get(`/studio/lookup-tables/${key}/rows`),
  addRow: (key: string, data: any) => apiClient.post(`/studio/lookup-tables/${key}/rows`, data),
  deleteRow: (key: string, lookupKey: string) => apiClient.delete(`/studio/lookup-tables/${key}/rows/${lookupKey}`),

  // Integration scripts + scheduled jobs + API builder
  listScripts: () => apiClient.get('/studio/integrations/scripts'),
  createScript: (data: any) => apiClient.post('/studio/integrations/scripts', data),
  runScript: (key: string, rows: any[]) => apiClient.post(`/studio/integrations/scripts/${key}/run`, { rows }),
  listJobs: () => apiClient.get('/studio/integrations/jobs'),
  createJob: (data: any) => apiClient.post('/studio/integrations/jobs', data),
  runJob: (id: string, rows: any[] = []) => apiClient.post(`/studio/integrations/jobs/${id}/run`, { rows }),
  listApis: () => apiClient.get('/studio/integrations/apis'),
  createApi: (data: any) => apiClient.post('/studio/integrations/apis', data),
  resolveApi: (path: string, data?: any) => apiClient.post(`/studio/integrations/apis/${path}/resolve`, data ?? {}),
};
