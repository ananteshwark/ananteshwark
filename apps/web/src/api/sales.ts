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

  // Phase 75 — Billing Plans
  getBillingPlans: () => apiClient.get('/sales/billing-plans'),
  getBillingPlan: (id: string) => apiClient.get(`/sales/billing-plans/${id}`),
  getBillingPlanByOrder: (orderId: string) => apiClient.get(`/sales/billing-plans/by-order/${orderId}`),
  getUpcomingBillings: (days?: number) => apiClient.get('/sales/billing-plans/upcoming', { params: days ? { days } : {} }),
  createBillingPlan: (data: any) => apiClient.post('/sales/billing-plans', data),
  billMilestone: (planId: string, num: number, invoiceId?: string) =>
    apiClient.post(`/sales/billing-plans/${planId}/milestones/${num}/bill`, { invoiceId }),
  markMilestonePaid: (planId: string, num: number) =>
    apiClient.post(`/sales/billing-plans/${planId}/milestones/${num}/paid`),

  // Phase 75 — Rebates
  getRebates: () => apiClient.get('/sales/rebates'),
  getRebate: (id: string) => apiClient.get(`/sales/rebates/${id}`),
  createRebate: (data: any) => apiClient.post('/sales/rebates', data),
  updateRebate: (id: string, data: any) => apiClient.patch(`/sales/rebates/${id}`, data),
  accrueRebate: (orderId: string) => apiClient.post(`/sales/rebates/accrual/${orderId}/accrue`),
  simulateRebate: (id: string, orderValue: number) => apiClient.post(`/sales/rebates/${id}/simulate`, { orderValue }),
  settleRebate: (id: string) => apiClient.post(`/sales/rebates/${id}/settle`),

  // Phase 145-146: Drop-ship / Back-to-back orchestration
  listSupplyLinks: (params?: { salesOrderId?: string; status?: string; supplyType?: string }) => apiClient.get('/sales/fulfillment/supply-links', { params }),
  supplyDashboard: () => apiClient.get('/sales/fulfillment/dashboard'),
  createSupplyLink: (data: any) => apiClient.post('/sales/fulfillment/supply-links', data),
  markSupplyOrdered: (id: string, data: any) => apiClient.post(`/sales/fulfillment/supply-links/${id}/order`, data),
  receiveSupply: (id: string, receiptQty: number) => apiClient.post(`/sales/fulfillment/supply-links/${id}/receive`, { receiptQty }),
  cancelSupplyLink: (id: string) => apiClient.post(`/sales/fulfillment/supply-links/${id}/cancel`),

  // Phase 150: Global Order Promising
  listSourcingRules: (itemId?: string) => apiClient.get('/sales/promising/sourcing-rules', { params: itemId ? { itemId } : {} }),
  createSourcingRule: (data: any) => apiClient.post('/sales/promising/sourcing-rules', data),
  deleteSourcingRule: (id: string) => apiClient.delete(`/sales/promising/sourcing-rules/${id}`),
  orderPromise: (data: any) => apiClient.post('/sales/promising/promise', data),
  sourcingPlan: (data: { itemId: string; quantity: number }) => apiClient.post('/sales/promising/sourcing-plan', data),
};
