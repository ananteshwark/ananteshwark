import { apiClient } from './client';

export const projectResourcesApi = {
  list: () => apiClient.get('/projects/resources'),
  create: (data: any) => apiClient.post('/projects/resources', data),
  bySkill: (skill: string, grade?: string) => apiClient.get('/projects/resources/by-skill', { params: grade ? { skill, grade } : { skill } }),
  listRequests: (status?: string) => apiClient.get('/projects/resources/requests', { params: status ? { status } : {} }),
  createRequest: (data: any) => apiClient.post('/projects/resources/requests', data),
  fulfill: (id: string, resourceId: string) => apiClient.post(`/projects/resources/requests/${id}/fulfill`, { resourceId }),
  reject: (id: string) => apiClient.post(`/projects/resources/requests/${id}/reject`),
  allocate: (data: any) => apiClient.post('/projects/resources/allocations', data),
  utilization: (week: string) => apiClient.get('/projects/resources/utilization', { params: { week } }),
};
