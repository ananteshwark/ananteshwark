import { apiClient } from './client';

export const platformApi = {
  // SSO Providers
  getSsoProviders: () => apiClient.get('/platform/sso-providers'),
  createSsoProvider: (data: any) => apiClient.post('/platform/sso-providers', data),
  toggleSsoProvider: (id: string) => apiClient.patch(`/platform/sso-providers/${id}/toggle`),

  // SoD Rules
  getSodRules: () => apiClient.get('/platform/sod-rules'),
  createSodRule: (data: any) => apiClient.post('/platform/sod-rules', data),
  getSodViolations: () => apiClient.get('/platform/sod-violations'),
  runSodCheck: (userId: string, permissions: string[]) => apiClient.post(`/platform/sod-check/${userId}`, { permissions }),
  mitigateViolation: (id: string, notes: string) => apiClient.patch(`/platform/sod-violations/${id}/mitigate`, { notes }),

  // Tax Codes
  getTaxCodes: () => apiClient.get('/platform/tax-codes'),
  createTaxCode: (data: any) => apiClient.post('/platform/tax-codes', data),
  computeTax: (data: any) => apiClient.post('/platform/tax-codes/compute', data),

  // Data Retention
  getRetentionPolicies: () => apiClient.get('/platform/data-retention'),
  createRetentionPolicy: (data: any) => apiClient.post('/platform/data-retention', data),
};
