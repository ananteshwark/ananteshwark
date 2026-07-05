import { apiClient } from './client';

// Background verification: cases with per-check outcomes.
export const bgvApi = {
  getCases: (params: any = {}) => apiClient.get('/bgv/cases', { params }),
  initiate: (data: any) => apiClient.post('/bgv/cases', data),
  getCase: (id: string) => apiClient.get(`/bgv/cases/${id}`),
  updateCheck: (checkId: string, data: { status: string; remarks?: string }) =>
    apiClient.patch(`/bgv/checks/${checkId}`, data),
  cancel: (id: string) => apiClient.patch(`/bgv/cases/${id}/cancel`),
};
