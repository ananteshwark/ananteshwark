import { apiClient } from './client';

// Academy certification portal.
export const academyApi = {
  listCertifications: () => apiClient.get('/learning/academy/certifications'),
  createCertification: (data: any) => apiClient.post('/learning/academy/certifications', data),
  listEnrollments: (params?: any) => apiClient.get('/learning/academy/enrollments', { params }),
  enroll: (certId: string, learnerId?: string) => apiClient.post(`/learning/academy/certifications/${certId}/enroll`, learnerId ? { learnerId } : {}),
  recordRequirement: (enrollmentId: string, data: { ref: string; score?: number }) => apiClient.post(`/learning/academy/enrollments/${enrollmentId}/requirement`, data),
  expireSweep: () => apiClient.post('/learning/academy/expire-sweep', {}),
};
