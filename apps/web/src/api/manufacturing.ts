import { apiClient } from './client';

export const manufacturingApi = {
  // BOMs
  getBoms: (params?: any) => apiClient.get('/manufacturing/boms', { params }),
  getBom: (id: string) => apiClient.get(`/manufacturing/boms/${id}`),
  createBom: (data: any) => apiClient.post('/manufacturing/boms', data),
  activateBom: (id: string) => apiClient.post(`/manufacturing/boms/${id}/activate`),

  // Work Centers
  getWorkCenters: () => apiClient.get('/manufacturing/work-centers'),
  createWorkCenter: (data: any) => apiClient.post('/manufacturing/work-centers', data),

  // Production Orders
  getOrders: (params?: any) => apiClient.get('/manufacturing/orders', { params }),
  createOrder: (data: any) => apiClient.post('/manufacturing/orders', data),
  releaseOrder: (id: string) => apiClient.post(`/manufacturing/orders/${id}/release`),
  completeOrder: (id: string, data: any) => apiClient.post(`/manufacturing/orders/${id}/complete`, data),
  issueMaterial: (id: string, data: any) => apiClient.post(`/manufacturing/orders/${id}/issue-material`, data),
  getIssuances: (id: string) => apiClient.get(`/manufacturing/orders/${id}/issuances`),
};
