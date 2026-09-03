import { apiClient } from './client';

export const ssoApi = {
  listProviders: () => apiClient.get('/platform/sso/providers'),
  getProvider: (id: string) => apiClient.get(`/platform/sso/providers/${id}`),
  createProvider: (data: any) => apiClient.post('/platform/sso/providers', data),
  updateProvider: (id: string, data: any) =>
    apiClient.patch(`/platform/sso/providers/${id}`, data),
  deleteProvider: (id: string) => apiClient.delete(`/platform/sso/providers/${id}`),
  getSpMetadata: (id: string) => apiClient.get(`/platform/sso/providers/${id}/metadata`),
};
