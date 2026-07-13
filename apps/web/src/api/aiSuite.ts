import { apiClient } from './client';

// AI suite: career matching, expense OCR/risk, CV parsing, survey analytics,
// merit insights and WFM recommendations. Everything degrades gracefully when
// no LLM key is configured server-side.
export const aiSuiteApi = {
  // Career
  careerStatus: () => apiClient.get('/ai/career/status'),
  jobMatches: (employeeId: string) => apiClient.get(`/ai/career/employees/${employeeId}/job-matches`),
  roleClusters: () => apiClient.get('/ai/career/role-clusters'),
  roleFit: (employeeId: string, jobId: string) => apiClient.get(`/ai/career/employees/${employeeId}/role-fit/${jobId}`),
  careerReflection: (data: any) => apiClient.post('/ai/career/reflection', data),

  // Expense
  ocrUsage: (month: string) => apiClient.get('/ai/expense/ocr/usage', { params: { month } }),
  ocrExtract: (data: any) => apiClient.post('/ai/expense/ocr/extract', data),
  scoreClaim: (data: any) => apiClient.post('/ai/expense/risk/score-claim', data),

  // Recruiting
  cvUsage: (month: string) => apiClient.get('/ai/recruiting/cv/usage', { params: { month } }),
  cvParse: (data: any) => apiClient.post('/ai/recruiting/cv/parse', data),
  proposeSlots: (data: any) => apiClient.post('/ai/recruiting/schedule/propose', data),

  // Survey analytics
  sentiment: (texts: string[]) => apiClient.post('/ai/survey/sentiment', { texts }),
  themes: (comments: string[]) => apiClient.post('/ai/survey/themes', { comments }),
  heatmap: (data: any) => apiClient.post('/ai/survey/heatmap', data),
  surveySummary: (data: any) => apiClient.post('/ai/survey/summary', data),

  // Insights
  meritOutliers: (data: any) => apiClient.post('/ai/insights/merit/outliers', data),
  biasAlerts: (data: any) => apiClient.post('/ai/insights/merit/bias-alerts', data),
  staffing: (data: any) => apiClient.post('/ai/insights/wfm/staffing', data),

  // Learning
  inferSkills: (data: any) => apiClient.post('/ai/learning/infer-skills', data),
  recommendCourses: (employeeId: string, jobId: string) => apiClient.get(`/ai/learning/recommend/${employeeId}/${jobId}`),
};
