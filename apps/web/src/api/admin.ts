import { apiClient } from './client';

// Super-admin only: cross-tenant tenant + license management.
export const adminApi = {
  getTenants: () => apiClient.get('/admin/tenants'),
  getTenant: (id: string) => apiClient.get(`/admin/tenants/${id}`),
  createTenant: (data: any) => apiClient.post('/admin/tenants', data),
  updateTenant: (id: string, data: any) => apiClient.patch(`/admin/tenants/${id}`, data),
  suspendTenant: (id: string) => apiClient.patch(`/admin/tenants/${id}/suspend`),
  activateTenant: (id: string) => apiClient.patch(`/admin/tenants/${id}/activate`),

  // License allocation
  allocateLicense: (id: string, data: any) => apiClient.post(`/admin/tenants/${id}/license`, data),
  updateLicense: (id: string, data: any) => apiClient.patch(`/admin/tenants/${id}/license`, data),
  revokeLicense: (id: string) => apiClient.delete(`/admin/tenants/${id}/license`),
};
