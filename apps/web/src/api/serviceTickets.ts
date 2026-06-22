import { apiClient } from './client';

const unwrap = (res: any) => res.data?.data ?? res.data;

export const serviceTicketsApi = {
  // Tickets
  list: (params?: any) => apiClient.get('/crm/tickets', { params }).then(unwrap),
  get: (id: string) => apiClient.get(`/crm/tickets/${id}`).then(unwrap),
  dashboard: () => apiClient.get('/crm/tickets/dashboard').then(unwrap),
  create: (data: any) => apiClient.post('/crm/tickets', data).then(unwrap),
  updateStatus: (id: string, status: string) =>
    apiClient.patch(`/crm/tickets/${id}/status`, { status }).then(unwrap),
  addComment: (id: string, data: { body: string; isInternal?: boolean }) =>
    apiClient.post(`/crm/tickets/${id}/comments`, data).then(unwrap),
  assign: (id: string, assignedToUserId: string | null) =>
    apiClient.patch(`/crm/tickets/${id}/assign`, { assignedToUserId }).then(unwrap),
  setCsat: (id: string, csatScore: number) =>
    apiClient.post(`/crm/tickets/${id}/csat`, { csatScore }).then(unwrap),

  // SLA policies
  listSla: () => apiClient.get('/crm/sla-policies').then(unwrap),
  saveSla: (data: any) => apiClient.post('/crm/sla-policies', data).then(unwrap),
};
