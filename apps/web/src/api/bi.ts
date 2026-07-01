import { apiClient } from './client';

export const biApi = {
  listSubjectAreas: () => apiClient.get('/analytics/bi/subject-areas'),
  seed: () => apiClient.post('/analytics/bi/subject-areas/seed'),
  listReports: () => apiClient.get('/analytics/bi/reports'),
  createReport: (data: any) => apiClient.post('/analytics/bi/reports', data),
  preview: (definition: any, rows: any[]) => apiClient.post('/analytics/bi/reports/preview', { definition, rows }),
  run: (id: string, rows: any[]) => apiClient.post(`/analytics/bi/reports/${id}/run`, { rows }),
  listSchedules: () => apiClient.get('/analytics/bi/schedules'),
  createSchedule: (data: any) => apiClient.post('/analytics/bi/schedules', data),
  listTiles: (dashboardId = 'home') => apiClient.get('/analytics/bi/tiles', { params: { dashboardId } }),
  createTile: (data: any) => apiClient.post('/analytics/bi/tiles', data),
  computeTile: (id: string, rows: any[]) => apiClient.post(`/analytics/bi/tiles/${id}/compute`, { rows }),
};
