import { apiClient } from './client';

export const skillsApi = {
  listCategories: () => apiClient.get('/hr/skills/categories'),
  createCategory: (data: any) => apiClient.post('/hr/skills/categories', data),
  listSkills: (categoryId?: string) => apiClient.get('/hr/skills/catalog', { params: categoryId ? { categoryId } : {} }),
  createSkill: (data: any) => apiClient.post('/hr/skills/catalog', data),
  listEmployeeSkills: (employeeId: string) => apiClient.get(`/hr/skills/employees/${employeeId}`),
  assignSkill: (data: any) => apiClient.post('/hr/skills/employees', data),
  removeEmployeeSkill: (id: string) => apiClient.delete(`/hr/skills/employees/${id}`),
  listJobRequirements: (jobId: string) => apiClient.get(`/hr/skills/jobs/${jobId}/requirements`),
  setJobRequirement: (data: any) => apiClient.post('/hr/skills/jobs/requirements', data),
  gapAnalysis: (employeeId: string, jobId: string) => apiClient.get('/hr/skills/gap', { params: { employeeId, jobId } }),
  departmentGap: (jobId: string, employeeIds: string[]) => apiClient.post('/hr/skills/department-gap', { jobId, employeeIds }),
  recommendLearning: (employeeId: string, jobId: string) => apiClient.get('/hr/skills/recommend-learning', { params: { employeeId, jobId } }),
};
