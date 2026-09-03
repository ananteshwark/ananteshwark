import { apiClient } from './client';

// Form I-9 employment eligibility verification with optional E-Verify.
export const i9Api = {
  listCases: (status?: string) => apiClient.get('/hr/i9/cases', { params: status ? { status } : {} }),
  createCase: (data: any) => apiClient.post('/hr/i9/cases', data),
  getCase: (id: string) => apiClient.get(`/hr/i9/cases/${id}`),
  section1: (id: string, data: any) => apiClient.post(`/hr/i9/cases/${id}/section1`, data),
  section2: (id: string, data: any) => apiClient.post(`/hr/i9/cases/${id}/section2`, data),
  recordEVerify: (id: string, data: any) => apiClient.post(`/hr/i9/cases/${id}/everify`, data),
  submitEVerify: (id: string) => apiClient.post(`/hr/i9/cases/${id}/everify/submit`),
  refreshEVerify: (id: string) => apiClient.post(`/hr/i9/cases/${id}/everify/refresh`),
  reverify: (id: string, data: any) => apiClient.post(`/hr/i9/cases/${id}/reverify`, data),
  section2Overdue: () => apiClient.get('/hr/i9/section2-overdue'),
  dueForReverification: () => apiClient.get('/hr/i9/due-for-reverification'),
};
