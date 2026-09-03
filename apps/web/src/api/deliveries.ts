import { apiClient } from './client';

export const deliveriesApi = {
  list: (params?: { salesOrderId?: string; status?: string }) =>
    apiClient.get('/sales/deliveries', { params }),
  getOne: (id: string) => apiClient.get(`/sales/deliveries/${id}`),
  create: (data: { salesOrderId: string; deliveryDate?: string; warehouseId?: string | null }) =>
    apiClient.post('/sales/deliveries', data),
  pick: (id: string) => apiClient.post(`/sales/deliveries/${id}/pick`),
  goodsIssue: (id: string, data?: { carrier?: string | null; trackingNumber?: string | null }) =>
    apiClient.post(`/sales/deliveries/${id}/goods-issue`, data || {}),
  confirmPod: (id: string, data?: { note?: string; carrier?: string | null; trackingNumber?: string | null }) =>
    apiClient.post(`/sales/deliveries/${id}/confirm-pod`, data || {}),
  cancel: (id: string) => apiClient.post(`/sales/deliveries/${id}/cancel`),
};
