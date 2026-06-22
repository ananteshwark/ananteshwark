import { apiClient } from './client';

export const controllingApi = {
  listProfitCenters: () => apiClient.get('/finance/controlling/profit-centers'),
  createProfitCenter: (data: any) => apiClient.post('/finance/controlling/profit-centers', data),
  updateProfitCenter: (id: string, data: any) =>
    apiClient.patch(`/finance/controlling/profit-centers/${id}`, data),
  profitCenterPL: (id: string, fromDate: string, toDate: string) =>
    apiClient.get(`/finance/controlling/profit-centers/${id}/pl`, { params: { fromDate, toDate } }),
  listCycles: () => apiClient.get('/finance/controlling/allocation-cycles'),
  createCycle: (data: any) => apiClient.post('/finance/controlling/allocation-cycles', data),
  runCycle: (id: string, period: string) =>
    apiClient.post(`/finance/controlling/allocation-cycles/${id}/run`, {}, { params: { period } }),
  costCenterReport: (period: string) =>
    apiClient.get('/finance/controlling/cost-centers/report', { params: { period } }),
};
