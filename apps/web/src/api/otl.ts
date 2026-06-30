import { apiClient } from './client';

export const otlApi = {
  listRules: () => apiClient.get('/hr/otl/rules'),
  createRule: (data: any) => apiClient.post('/hr/otl/rules', data),
  seedDefaults: () => apiClient.post('/hr/otl/rules/seed-defaults'),
  process: (data: { employeeId: string; periodStart: string; days: any[] }) => apiClient.post('/hr/otl/process', data),
  getResult: (employeeId: string, periodStart: string) => apiClient.get('/hr/otl/result', { params: { employeeId, periodStart } }),
  reconcileAbsence: (data: any) => apiClient.post('/hr/otl/reconcile-absence', data),
  payrollExport: (periodStart: string, periodEnd: string) => apiClient.get('/hr/otl/payroll-export', { params: { periodStart, periodEnd } }),
};
