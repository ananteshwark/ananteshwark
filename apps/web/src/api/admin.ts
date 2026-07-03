import { apiClient } from './client';

// Super-admin only: cross-tenant tenant + license management.
export const adminApi = {
  getTenants: (includeHidden = false) =>
    apiClient.get('/admin/tenants', { params: includeHidden ? { includeHidden: true } : {} }),
  getTenant: (id: string) => apiClient.get(`/admin/tenants/${id}`),
  createTenant: (data: any) => apiClient.post('/admin/tenants', data),
  updateTenant: (id: string, data: any) => apiClient.patch(`/admin/tenants/${id}`, data),
  suspendTenant: (id: string) => apiClient.patch(`/admin/tenants/${id}/suspend`),
  activateTenant: (id: string) => apiClient.patch(`/admin/tenants/${id}/activate`),
  hideTenant: (id: string) => apiClient.patch(`/admin/tenants/${id}/hide`),
  unhideTenant: (id: string) => apiClient.patch(`/admin/tenants/${id}/unhide`),

  // Tenant admins
  addTenantAdmin: (id: string, data: any) => apiClient.post(`/admin/tenants/${id}/admins`, data),
  updateTenantAdmin: (id: string, userId: string, data: any) =>
    apiClient.patch(`/admin/tenants/${id}/admins/${userId}`, data),

  // License allocation
  allocateLicense: (id: string, data: any) => apiClient.post(`/admin/tenants/${id}/license`, data),
  updateLicense: (id: string, data: any) => apiClient.patch(`/admin/tenants/${id}/license`, data),
  revokeLicense: (id: string) => apiClient.delete(`/admin/tenants/${id}/license`),
};
