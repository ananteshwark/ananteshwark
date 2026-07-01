import { apiClient } from './client';

export const predictiveApi = {
  churn: (customerId: string, signals: any) => apiClient.post('/analytics/predictive/churn', { customerId, signals }),
  latePayment: (invoiceId: string, signals: any) => apiClient.post('/analytics/predictive/late-payment', { invoiceId, signals }),
  demandAccuracy: (series: any[]) => apiClient.post('/analytics/predictive/demand-accuracy', { series }),
  top: (model: string, limit = 20) => apiClient.get('/analytics/predictive/top', { params: { model, limit } }),
};
