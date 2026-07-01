import { apiClient } from './client';

export const extensibilityApi = {
  listObjects: () => apiClient.get('/platform/extensibility/objects'),
  createObject: (data: any) => apiClient.post('/platform/extensibility/objects', data),
  listRecords: (id: string) => apiClient.get(`/platform/extensibility/objects/${id}/records`),
  createRecord: (id: string, data: any) => apiClient.post(`/platform/extensibility/objects/${id}/records`, { data }),
  listRules: (id: string) => apiClient.get(`/platform/extensibility/objects/${id}/rules`),
  addRule: (id: string, data: any) => apiClient.post(`/platform/extensibility/objects/${id}/rules`, data),
  marketplace: () => apiClient.get('/platform/extensibility/marketplace'),
  install: (key: string) => apiClient.post(`/platform/extensibility/marketplace/${key}/install`),
};
