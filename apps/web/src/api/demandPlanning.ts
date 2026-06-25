import { apiClient } from './client';

const BASE = '/planning/demand';

export const demandPlanningApi = {
  listForecasts: (params?: { itemId?: string; status?: string }) =>
    apiClient.get(`${BASE}/forecasts`, { params: params ?? {} }),
  getForecast: (id: string) => apiClient.get(`${BASE}/forecasts/${id}`),
  generate: (data: any) => apiClient.post(`${BASE}/forecasts`, data),
  release: (id: string) => apiClient.post(`${BASE}/forecasts/${id}/release`, {}),
  adjustPeriod: (id: string, adjustedQty: number) =>
    apiClient.patch(`${BASE}/periods/${id}/adjust`, { adjustedQty }),
  recordActual: (id: string, actualQty: number) =>
    apiClient.patch(`${BASE}/periods/${id}/actual`, { actualQty }),
  history: (itemId: string, months = 12) =>
    apiClient.get(`${BASE}/history/${itemId}`, { params: { months } }),
  released: (params?: { from?: string; to?: string }) =>
    apiClient.get(`${BASE}/released`, { params: params ?? {} }),
};
