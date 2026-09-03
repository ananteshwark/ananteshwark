import { apiClient } from './client';

// Alumni network: profiles, directory, documents, tickets.
export const alumniApi = {
  listProfiles: (params?: any) => apiClient.get('/hr/alumni/profiles', { params }),
  invite: (data: any) => apiClient.post('/hr/alumni/profiles/invite', data),
  getProfile: (id: string) => apiClient.get(`/hr/alumni/profiles/${id}`),
  activate: (id: string) => apiClient.post(`/hr/alumni/profiles/${id}/activate`),
  updateProfile: (id: string, data: any) => apiClient.patch(`/hr/alumni/profiles/${id}`, data),
  deactivate: (id: string) => apiClient.post(`/hr/alumni/profiles/${id}/deactivate`),
  directory: () => apiClient.get('/hr/alumni/directory'),
  rehireCandidates: () => apiClient.get('/hr/alumni/rehire-candidates'),
  listDocuments: (id: string) => apiClient.get(`/hr/alumni/profiles/${id}/documents`),
  addDocument: (id: string, data: any) => apiClient.post(`/hr/alumni/profiles/${id}/documents`, data),
  listTickets: () => apiClient.get('/hr/alumni/tickets'),
  createTicket: (id: string, data: any) => apiClient.post(`/hr/alumni/profiles/${id}/tickets`, data),
  assignTicket: (ticketId: string, data: any) => apiClient.post(`/hr/alumni/tickets/${ticketId}/assign`, data),
  resolveTicket: (ticketId: string, data?: any) => apiClient.post(`/hr/alumni/tickets/${ticketId}/resolve`, data ?? {}),
  closeTicket: (ticketId: string) => apiClient.post(`/hr/alumni/tickets/${ticketId}/close`),
};
