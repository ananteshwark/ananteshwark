import { apiClient } from './client';

export const contractsApi = {
  getContracts: (params?: any) => apiClient.get('/contracts', { params }),
  getContract: (id: string) => apiClient.get(`/contracts/${id}`),
  createContract: (data: any) => apiClient.post('/contracts', data),
  updateContract: (id: string, data: any) => apiClient.patch(`/contracts/${id}`, data),
  activateContract: (id: string) => apiClient.post(`/contracts/${id}/activate`),
  terminateContract: (id: string, data?: any) => apiClient.post(`/contracts/${id}/terminate`, data || {}),
  renewContract: (id: string, data: any) => apiClient.post(`/contracts/${id}/renew`, data),
  getExpiringContracts: (days?: number) => apiClient.get('/contracts/expiring', { params: { days } }),
  getMilestones: (contractId: string) => apiClient.get(`/contracts/${contractId}/milestones`),
  createMilestone: (contractId: string, data: any) => apiClient.post(`/contracts/${contractId}/milestones`, data),
  completeMilestone: (milestoneId: string) => apiClient.post(`/contracts/milestones/${milestoneId}/complete`),
  getTemplates: (type?: string) => apiClient.get('/contracts/templates', { params: { type } }),
  createTemplate: (data: any) => apiClient.post('/contracts/templates', data),
};
