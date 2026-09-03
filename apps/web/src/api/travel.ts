import { apiClient } from './client';

// Travel requests: trip approval + advances, feeding post-trip expense claims.
export const travelApi = {
  getRequests: (params: any = {}) => apiClient.get('/travel/requests', { params }),
  createRequest: (data: any) => apiClient.post('/travel/requests', data),
  getRequest: (id: string) => apiClient.get(`/travel/requests/${id}`),
  submit: (id: string) => apiClient.patch(`/travel/requests/${id}/submit`),
  approve: (id: string) => apiClient.patch(`/travel/requests/${id}/approve`),
  reject: (id: string, reason: string) => apiClient.patch(`/travel/requests/${id}/reject`, { reason }),
  complete: (id: string, expenseClaimId?: string) => apiClient.patch(`/travel/requests/${id}/complete`, { expenseClaimId }),
  cancel: (id: string) => apiClient.patch(`/travel/requests/${id}/cancel`),
};
