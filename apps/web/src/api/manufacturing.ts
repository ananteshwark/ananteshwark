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

  // Routings & Capacity (Phase 46)
  getRoutings: () => apiClient.get('/manufacturing/routings'),
  createRouting: (data: any) => apiClient.post('/manufacturing/routings', data),
  updateRouting: (id: string, data: any) => apiClient.patch(`/manufacturing/routings/${id}`, data),
  getCapacityLoad: (params?: any) => apiClient.get('/manufacturing/capacity-load', { params }),

  // MRP (Phase 47)
  runMrp: (data: any) => apiClient.post('/manufacturing/mrp/run', data),
  getPlannedOrders: (params?: any) => apiClient.get('/manufacturing/mrp/planned-orders', { params }),
  convertPlannedOrder: (id: string) => apiClient.post(`/manufacturing/mrp/planned-orders/${id}/convert`),
  getRequirements: (itemId: string) => apiClient.get(`/manufacturing/mrp/requirements/${itemId}`),

  // Production Order Costing (Phase 48)
  calculateCost: (id: string) => apiClient.post(`/manufacturing/production-orders/${id}/calculate-cost`),
  confirmOperation: (id: string, data: any) => apiClient.post(`/manufacturing/production-orders/${id}/confirm`, data),
  settleOrder: (id: string, data?: any) => apiClient.post(`/manufacturing/production-orders/${id}/settle`, data ?? {}),
  getCostSheet: (id: string) => apiClient.get(`/manufacturing/production-orders/${id}/cost-sheet`),

  // BOM Standard Cost Roll-up (Phase 70)
  rollupStandardCost: (bomId: string, runDate?: string) =>
    apiClient.post('/manufacturing/costing-runs', { bomId, ...(runDate ? { runDate } : {}) }),
  listCostingRuns: (params?: any) => apiClient.get('/manufacturing/costing-runs', { params }),
};
