import { apiClient } from './client';

export const timeEvalApi = {
  run: (month: number, year: number) =>
    apiClient.post('/hr/time-evaluation/run', {}, { params: { month, year } }),
  report: (month: number, year: number) =>
    apiClient.get('/hr/time-evaluation/report', { params: { month, year } }),
  timecard: (employeeId: string, month: number, year: number) =>
    apiClient.get(`/hr/time-evaluation/timecard/${employeeId}`, { params: { month, year } }),
  getRules: () => apiClient.get('/hr/time-evaluation/rules'),
  saveRules: (rules: any[]) => apiClient.post('/hr/time-evaluation/rules', rules),
};
