import { apiClient } from './client';

// Extension marketplace: versioned manifest listings + tenant installs.
export const marketplaceApi = {
  browse: () => apiClient.get('/platform/marketplace/listings'),
  publish: (data: any) => apiClient.post('/platform/marketplace/listings', data),
  installed: () => apiClient.get('/platform/marketplace/installed'),
  menu: () => apiClient.get('/platform/marketplace/menu'),
  install: (slug: string, config?: Record<string, any>) =>
    apiClient.post(`/platform/marketplace/installs/${slug}`, { config }),
  uninstall: (slug: string) => apiClient.delete(`/platform/marketplace/installs/${slug}`),
};
