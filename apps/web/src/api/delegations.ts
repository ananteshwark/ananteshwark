import { apiClient } from './client';

export interface DelegationFilters {
  delegatorUserId?: string;
  delegateeUserId?: string;
  active?: boolean;
}

export const delegationsApi = {
  list: (filters: DelegationFilters = {}) =>
    apiClient.get('/delegations', { params: filters }),
  active: () => apiClient.get('/delegations/active'),
  create: (data: any) => apiClient.post('/delegations', data),
  update: (id: string, data: any) => apiClient.patch(`/delegations/${id}`, data),
  revoke: (id: string) => apiClient.post(`/delegations/${id}/revoke`),
};
