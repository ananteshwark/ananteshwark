import { apiClient } from './client';

export const positionsApi = {
  list: (params?: any) => apiClient.get('/hr/positions', { params }),
  create: (data: any) => apiClient.post('/hr/positions', data),
  update: (id: string, data: any) => apiClient.patch(`/hr/positions/${id}`, data),
  delete: (id: string) => apiClient.delete(`/hr/positions/${id}`),
  assign: (positionId: string, employeeId: string) =>
    apiClient.post(`/hr/positions/${positionId}/assign/${employeeId}`),
  unassign: (positionId: string, employeeId: string) =>
    apiClient.post(`/hr/positions/${positionId}/unassign/${employeeId}`),
  headcountDashboard: () => apiClient.get('/hr/positions/headcount-dashboard'),
  vacancies: () => apiClient.get('/hr/positions/vacancies'),
  listGrades: () => apiClient.get('/hr/grades'),
  createGrade: (data: any) => apiClient.post('/hr/grades', data),
  updateGrade: (id: string, data: any) => apiClient.patch(`/hr/grades/${id}`, data),
};
