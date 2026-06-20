import { apiClient } from './client';

export const salesApi = {
  // Orders
  getOrders: (params?: any) => apiClient.get('/sales/orders', { params }),
  getOrder: (id: string) => apiClient.get(`/sales/orders/${id}`),
  getOrderLines: (id: string) => apiClient.get(`/sales/orders/${id}/lines`),
  createOrder: (data: any) => apiClient.post('/sales/orders', data),
  updateOrder: (id: string, data: any) => apiClient.patch(`/sales/orders/${id}`, data),
  confirmOrder: (id: string) => apiClient.post(`/sales/orders/${id}/confirm`),
  shipOrder: (id: string, data: any) => apiClient.post(`/sales/orders/${id}/ship`, data),
  completeOrder: (id: string) => apiClient.post(`/sales/orders/${id}/complete`),
  cancelOrder: (id: string) => apiClient.post(`/sales/orders/${id}/cancel`),
  convertFromQuote: (quoteId: string, data?: any) => apiClient.post(`/sales/orders/from-quote/${quoteId}`, data || {}),

  // Price Lists
  getPriceLists: (params?: any) => apiClient.get('/sales/price-lists', { params }),
  createPriceList: (data: any) => apiClient.post('/sales/price-lists', data),
  getPriceListItems: (id: string) => apiClient.get(`/sales/price-lists/${id}/items`),
  addPriceListItem: (id: string, data: any) => apiClient.post(`/sales/price-lists/${id}/items`, data),
};
