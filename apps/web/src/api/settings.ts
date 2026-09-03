import { apiClient } from './client';

export const settingsApi = {
  getAllFieldConfigs: () => apiClient.get('/settings/field-config'),
  getModuleFieldConfig: (module: string) => apiClient.get(`/settings/field-config/${module}`),
  updateModuleFieldConfig: (module: string, configs: any[]) =>
    apiClient.patch(`/settings/field-config/${module}`, { configs }),
  getDefaults: () => apiClient.get('/settings/field-config/defaults'),
};
