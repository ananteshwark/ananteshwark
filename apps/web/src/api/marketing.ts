import { apiClient } from './client';

export const marketingApi = {
  listCampaigns: () => apiClient.get('/marketing/campaigns'),
  createCampaign: (data: any) => apiClient.post('/marketing/campaigns', data),
  updateCampaign: (id: string, data: any) => apiClient.patch(`/marketing/campaigns/${id}`, data),
  addMembers: (id: string, leadIds: string[]) => apiClient.post(`/marketing/campaigns/${id}/members`, { leadIds }),
  schedule: (id: string, scheduledAt: string) => apiClient.post(`/marketing/campaigns/${id}/schedule`, { scheduledAt }),
  send: (id: string, sentAt: string) => apiClient.post(`/marketing/campaigns/${id}/send`, { sentAt }),
  engagement: (id: string, event: string) => apiClient.post(`/marketing/members/${id}/engagement`, { event }),
  stats: (id: string) => apiClient.get(`/marketing/campaigns/${id}/stats`),
  behavior: (data: any) => apiClient.post('/marketing/leads/behavior', data),
  score: (leadId: string) => apiClient.get(`/marketing/leads/${leadId}/score`),
  topLeads: (limit = 20) => apiClient.get('/marketing/leads/top', { params: { limit } }),
  listFlows: () => apiClient.get('/marketing/nurture-flows'),
  createFlow: (data: any) => apiClient.post('/marketing/nurture-flows', data),
  triggerFlows: (data: any) => apiClient.post('/marketing/nurture-flows/trigger', data),
  conversion: (id: string, data: any) => apiClient.post(`/marketing/members/${id}/conversion`, data),
  roi: (id: string) => apiClient.get(`/marketing/campaigns/${id}/roi`),
};
