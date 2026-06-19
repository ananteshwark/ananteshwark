import { apiClient } from './client';

export const expensesApi = {
  // Categories
  getCategories: (params?: any) => apiClient.get('/expenses/categories', { params }),
  createCategory: (data: any) => apiClient.post('/expenses/categories', data),
  updateCategory: (id: string, data: any) => apiClient.patch(`/expenses/categories/${id}`, data),

  // Claims
  getClaims: (params?: any) => apiClient.get('/expenses/claims', { params }),
  getClaim: (id: string) => apiClient.get(`/expenses/claims/${id}`),
  createClaim: (data: any) => apiClient.post('/expenses/claims', data),
  submitClaim: (id: string) => apiClient.post(`/expenses/claims/${id}/submit`),
  approveClaim: (id: string) => apiClient.post(`/expenses/claims/${id}/approve`),
  rejectClaim: (id: string, data: any) => apiClient.post(`/expenses/claims/${id}/reject`, data),
  markPaid: (id: string) => apiClient.post(`/expenses/claims/${id}/pay`),

  // Policies
  getPolicies: (params?: any) => apiClient.get('/expenses/policies', { params }),
  createPolicy: (data: any) => apiClient.post('/expenses/policies', data),
};
