import { apiClient } from './client';

// Employee journeys: event-triggered step templates and running instances.
export const journeysApi = {
  listTemplates: () => apiClient.get('/hr/journeys/templates'),
  createTemplate: (data: any) => apiClient.post('/hr/journeys/templates', data),
  updateTemplate: (id: string, data: any) => apiClient.patch(`/hr/journeys/templates/${id}`, data),
  triggerTemplate: (id: string, data: any) => apiClient.post(`/hr/journeys/templates/${id}/trigger`, data),
  triggerEvent: (event: string, data: any) => apiClient.post(`/hr/journeys/trigger/${event}`, data),
  listInstances: (params?: any) => apiClient.get('/hr/journeys/instances', { params }),
  getInstance: (id: string) => apiClient.get(`/hr/journeys/instances/${id}`),
  cancelInstance: (id: string) => apiClient.post(`/hr/journeys/instances/${id}/cancel`),
  completeStep: (stepId: string) => apiClient.post(`/hr/journeys/steps/${stepId}/complete`),
  skipStep: (stepId: string) => apiClient.post(`/hr/journeys/steps/${stepId}/skip`),
  listOverdue: () => apiClient.get('/hr/journeys/overdue'),
};
