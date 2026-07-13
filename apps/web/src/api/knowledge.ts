import { apiClient } from './client';

// Knowledge base: categories, articles, search, email intake.
export const knowledgeApi = {
  listCategories: () => apiClient.get('/knowledge/categories'),
  createCategory: (data: any) => apiClient.post('/knowledge/categories', data),
  listArticles: (params?: any) => apiClient.get('/knowledge/articles', { params }),
  createArticle: (data: any) => apiClient.post('/knowledge/articles', data),
  getArticle: (id: string) => apiClient.get(`/knowledge/articles/${id}`),
  updateArticle: (id: string, data: any) => apiClient.patch(`/knowledge/articles/${id}`, data),
  publishArticle: (id: string) => apiClient.post(`/knowledge/articles/${id}/publish`),
  archiveArticle: (id: string) => apiClient.post(`/knowledge/articles/${id}/archive`),
  recordView: (id: string) => apiClient.post(`/knowledge/articles/${id}/view`),
  vote: (id: string, helpful: boolean) => apiClient.post(`/knowledge/articles/${id}/vote`, { helpful }),
  search: (q: string) => apiClient.get('/knowledge/search', { params: { q } }),
  listEmailIntake: () => apiClient.get('/knowledge/email-intake'),
  ingestEmail: (data: any) => apiClient.post('/knowledge/email-intake', data),
  convertEmail: (id: string, data?: any) => apiClient.post(`/knowledge/email-intake/${id}/convert`, data ?? {}),
  ignoreEmail: (id: string) => apiClient.post(`/knowledge/email-intake/${id}/ignore`),
};
