import { apiClient } from './client';

export const cmmsApi = {
  listParts: (orderId: string) => apiClient.get(`/maintenance/cmms/orders/${orderId}/parts`),
  reservePart: (data: any) => apiClient.post('/maintenance/cmms/parts', data),
  issuePart: (id: string, qtyIssued?: number) => apiClient.post(`/maintenance/cmms/parts/${id}/issue`, { qtyIssued }),
  cancelPart: (id: string) => apiClient.post(`/maintenance/cmms/parts/${id}/cancel`),
  issueAllParts: (orderId: string) => apiClient.post(`/maintenance/cmms/orders/${orderId}/issue-all-parts`),
  listWarranties: (equipmentId?: string) => apiClient.get('/maintenance/cmms/warranties', { params: equipmentId ? { equipmentId } : {} }),
  createWarranty: (data: any) => apiClient.post('/maintenance/cmms/warranties', data),
  checkWarranty: (equipmentId: string, onDate: string) => apiClient.get('/maintenance/cmms/warranties/check', { params: { equipmentId, onDate } }),
  claimWarranty: (id: string, amount: number) => apiClient.post(`/maintenance/cmms/warranties/${id}/claim`, { amount }),
  serviceHistory: (equipmentId: string) => apiClient.get(`/maintenance/cmms/equipment/${equipmentId}/service-history`),
};
