import { apiClient } from './client';

export const benefitsEnrollmentApi = {
  listWindows: () => apiClient.get('/benefits/enrollment/windows'),
  createWindow: (data: any) => apiClient.post('/benefits/enrollment/windows', data),
  setWindowStatus: (id: string, status: string) => apiClient.post(`/benefits/enrollment/windows/${id}/status`, { status }),
  listLifeEvents: (params?: { employeeId?: string; status?: string }) => apiClient.get('/benefits/enrollment/life-events', { params }),
  recordLifeEvent: (data: any) => apiClient.post('/benefits/enrollment/life-events', data),
  completeLifeEvent: (id: string) => apiClient.post(`/benefits/enrollment/life-events/${id}/complete`),
  expireLapsed: (asOf: string) => apiClient.post('/benefits/enrollment/life-events/expire-lapsed', { asOf }),
  canElect: (employeeId: string, onDate: string) => apiClient.get('/benefits/enrollment/can-elect', { params: { employeeId, onDate } }),
  computeDeduction: (data: { planId: string; payPeriods: number; annualSalary?: number }) => apiClient.post('/benefits/enrollment/compute-deduction', data),
};
