import { apiClient } from './client';

export const opmApi = {
  listFormulas: () => apiClient.get('/manufacturing/opm/formulas'),
  getFormula: (id: string) => apiClient.get(`/manufacturing/opm/formulas/${id}`),
  createFormula: (data: any) => apiClient.post('/manufacturing/opm/formulas', data),
  updateFormula: (id: string, data: any) => apiClient.patch(`/manufacturing/opm/formulas/${id}`, data),
  addDetail: (id: string, data: any) => apiClient.post(`/manufacturing/opm/formulas/${id}/details`, data),
  approveFormula: (id: string) => apiClient.post(`/manufacturing/opm/formulas/${id}/approve`),
  listBatches: (status?: string) => apiClient.get('/manufacturing/opm/batches', { params: status ? { status } : {} }),
  getBatch: (id: string) => apiClient.get(`/manufacturing/opm/batches/${id}`),
  createBatch: (data: any) => apiClient.post('/manufacturing/opm/batches', data),
  startBatch: (id: string) => apiClient.post(`/manufacturing/opm/batches/${id}/start`),
  completeBatch: (id: string, data: any) => apiClient.post(`/manufacturing/opm/batches/${id}/complete`, data),
  labResult: (id: string, data: any) => apiClient.post(`/manufacturing/opm/batches/${id}/lab-result`, data),
};
