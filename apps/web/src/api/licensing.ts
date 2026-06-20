import { apiClient } from './client';

export const licensingApi = {
  // Dashboard
  getDashboard: () => apiClient.get('/licensing/dashboard'),

  // Plans
  getPlans: () => apiClient.get('/licensing/plans'),
  createPlan: (data: any) => apiClient.post('/licensing/plans', data),

  // Contracts
  getContracts: () => apiClient.get('/licensing/contracts'),
  getContract: (id: string) => apiClient.get(`/licensing/contracts/${id}`),
  createContract: (data: any) => apiClient.post('/licensing/contracts', data),
  updateContractStatus: (id: string, status: string) =>
    apiClient.patch(`/licensing/contracts/${id}/status`, { status }),

  // Module Licenses
  getModuleLicenses: (contractId?: string) =>
    apiClient.get('/licensing/module-licenses', { params: contractId ? { contractId } : {} }),
  assignModuleLicense: (data: any) => apiClient.post('/licensing/module-licenses', data),
  revokeModuleLicense: (id: string) => apiClient.delete(`/licensing/module-licenses/${id}`),

  // Employee Assignments
  getAssignments: (moduleKey?: string) =>
    apiClient.get('/licensing/assignments', { params: moduleKey ? { moduleKey } : {} }),
  assignEmployee: (data: any) => apiClient.post('/licensing/assignments', data),
  bulkAssignEmployees: (data: any) => apiClient.post('/licensing/assignments/bulk', data),
  revokeAssignment: (id: string) => apiClient.delete(`/licensing/assignments/${id}`),

  // Invoices
  getInvoices: (contractId?: string) =>
    apiClient.get('/licensing/invoices', { params: contractId ? { contractId } : {} }),
  getInvoice: (id: string) => apiClient.get(`/licensing/invoices/${id}`),
  generateInvoice: (data: any) => apiClient.post('/licensing/invoices/generate', data),
  updateInvoiceStatus: (id: string, status: string) =>
    apiClient.patch(`/licensing/invoices/${id}/status`, { status }),

  // Consumption
  getConsumption: (params?: any) => apiClient.get('/licensing/consumption', { params }),
  recordConsumption: (data: any) => apiClient.post('/licensing/consumption', data),
  takeSnapshot: (snapshotMonth: string) =>
    apiClient.post('/licensing/consumption/snapshot', { snapshotMonth }),

  // Validation
  validateAccess: (data: any) => apiClient.post('/licensing/validate-access', data),
};
