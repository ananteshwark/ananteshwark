import { apiClient } from './client';

export const opQualityApi = {
  listPlans: (routingOperationId?: string) => apiClient.get('/manufacturing/op-quality/plans', { params: routingOperationId ? { routingOperationId } : {} }),
  createPlan: (data: any) => apiClient.post('/manufacturing/op-quality/plans', data),
  updatePlan: (id: string, data: any) => apiClient.patch(`/manufacturing/op-quality/plans/${id}`, data),
  deletePlan: (id: string) => apiClient.delete(`/manufacturing/op-quality/plans/${id}`),
  collect: (data: any) => apiClient.post('/manufacturing/op-quality/collect', data),
  canProceed: (productionOrderId: string, routingOperationId: string) => apiClient.get('/manufacturing/op-quality/can-proceed', { params: { productionOrderId, routingOperationId } }),
  listResults: (productionOrderId: string) => apiClient.get('/manufacturing/op-quality/results', { params: { productionOrderId } }),
  firstPassYield: (params?: { workCenterId?: string; itemId?: string }) => apiClient.get('/manufacturing/op-quality/first-pass-yield', { params }),
};
