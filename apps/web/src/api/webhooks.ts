import { apiClient } from './client';

export const webhooksApi = {
  listEventTypes: () => apiClient.get('/platform/webhooks/events'),
  listSubscriptions: () => apiClient.get('/platform/webhooks/subscriptions'),
  getSubscription: (id: string) => apiClient.get(`/platform/webhooks/subscriptions/${id}`),
  createSubscription: (data: any) => apiClient.post('/platform/webhooks/subscriptions', data),
  updateSubscription: (id: string, data: any) =>
    apiClient.patch(`/platform/webhooks/subscriptions/${id}`, data),
  rotateSecret: (id: string) =>
    apiClient.post(`/platform/webhooks/subscriptions/${id}/rotate-secret`, {}),
  testSubscription: (id: string) =>
    apiClient.post(`/platform/webhooks/subscriptions/${id}/test`, {}),
  deleteSubscription: (id: string) =>
    apiClient.delete(`/platform/webhooks/subscriptions/${id}`),
  listDeliveries: (subscriptionId?: string, limit?: number) =>
    apiClient.get('/platform/webhooks/deliveries', {
      params: { ...(subscriptionId ? { subscriptionId } : {}), ...(limit ? { limit } : {}) },
    }),
  getDelivery: (id: string) => apiClient.get(`/platform/webhooks/deliveries/${id}`),
};
