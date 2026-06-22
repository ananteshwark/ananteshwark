import { apiClient } from './client';

export const emailApi = {
  getSmtpConfig: () => apiClient.get('/email/smtp-config'),
  saveSmtpConfig: (data: any) => apiClient.post('/email/smtp-config', data),
  testSmtp: (to?: string) => apiClient.post('/email/smtp-config/test', { to }),

  listTemplates: () => apiClient.get('/email/templates'),
  saveTemplate: (data: any) => apiClient.post('/email/templates', data),
  updateTemplate: (id: string, data: any) => apiClient.patch(`/email/templates/${id}`, data),

  getLogs: (limit = 100) => apiClient.get('/email/logs', { params: { limit } }),
};
