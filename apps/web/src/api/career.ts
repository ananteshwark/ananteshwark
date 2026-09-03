import { apiClient } from './client';

// Career architecture: job families, ladders, talent pools, 9-box reviews.
export const careerApi = {
  listFamilies: () => apiClient.get('/talent/career/families'),
  createFamily: (data: any) => apiClient.post('/talent/career/families', data),
  updateFamily: (id: string, data: any) => apiClient.patch(`/talent/career/families/${id}`, data),
  listLadders: () => apiClient.get('/talent/career/ladders'),
  createLadder: (data: any) => apiClient.post('/talent/career/ladders', data),
  setRungs: (id: string, rungs: any[]) => apiClient.patch(`/talent/career/ladders/${id}/rungs`, { rungs }),
  nextMoves: (id: string, level: number) => apiClient.get(`/talent/career/ladders/${id}/next-moves`, { params: { level } }),
  listPools: () => apiClient.get('/talent/career/pools'),
  createPool: (data: any) => apiClient.post('/talent/career/pools', data),
  getPool: (id: string) => apiClient.get(`/talent/career/pools/${id}`),
  listPoolMembers: (id: string) => apiClient.get(`/talent/career/pools/${id}/members`),
  addPoolMember: (id: string, data: any) => apiClient.post(`/talent/career/pools/${id}/members`, data),
  updateMember: (memberId: string, data: any) => apiClient.patch(`/talent/career/members/${memberId}`, data),
  poolCoverage: (id: string) => apiClient.get(`/talent/career/pools/${id}/coverage`),
  listReviews: () => apiClient.get('/talent/career/reviews'),
  createReview: (data: any) => apiClient.post('/talent/career/reviews', data),
  getReview: (id: string) => apiClient.get(`/talent/career/reviews/${id}`),
  listPlacements: (id: string) => apiClient.get(`/talent/career/reviews/${id}/placements`),
  placeEmployee: (id: string, data: any) => apiClient.post(`/talent/career/reviews/${id}/placements`, data),
  distribution: (id: string) => apiClient.get(`/talent/career/reviews/${id}/distribution`),
  startCalibration: (id: string) => apiClient.post(`/talent/career/reviews/${id}/start-calibration`),
  finalize: (id: string) => apiClient.post(`/talent/career/reviews/${id}/finalize`),
};
