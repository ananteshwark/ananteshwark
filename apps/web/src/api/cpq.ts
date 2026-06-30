import { apiClient } from './client';

export const cpqApi = {
  listModels: () => apiClient.get('/sales/cpq/models'),
  createModel: (data: any) => apiClient.post('/sales/cpq/models', data),
  validate: (modelCode: string, selectedOptions: string[]) => apiClient.post('/sales/cpq/validate', { modelCode, selectedOptions }),
  createQuote: (data: any) => apiClient.post('/sales/cpq/quotes', data),
  listQuotes: () => apiClient.get('/sales/cpq/quotes'),
  submit: (id: string) => apiClient.post(`/sales/cpq/quotes/${id}/submit`),
  decide: (id: string, decision: 'APPROVE' | 'REJECT') => apiClient.post(`/sales/cpq/quotes/${id}/decision`, { decision }),
  createQuestionnaire: (data: any) => apiClient.post('/sales/cpq/questionnaires', data),
  recommend: (code: string, answers: any[]) => apiClient.post('/sales/cpq/recommend', { code, answers }),
  document: (id: string) => apiClient.get(`/sales/cpq/quotes/${id}/document`),
  convert: (id: string) => apiClient.post(`/sales/cpq/quotes/${id}/convert`),
};
