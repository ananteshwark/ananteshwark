import { apiClient } from './client';

export const serviceDeskApi = {
  createArticle: (data: any) => apiClient.post('/crm/service-desk/articles', data),
  publishArticle: (id: string) => apiClient.post(`/crm/service-desk/articles/${id}/publish`),
  rateArticle: (id: string, helpful: boolean) => apiClient.post(`/crm/service-desk/articles/${id}/rate`, { helpful }),
  searchArticles: (term?: string, publicOnly?: boolean) => apiClient.get('/crm/service-desk/articles/search', { params: { term, publicOnly } }),
  listRules: () => apiClient.get('/crm/service-desk/routing-rules'),
  createRule: (data: any) => apiClient.post('/crm/service-desk/routing-rules', data),
  emailToTicket: (data: any) => apiClient.post('/crm/service-desk/email-to-ticket', data),
  portalTickets: (customerId: string) => apiClient.get('/crm/service-desk/portal/tickets', { params: { customerId } }),
  portalCreate: (data: any) => apiClient.post('/crm/service-desk/portal/tickets', data),
  escalationCandidates: (now: string, warnMinutes = 60) => apiClient.get('/crm/service-desk/sla/escalation-candidates', { params: { now, warnMinutes } }),
  escalate: (id: string, managerUserId: string) => apiClient.post(`/crm/service-desk/tickets/${id}/escalate`, { managerUserId }),
};
