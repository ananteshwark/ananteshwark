import { apiClient } from './client';

export const crmApi = {
  // Contacts
  getContacts: (params?: any) => apiClient.get('/crm/contacts', { params }),
  getContact: (id: string) => apiClient.get(`/crm/contacts/${id}`),
  createContact: (data: any) => apiClient.post('/crm/contacts', data),
  updateContact: (id: string, data: any) => apiClient.patch(`/crm/contacts/${id}`, data),

  // Opportunities
  getOpportunities: (params?: any) => apiClient.get('/crm/opportunities', { params }),
  createOpportunity: (data: any) => apiClient.post('/crm/opportunities', data),
  updateOpportunity: (id: string, data: any) => apiClient.patch(`/crm/opportunities/${id}`, data),
  getPipeline: () => apiClient.get('/crm/pipeline'),

  // Activities
  getActivities: (params?: any) => apiClient.get('/crm/activities', { params }),
  createActivity: (data: any) => apiClient.post('/crm/activities', data),
  updateActivity: (id: string, data: any) => apiClient.patch(`/crm/activities/${id}`, data),

  // Quotes
  getQuotes: (params?: any) => apiClient.get('/crm/quotes', { params }),
  createQuote: (data: any) => apiClient.post('/crm/quotes', data),
  updateQuote: (id: string, data: any) => apiClient.patch(`/crm/quotes/${id}`, data),
};
