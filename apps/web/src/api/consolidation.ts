import { apiClient } from './client';

export const consolidationApi = {
  // Groups
  listGroups: () => apiClient.get('/finance/consolidation/groups'),
  getGroup: (id: string) => apiClient.get(`/finance/consolidation/groups/${id}`),
  createGroup: (data: any) => apiClient.post('/finance/consolidation/groups', data),
  updateGroup: (id: string, data: any) =>
    apiClient.patch(`/finance/consolidation/groups/${id}`, data),

  // Runs
  listRuns: (groupId?: string) =>
    apiClient.get('/finance/consolidation/runs', { params: groupId ? { groupId } : {} }),
  getRun: (id: string) => apiClient.get(`/finance/consolidation/runs/${id}`),
  runConsolidation: (data: { groupId: string; periodStart: string; periodEnd: string }) =>
    apiClient.post('/finance/consolidation/run', data),
};
