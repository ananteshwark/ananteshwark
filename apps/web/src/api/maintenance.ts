import { apiClient } from './client';

export const maintenanceApi = {
  // Equipment
  getEquipment: (params?: any) => apiClient.get('/maintenance/equipment', { params }),
  createEquipment: (data: any) => apiClient.post('/maintenance/equipment', data),
  updateEquipment: (id: string, data: any) => apiClient.patch(`/maintenance/equipment/${id}`, data),

  // Maintenance Plans
  getPlans: (params?: any) => apiClient.get('/maintenance/plans', { params }),
  createPlan: (data: any) => apiClient.post('/maintenance/plans', data),
  getDuePlans: () => apiClient.get('/maintenance/plans/due'),

  // Maintenance Orders
  getOrders: (params?: any) => apiClient.get('/maintenance/orders', { params }),
  createOrder: (data: any) => apiClient.post('/maintenance/orders', data),
  startOrder: (id: string) => apiClient.post(`/maintenance/orders/${id}/start`),
  completeOrder: (id: string, data: any) => apiClient.post(`/maintenance/orders/${id}/complete`, data),

  // Breakdown Notifications
  getBreakdowns: (params?: any) => apiClient.get('/maintenance/breakdown-notifications', { params }),
  reportBreakdown: (data: any) => apiClient.post('/maintenance/breakdown-notifications', data),
  createOrderFromBreakdown: (id: string) => apiClient.post(`/maintenance/breakdown-notifications/${id}/create-order`),
};
