import { apiClient } from './client';

export const procurementApi = {
  // Requisitions
  getRequisitions: (params?: any) => apiClient.get('/procurement/requisitions', { params }),
  getRequisition: (id: string) => apiClient.get(`/procurement/requisitions/${id}`),
  createRequisition: (data: any) => apiClient.post('/procurement/requisitions', data),
  updateRequisition: (id: string, data: any) => apiClient.patch(`/procurement/requisitions/${id}`, data),
  submitRequisition: (id: string) => apiClient.post(`/procurement/requisitions/${id}/submit`),
  approveRequisition: (id: string) => apiClient.post(`/procurement/requisitions/${id}/approve`),
  rejectRequisition: (id: string, data: any) => apiClient.post(`/procurement/requisitions/${id}/reject`, data),
  cancelRequisition: (id: string) => apiClient.post(`/procurement/requisitions/${id}/cancel`),

  // RFQ
  getRfqs: (params?: any) => apiClient.get('/procurement/rfqs', { params }),
  getRfq: (id: string) => apiClient.get(`/procurement/rfqs/${id}`),
  createRfq: (data: any) => apiClient.post('/procurement/rfqs', data),
  issueRfq: (id: string) => apiClient.post(`/procurement/rfqs/${id}/issue`),
  recordQuote: (id: string, data: any) => apiClient.post(`/procurement/rfqs/${id}/quotes`, data),
  getComparative: (id: string) => apiClient.get(`/procurement/rfqs/${id}/comparative`),
  closeRfq: (id: string) => apiClient.post(`/procurement/rfqs/${id}/close`),
  cancelRfq: (id: string) => apiClient.post(`/procurement/rfqs/${id}/cancel`),

  // Purchase Orders
  getPurchaseOrders: (params?: any) => apiClient.get('/procurement/purchase-orders', { params }),
  getPurchaseOrder: (id: string) => apiClient.get(`/procurement/purchase-orders/${id}`),
  createPurchaseOrder: (data: any) => apiClient.post('/procurement/purchase-orders', data),
  updatePurchaseOrder: (id: string, data: any) => apiClient.patch(`/procurement/purchase-orders/${id}`, data),
  approvePurchaseOrder: (id: string) => apiClient.post(`/procurement/purchase-orders/${id}/approve`),
  sendPurchaseOrder: (id: string) => apiClient.post(`/procurement/purchase-orders/${id}/send`),
  cancelPurchaseOrder: (id: string) => apiClient.post(`/procurement/purchase-orders/${id}/cancel`),

  // GRN
  getGrns: (params?: any) => apiClient.get('/procurement/grns', { params }),
  getGrn: (id: string) => apiClient.get(`/procurement/grns/${id}`),
  createGrn: (data: any) => apiClient.post('/procurement/grns', data),
  confirmGrn: (id: string) => apiClient.post(`/procurement/grns/${id}/confirm`),
  getGrnMatch: (id: string) => apiClient.get(`/procurement/grns/${id}/match`),
  cancelGrn: (id: string) => apiClient.post(`/procurement/grns/${id}/cancel`),
};
