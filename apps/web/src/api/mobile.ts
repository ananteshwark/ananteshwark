import { apiClient } from './client';

export const mobileApi = {
  parseReceipt: (ocrText: string) => apiClient.post('/mobile/receipt-parse', { ocrText }),
  checkIn: (data: any) => apiClient.post('/mobile/checkin', data),
  checkOut: (id: string, at: string) => apiClient.post(`/mobile/checkin/${id}/checkout`, { at }),
  timesheet: (employeeId: string, weekStart: string, weekEnd: string) => apiClient.get('/mobile/timesheet', { params: { employeeId, weekStart, weekEnd } }),
  checkins: (employeeId: string) => apiClient.get('/mobile/checkins', { params: { employeeId } }),
  confirmScan: (expected: any, scanned: any) => apiClient.post('/mobile/scan-confirm', { expected, scanned }),
};
