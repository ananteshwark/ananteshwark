import { apiClient } from './client';

export const grirApi = {
  getOpenItems: () => apiClient.get('/finance/grir/open'),
  getReport: () => apiClient.get('/finance/grir/report'),
  autoMatch: () => apiClient.post('/finance/grir/auto-match'),
};
