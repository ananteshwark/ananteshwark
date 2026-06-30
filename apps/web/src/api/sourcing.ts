import { apiClient } from './client';

export const sourcingApi = {
  listEvents: () => apiClient.get('/procurement/sourcing/events'),
  createEvent: (data: any) => apiClient.post('/procurement/sourcing/events', data),
  listLines: (id: string) => apiClient.get(`/procurement/sourcing/events/${id}/lines`),
  addLine: (id: string, data: any) => apiClient.post(`/procurement/sourcing/events/${id}/lines`, data),
  publish: (id: string) => apiClient.post(`/procurement/sourcing/events/${id}/publish`),
  submitBid: (id: string, data: any) => apiClient.post(`/procurement/sourcing/events/${id}/bids`, data),
  listBids: (id: string, lineId?: string) => apiClient.get(`/procurement/sourcing/events/${id}/bids`, { params: lineId ? { lineId } : {} }),
  nextRound: (id: string) => apiClient.post(`/procurement/sourcing/events/${id}/next-round`),
  scoreLine: (id: string, lineId: string) => apiClient.get(`/procurement/sourcing/events/${id}/lines/${lineId}/score`),
  awardLine: (id: string, lineId: string, awards: any[]) => apiClient.post(`/procurement/sourcing/events/${id}/lines/${lineId}/award`, { awards }),
  listAwards: (id: string) => apiClient.get(`/procurement/sourcing/events/${id}/awards`),
  awardToPo: (id: string) => apiClient.post(`/procurement/sourcing/events/${id}/award-to-po`),
};
