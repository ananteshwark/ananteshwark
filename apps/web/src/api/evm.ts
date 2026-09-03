import { apiClient } from './client';

export const evmApi = {
  createBaseline: (projectId: string, data: any) => apiClient.post(`/projects/evm/${projectId}/baseline`, data),
  baselineLines: (projectId: string) => apiClient.get(`/projects/evm/${projectId}/baseline/lines`),
  measure: (projectId: string, data: any) => apiClient.post(`/projects/evm/${projectId}/measurements`, data),
  taskMeasurements: (projectId: string, period: string) => apiClient.get(`/projects/evm/${projectId}/measurements`, { params: { period } }),
  metrics: (projectId: string, period: string) => apiClient.get(`/projects/evm/${projectId}/metrics`, { params: { period } }),
  sCurve: (projectId: string) => apiClient.get(`/projects/evm/${projectId}/s-curve`),
};
