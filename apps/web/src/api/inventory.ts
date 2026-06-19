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

  // Adjustments
  getAdjustments: (params?: any) => apiClient.get('/inventory/adjustments', { params }),
  createAdjustment: (data: any) => apiClient.post('/inventory/adjustments', data),
  postAdjustment: (id: string) => apiClient.post(`/inventory/adjustments/${id}/post`),
};
