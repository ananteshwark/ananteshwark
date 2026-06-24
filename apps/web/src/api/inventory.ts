import { apiClient } from './client';

export const inventoryApi = {
  // Warehouses
  getWarehouses: (params?: any) => apiClient.get('/inventory/warehouses', { params }),
  createWarehouse: (data: any) => apiClient.post('/inventory/warehouses', data),
  updateWarehouse: (id: string, data: any) => apiClient.patch(`/inventory/warehouses/${id}`, data),

  // Item Categories
  getCategories: (params?: any) => apiClient.get('/inventory/categories', { params }),
  createCategory: (data: any) => apiClient.post('/inventory/categories', data),

  // Items
  getItems: (params?: any) => apiClient.get('/inventory/items', { params }),
  getItem: (id: string) => apiClient.get(`/inventory/items/${id}`),
  createItem: (data: any) => apiClient.post('/inventory/items', data),
  updateItem: (id: string, data: any) => apiClient.patch(`/inventory/items/${id}`, data),

  // Stock
  getStockBalances: (params?: any) => apiClient.get('/inventory/stock/balances', { params }),
  getStockLedger: (params?: any) => apiClient.get('/inventory/stock/ledger', { params }),
  receiveStock: (data: any) => apiClient.post('/inventory/stock/receive', data),
  issueStock: (data: any) => apiClient.post('/inventory/stock/issue', data),
  transferStock: (data: any) => apiClient.post('/inventory/stock/transfer', data),
  getFifoLayers: (itemId: string, warehouseId?: string) =>
    apiClient.get('/inventory/stock/fifo-layers', { params: { itemId, ...(warehouseId ? { warehouseId } : {}) } }),

  // Adjustments
  getAdjustments: (params?: any) => apiClient.get('/inventory/adjustments', { params }),
  createAdjustment: (data: any) => apiClient.post('/inventory/adjustments', data),
  postAdjustment: (id: string) => apiClient.post(`/inventory/adjustments/${id}/post`),

  // Phase 18 - Bin Locations
  getBins: (warehouseId?: string) => apiClient.get('/inventory/v2/bins', { params: warehouseId ? { warehouseId } : {} }),
  createBin: (data: any) => apiClient.post('/inventory/v2/bins', data),

  // Phase 18 - Lot / Serial
  getLots: (itemId?: string) => apiClient.get('/inventory/v2/lots', { params: itemId ? { itemId } : {} }),
  receiveLot: (data: any) => apiClient.post('/inventory/v2/lots', data),
  quarantineLot: (id: string) => apiClient.patch(`/inventory/v2/lots/${id}/quarantine`),

  // Phase 18 - UoM Conversions
  getUomConversions: (itemId?: string) => apiClient.get('/inventory/v2/uom-conversions', { params: itemId ? { itemId } : {} }),
  createUomConversion: (data: any) => apiClient.post('/inventory/v2/uom-conversions', data),

  // Phase 18 - Cycle Counts
  getCycleCounts: (params?: any) => apiClient.get('/inventory/v2/cycle-counts', { params }),
  createCycleCount: (data: any) => apiClient.post('/inventory/v2/cycle-counts', data),
  getCountLines: (countId: string) => apiClient.get(`/inventory/v2/cycle-counts/${countId}/lines`),
  enterCount: (countId: string, lineId: string, countedQty: number) => apiClient.patch(`/inventory/v2/cycle-counts/${countId}/lines/${lineId}/count`, { countedQty }),
  postCycleCount: (id: string) => apiClient.post(`/inventory/v2/cycle-counts/${id}/post`),

  // Phase 18 - RMA
  getRmas: (params?: any) => apiClient.get('/inventory/v2/rmas', { params }),
  createRma: (data: any) => apiClient.post('/inventory/v2/rmas', data),
  approveRma: (id: string) => apiClient.post(`/inventory/v2/rmas/${id}/approve`),
  receiveRma: (id: string, receivedDate: string) => apiClient.post(`/inventory/v2/rmas/${id}/receive`, { receivedDate }),
};
