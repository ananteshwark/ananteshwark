import { apiClient } from './client';

export const talentApi = {
  // ATS - Job Postings
  getJobPostings: (params?: any) => apiClient.get('/talent/ats/jobs', { params }),
  getJobPosting: (id: string) => apiClient.get(`/talent/ats/jobs/${id}`),
  createJobPosting: (data: any) => apiClient.post('/talent/ats/jobs', data),
  publishJob: (id: string) => apiClient.post(`/talent/ats/jobs/${id}/publish`),
  closeJob: (id: string) => apiClient.post(`/talent/ats/jobs/${id}/close`),
  getHiringFunnel: (id: string) => apiClient.get(`/talent/ats/jobs/${id}/funnel`),

  // ATS - Applicants
  getApplicants: (params?: any) => apiClient.get('/talent/ats/applicants', { params }),
  submitApplication: (data: any) => apiClient.post('/talent/ats/applicants', data),
  shortlistApplicant: (id: string) => apiClient.post(`/talent/ats/applicants/${id}/shortlist`),
  rejectApplicant: (id: string) => apiClient.post(`/talent/ats/applicants/${id}/reject`),

  // ATS - Interviews
  scheduleInterview: (data: any) => apiClient.post('/talent/ats/interviews', data),
  recordFeedback: (id: string, data: any) => apiClient.post(`/talent/ats/interviews/${id}/feedback`, data),

  // ATS - Offers
  makeOffer: (data: any) => apiClient.post('/talent/ats/offers', data),
  acceptOffer: (id: string) => apiClient.post(`/talent/ats/offers/${id}/accept`),
  declineOffer: (id: string) => apiClient.post(`/talent/ats/offers/${id}/decline`),

  // Onboarding
  getOnboardingTemplates: () => apiClient.get('/talent/onboarding/templates'),
  createOnboardingTemplate: (data: any) => apiClient.post('/talent/onboarding/templates', data),
  getOnboardingPlans: (params?: any) => apiClient.get('/talent/onboarding/plans', { params }),
  createOnboardingPlan: (data: any) => apiClient.post('/talent/onboarding/plans', data),
  getEmployeeOnboarding: (employeeId: string) => apiClient.get(`/talent/onboarding/employee/${employeeId}`),
  updateOnboardingTask: (taskId: string, data: any) => apiClient.patch(`/talent/onboarding/tasks/${taskId}`, data),

  // Learning
  getCourses: (params?: any) => apiClient.get('/talent/learning/courses', { params }),
  createCourse: (data: any) => apiClient.post('/talent/learning/courses', data),
  enroll: (data: any) => apiClient.post('/talent/learning/enrollments', data),
  updateEnrollment: (id: string, data: any) => apiClient.patch(`/talent/learning/enrollments/${id}`, data),
  getMyEnrollments: (employeeId: string) => apiClient.get(`/talent/learning/enrollments/employee/${employeeId}`),
  getEmployeeSkills: (employeeId: string) => apiClient.get(`/talent/learning/skills/employee/${employeeId}`),
  upsertSkill: (data: any) => apiClient.post('/talent/learning/skills', data),

  // Succession
  getSuccessionPlans: (params?: any) => apiClient.get('/talent/succession/plans', { params }),
  getSuccessionPlan: (id: string) => apiClient.get(`/talent/succession/plans/${id}`),
  createSuccessionPlan: (data: any) => apiClient.post('/talent/succession/plans', data),
  updateSuccessionPlan: (id: string, data: any) => apiClient.patch(`/talent/succession/plans/${id}`, data),
  addSuccessorCandidate: (data: any) => apiClient.post('/talent/succession/candidates', data),

  // Goals / OKRs
  getOkrCycles: () => apiClient.get('/talent/goals/cycles'),
  createOkrCycle: (data: any) => apiClient.post('/talent/goals/cycles', data),
  getCycleDashboard: (cycleId: string) => apiClient.get(`/talent/goals/cycles/${cycleId}/dashboard`),
  getObjectives: (params?: any) => apiClient.get('/talent/goals/objectives', { params }),
  createObjective: (data: any) => apiClient.post('/talent/goals/objectives', data),
  getKeyResults: (objectiveId: string) => apiClient.get(`/talent/goals/objectives/${objectiveId}/key-results`),
  createKeyResult: (data: any) => apiClient.post('/talent/goals/key-results', data),
  updateKrProgress: (id: string, data: any) => apiClient.post(`/talent/goals/key-results/${id}/progress`, data),

  // Performance
  getReviewCycles: () => apiClient.get('/talent/performance/cycles'),
  createReviewCycle: (data: any) => apiClient.post('/talent/performance/cycles', data),
  getReviewCycle: (id: string) => apiClient.get(`/talent/performance/cycles/${id}`),
  launchReviews: (id: string, data: any) => apiClient.post(`/talent/performance/cycles/${id}/launch`, data),
  getReviewForms: (params?: any) => apiClient.get('/talent/performance/forms', { params }),
  submitReview: (id: string, data: any) => apiClient.post(`/talent/performance/forms/${id}/submit`, data),
  listCalibrations: () => apiClient.get('/talent/performance/calibrations'),
  createCalibration: (data: any) => apiClient.post('/talent/performance/calibrations', data),
  recordCalibration: (id: string, data: any) => apiClient.post(`/talent/performance/calibrations/${id}/record`, data),
  completeCalibration: (id: string) => apiClient.post(`/talent/performance/calibrations/${id}/complete`),
  getReviewSummary: (cycleId: string, employeeId: string) => apiClient.get(`/talent/performance/summary/${cycleId}/${employeeId}`),

  // Appraisal
  getAppraisalResults: (params?: any) => apiClient.get('/talent/appraisal/results', { params }),
  createAppraisalResult: (data: any) => apiClient.post('/talent/appraisal/results', data),
  approveAppraisalResult: (id: string) => apiClient.post(`/talent/appraisal/results/${id}/approve`),
  getEmployeeAppraisalHistory: (employeeId: string) => apiClient.get(`/talent/appraisal/employee/${employeeId}/history`),
};
