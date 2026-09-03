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

  // Functional Locations
  getFunctionalLocations: () => apiClient.get('/maintenance/functional-locations'),
  getFunctionalLocationTree: () => apiClient.get('/maintenance/functional-locations/tree'),
  createFunctionalLocation: (data: any) => apiClient.post('/maintenance/functional-locations', data),
  updateFunctionalLocation: (id: string, data: any) => apiClient.patch(`/maintenance/functional-locations/${id}`, data),
  deleteFunctionalLocation: (id: string) => apiClient.delete(`/maintenance/functional-locations/${id}`),

  // Counter Readings
  getCounterReadings: (equipmentId: string) => apiClient.get(`/maintenance/equipment/${equipmentId}/counter-readings`),
  recordCounterReading: (equipmentId: string, data: any) => apiClient.post(`/maintenance/equipment/${equipmentId}/counter-readings`, data),

  // Due Plans (counter + time based)
  getDuePlansAll: () => apiClient.get('/maintenance/due-plans'),
};
