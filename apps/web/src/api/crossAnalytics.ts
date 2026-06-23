import { apiClient } from './client';

export const crossAnalyticsApi = {
  getSummary: () => apiClient.get('/analytics/cross/summary'),
  getHireToRetire: () => apiClient.get('/analytics/cross/hire-to-retire'),
  getProcureToPay: () => apiClient.get('/analytics/cross/procure-to-pay'),
  getOrderToCash: () => apiClient.get('/analytics/cross/order-to-cash'),
  getFinanceRatios: () => apiClient.get('/analytics/cross/finance-ratios'),
};
