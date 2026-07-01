import { apiClient } from './client';

export const bpmApi = {
  listProcesses: () => apiClient.get('/workflow/bpm/processes'),
  createProcess: (data: any) => apiClient.post('/workflow/bpm/processes', data),
  start: (id: string, subjectRef: string, startAt: string) => apiClient.post(`/workflow/bpm/processes/${id}/start`, { subjectRef, startAt }),
  decide: (taskId: string, decision: 'APPROVE' | 'REJECT', at: string, comment?: string) => apiClient.post(`/workflow/bpm/tasks/${taskId}/decide`, { decision, at, comment }),
  listTasks: (assignedTo?: string, status?: string) => apiClient.get('/workflow/bpm/tasks', { params: { assignedTo, status } }),
  instance: (id: string) => apiClient.get(`/workflow/bpm/instances/${id}`),
  checkEscalations: (now: string) => apiClient.post('/workflow/bpm/check-escalations', { now }),
  setDelegation: (data: any) => apiClient.post('/workflow/bpm/delegations', data),
};
