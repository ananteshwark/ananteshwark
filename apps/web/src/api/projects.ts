import { apiClient } from './client';

export const projectsApi = {
  // Projects
  getProjects: (params?: any) => apiClient.get('/projects', { params }),
  getProject: (id: string) => apiClient.get(`/projects/${id}`),
  getProjectSummary: (id: string) => apiClient.get(`/projects/${id}/summary`),
  createProject: (data: any) => apiClient.post('/projects', data),
  updateProject: (id: string, data: any) => apiClient.patch(`/projects/${id}`, data),
  getDashboard: () => apiClient.get('/projects/dashboard'),

  // Tasks
  getTasks: (projectId: string, params?: any) => apiClient.get(`/projects/${projectId}/tasks`, { params }),
  createTask: (projectId: string, data: any) => apiClient.post(`/projects/${projectId}/tasks`, data),
  updateTask: (projectId: string, taskId: string, data: any) => apiClient.patch(`/projects/${projectId}/tasks/${taskId}`, data),

  // Time Entries
  getTimeEntries: (projectId: string, params?: any) => apiClient.get(`/projects/${projectId}/time-entries`, { params }),
  createTimeEntry: (projectId: string, data: any) => apiClient.post(`/projects/${projectId}/time-entries`, data),

  // Members
  getMembers: (projectId: string) => apiClient.get(`/projects/${projectId}/members`),
  addMember: (projectId: string, data: any) => apiClient.post(`/projects/${projectId}/members`, data),

  // Expenses
  getProjectExpenses: (projectId: string) => apiClient.get(`/projects/${projectId}/expenses`),
  createProjectExpense: (projectId: string, data: any) => apiClient.post(`/projects/${projectId}/expenses`, data),
};
