import { apiClient } from './client';

// HR letters: templates with {{placeholders}} rendered against employee records.
export const lettersApi = {
  getTemplates: (activeOnly = false) => apiClient.get('/letters/templates', { params: { activeOnly } }),
  createTemplate: (data: any) => apiClient.post('/letters/templates', data),
  updateTemplate: (id: string, data: any) => apiClient.patch(`/letters/templates/${id}`, data),
  generate: (data: { templateId: string; employeeId: string; data?: Record<string, any> }) =>
    apiClient.post('/letters/generate', data),
  getIssued: (employeeId?: string) => apiClient.get('/letters/issued', { params: employeeId ? { employeeId } : {} }),
  getLetter: (id: string) => apiClient.get(`/letters/issued/${id}`),
  issue: (id: string) => apiClient.patch(`/letters/issued/${id}/issue`),
  revoke: (id: string) => apiClient.patch(`/letters/issued/${id}/revoke`),
};
