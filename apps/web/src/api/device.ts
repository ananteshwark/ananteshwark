import { apiClient } from './client';

// Device platform: visitor kiosk, mobile shell config, facial check-in seam.
export const deviceApi = {
  listVisitors: (status?: string) => apiClient.get('/platform/device/visitors', { params: status ? { status } : {} }),
  preRegister: (data: any) => apiClient.post('/platform/device/visitors', data),
  checkIn: (id: string, badgeNumber?: string) => apiClient.post(`/platform/device/visitors/${id}/check-in`, badgeNumber ? { badgeNumber } : {}),
  checkOut: (id: string) => apiClient.post(`/platform/device/visitors/${id}/check-out`),
  noShowSweep: () => apiClient.post('/platform/device/visitors/no-show-sweep', {}),

  getMobileConfig: () => apiClient.get('/platform/device/mobile/config'),
  updateMobileConfig: (data: any) => apiClient.patch('/platform/device/mobile/config', data),
  versionCheck: (clientVersion: string) => apiClient.get('/platform/device/mobile/version-check', { params: { clientVersion } }),
};
