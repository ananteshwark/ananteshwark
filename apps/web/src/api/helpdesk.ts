import { apiClient } from './client';

// HR helpdesk: employee-raised cases with SLA, assignment, and comments.
export const helpdeskApi = {
  createCase: (data: any) => apiClient.post('/helpdesk/cases', data),
  getMyCases: () => apiClient.get('/helpdesk/cases/mine'),
  getCases: (params: any = {}) => apiClient.get('/helpdesk/cases', { params }),
  getCase: (id: string) => apiClient.get(`/helpdesk/cases/${id}`),
  assign: (id: string, assignedToId: string) => apiClient.patch(`/helpdesk/cases/${id}/assign`, { assignedToId }),
  updateStatus: (id: string, status: string, resolutionNotes?: string) =>
    apiClient.patch(`/helpdesk/cases/${id}/status`, { status, resolutionNotes }),
  addComment: (id: string, body: string, internal = false) =>
    apiClient.post(`/helpdesk/cases/${id}/comments`, { body, internal }),
  getComments: (id: string) => apiClient.get(`/helpdesk/cases/${id}/comments`),
  getAllComments: (id: string) => apiClient.get(`/helpdesk/cases/${id}/comments/all`),
};
