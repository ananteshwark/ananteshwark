import { apiClient } from './client';

export interface PicklistOption {
  id: string;
  picklistId: string;
  value: string;
  label: string;
  sortOrder: number;
  active: boolean;
  color?: string | null;
}

export interface Picklist {
  id: string;
  module: string;
  key: string;
  label: string;
  description?: string | null;
  isSystem: boolean;
  options: PicklistOption[];
}

export const picklistsApi = {
  list: (module?: string) => apiClient.get<Picklist[]>('/settings/picklists', { params: module ? { module } : {} }),
  modules: () => apiClient.get<string[]>('/settings/picklists/modules'),
  resolve: (key: string) => apiClient.get<PicklistOption[]>(`/settings/picklists/resolve/${key}`),
  create: (data: { module: string; key: string; label: string; description?: string }) => apiClient.post('/settings/picklists', data),
  update: (id: string, data: { label?: string; description?: string }) => apiClient.patch(`/settings/picklists/${id}`, data),
  remove: (id: string) => apiClient.delete(`/settings/picklists/${id}`),
  addOption: (id: string, data: { value: string; label: string; color?: string }) => apiClient.post(`/settings/picklists/${id}/options`, data),
  updateOption: (optionId: string, data: Partial<PicklistOption>) => apiClient.patch(`/settings/picklists/options/${optionId}`, data),
  deleteOption: (optionId: string) => apiClient.delete(`/settings/picklists/options/${optionId}`),
  reorder: (id: string, orderedIds: string[]) => apiClient.post(`/settings/picklists/${id}/options/reorder`, { orderedIds }),
};
