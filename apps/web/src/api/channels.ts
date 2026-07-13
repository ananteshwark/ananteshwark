import { apiClient } from './client';

// Notification channels (Teams/Slack/web push) and the rewards store.
export const channelsApi = {
  listSubscriptions: () => apiClient.get('/notifications/channels/subscriptions'),
  subscribe: (data: any) => apiClient.post('/notifications/channels/subscriptions', data),
  setSubscriptionEnabled: (id: string, enabled: boolean) => apiClient.patch(`/notifications/channels/subscriptions/${id}/enabled`, { enabled }),
  dispatch: (data: any) => apiClient.post('/notifications/channels/dispatch', data),
  listDeliveries: () => apiClient.get('/notifications/channels/deliveries'),

  listRewards: () => apiClient.get('/notifications/channels/rewards'),
  createReward: (data: any) => apiClient.post('/notifications/channels/rewards', data),
  balance: (employeeId?: string) => apiClient.get('/notifications/channels/rewards/balance', { params: employeeId ? { employeeId } : {} }),
  redeem: (id: string, availablePoints?: number) => apiClient.post(`/notifications/channels/rewards/${id}/redeem`, availablePoints != null ? { availablePoints } : {}),
  listRedemptions: (params?: any) => apiClient.get('/notifications/channels/redemptions', { params }),
  setRedemptionStatus: (id: string, data: { status: string; fulfillmentRef?: string }) => apiClient.patch(`/notifications/channels/redemptions/${id}/status`, data),
};
