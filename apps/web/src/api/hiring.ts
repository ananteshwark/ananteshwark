import { apiClient } from './client';

export const hiringApi = {
  // Dashboard & pipeline
  getDashboard: () => apiClient.get('/talent/hiring/dashboard'),
  getPipeline: () => apiClient.get('/talent/hiring/pipeline'),

  // Requisitions
  getRequisitions: (params?: any) => apiClient.get('/talent/hiring/requisitions', { params }),
  getRequisition: (id: string) => apiClient.get(`/talent/hiring/requisitions/${id}`),
  createRequisition: (data: any) => apiClient.post('/talent/hiring/requisitions', data),
  updateRequisition: (id: string, data: any) => apiClient.patch(`/talent/hiring/requisitions/${id}`, data),
  submitRequisition: (id: string) => apiClient.post(`/talent/hiring/requisitions/${id}/submit`),
  approveRequisition: (id: string) => apiClient.post(`/talent/hiring/requisitions/${id}/approve`),
  rejectRequisition: (id: string, data: any) => apiClient.post(`/talent/hiring/requisitions/${id}/reject`, data),
  openRequisition: (id: string) => apiClient.post(`/talent/hiring/requisitions/${id}/open`),
  cancelRequisition: (id: string) => apiClient.post(`/talent/hiring/requisitions/${id}/cancel`),

  // Interviews
  getInterviews: (params?: any) => apiClient.get('/talent/hiring/interviews', { params }),
  scheduleInterview: (data: any) => apiClient.post('/talent/hiring/interviews', data),
  recordFeedback: (id: string, data: any) => apiClient.post(`/talent/hiring/interviews/${id}/feedback`, data),

  // Offers
  getOffers: (params?: any) => apiClient.get('/talent/hiring/offers', { params }),
  makeOffer: (data: any) => apiClient.post('/talent/hiring/offers', data),
  acceptOffer: (id: string) => apiClient.post(`/talent/hiring/offers/${id}/accept`),
  declineOffer: (id: string) => apiClient.post(`/talent/hiring/offers/${id}/decline`),

  // Applicant actions
  shortlistApplicant: (id: string) => apiClient.post(`/talent/hiring/applicants/${id}/shortlist`),
  rejectApplicant: (id: string) => apiClient.post(`/talent/hiring/applicants/${id}/reject`),

  // ATS - applications
  submitApplication: (data: any) => apiClient.post('/talent/ats/applicants', data),
};
