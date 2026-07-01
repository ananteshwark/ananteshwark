import { apiClient } from './client';

export const integrationApi = {
  listAdapters: () => apiClient.get('/integration/adapters'),
  createAdapter: (data: any) => apiClient.post('/integration/adapters', data),
  connectors: () => apiClient.get('/integration/connectors'),
  fromConnector: (connectorKey: string, code: string) => apiClient.post('/integration/adapters/from-connector', { connectorKey, code }),
  publish: (adapterId: string, eventType: string, payload: any) => apiClient.post('/integration/events', { adapterId, eventType, payload }),
  deliver: (id: string, success: boolean, at: string, error?: string) => apiClient.post(`/integration/events/${id}/deliver`, { success, at, error }),
  replay: (id: string) => apiClient.post(`/integration/events/${id}/replay`),
  listEvents: (adapterId?: string) => apiClient.get('/integration/events', { params: adapterId ? { adapterId } : {} }),
  monitoring: () => apiClient.get('/integration/monitoring'),
};
