import { apiClient } from './client';

// Employee engagement: pulse surveys, recognition, and the company feed.
export const engagementApi = {
  // Surveys
  getSurveys: (status?: string) => apiClient.get('/engagement/surveys', { params: status ? { status } : {} }),
  createSurvey: (data: any) => apiClient.post('/engagement/surveys', data),
  getSurvey: (id: string) => apiClient.get(`/engagement/surveys/${id}`),
  publishSurvey: (id: string) => apiClient.patch(`/engagement/surveys/${id}/publish`),
  closeSurvey: (id: string) => apiClient.patch(`/engagement/surveys/${id}/close`),
  respond: (id: string, answers: Record<string, any>) => apiClient.post(`/engagement/surveys/${id}/respond`, { answers }),
  hasResponded: (id: string) => apiClient.get(`/engagement/surveys/${id}/responded`),
  getResults: (id: string) => apiClient.get(`/engagement/surveys/${id}/results`),

  // Recognition
  getBadges: (activeOnly = false) => apiClient.get('/engagement/recognition/badges', { params: { activeOnly } }),
  createBadge: (data: any) => apiClient.post('/engagement/recognition/badges', data),
  updateBadge: (id: string, data: any) => apiClient.patch(`/engagement/recognition/badges/${id}`, data),
  giveRecognition: (data: any) => apiClient.post('/engagement/recognition', data),
  getWall: (page = 1, limit = 20) => apiClient.get('/engagement/recognition/wall', { params: { page, limit } }),
  getLeaderboard: (since?: string) => apiClient.get('/engagement/recognition/leaderboard', { params: since ? { since } : {} }),

  // Company feed
  getFeed: (page = 1, limit = 20) => apiClient.get('/engagement/feed', { params: { page, limit } }),
  createPost: (data: any) => apiClient.post('/engagement/feed/posts', data),
  createAnnouncement: (data: any) => apiClient.post('/engagement/feed/announcements', data),
  toggleLike: (postId: string) => apiClient.post(`/engagement/feed/posts/${postId}/like`),
  vote: (postId: string, optionId: string) => apiClient.post(`/engagement/feed/posts/${postId}/vote`, { optionId }),
  getComments: (postId: string) => apiClient.get(`/engagement/feed/posts/${postId}/comments`),
  addComment: (postId: string, body: string) => apiClient.post(`/engagement/feed/posts/${postId}/comments`, { body }),
  pinPost: (postId: string, pinned: boolean) => apiClient.patch(`/engagement/feed/posts/${postId}/pin`, { pinned }),
  deleteOwnPost: (postId: string) => apiClient.delete(`/engagement/feed/posts/${postId}`),
  moderatePost: (postId: string) => apiClient.delete(`/engagement/feed/posts/${postId}/moderate`),
};
