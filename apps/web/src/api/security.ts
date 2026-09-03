import { apiClient } from './client';

export const securityApi = {
  enrollMfa: () => apiClient.post('/security/mfa/enroll'),
  verifyMfa: (code: string, at: string) => apiClient.post('/security/mfa/verify', { code, at }),
  listAllowlist: () => apiClient.get('/security/ip-allowlist'),
  addAllowlist: (data: any) => apiClient.post('/security/ip-allowlist', data),
  ipCheck: (ip: string) => apiClient.get('/security/ip-check', { params: { ip } }),
  recordSession: (data: any) => apiClient.post('/security/sessions', data),
  listSessions: (userId?: string) => apiClient.get('/security/sessions', { params: userId ? { userId } : {} }),
  revokeSession: (id: string) => apiClient.post(`/security/sessions/${id}/revoke`),
  encrypt: (value: string) => apiClient.post('/security/encrypt', { value }),
  decrypt: (token: string) => apiClient.post('/security/decrypt', { token }),
};
