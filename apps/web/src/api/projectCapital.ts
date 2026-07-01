import { apiClient } from './client';

export const projectCapitalApi = {
  setConfig: (projectId: string, data: any) => apiClient.post(`/projects/capital/${projectId}/config`, data),
  getConfig: (projectId: string) => apiClient.get(`/projects/capital/${projectId}/config`),
  setRule: (projectId: string, data: any) => apiClient.post(`/projects/capital/${projectId}/rules`, data),
  listRules: (projectId: string) => apiClient.get(`/projects/capital/${projectId}/rules`),
  accumulate: (projectId: string, data: any) => apiClient.post(`/projects/capital/${projectId}/accumulate`, data),
  cipSummary: (projectId: string) => apiClient.get(`/projects/capital/${projectId}/cip-summary`),
  entries: (projectId: string) => apiClient.get(`/projects/capital/${projectId}/entries`),
  transfer: (projectId: string, assets: any[]) => apiClient.post(`/projects/capital/${projectId}/transfer`, { assets }),
};
