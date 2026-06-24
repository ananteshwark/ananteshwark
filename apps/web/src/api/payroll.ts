import { apiClient } from './client';

export const payrollApi = {
  // Components
  getComponents: (params?: any) => apiClient.get('/payroll/components', { params }),
  getComponent: (id: string) => apiClient.get(`/payroll/components/${id}`),
  createComponent: (data: any) => apiClient.post('/payroll/components', data),
  updateComponent: (id: string, data: any) => apiClient.patch(`/payroll/components/${id}`, data),

  // Structures
  getStructures: () => apiClient.get('/payroll/structures'),
  getStructure: (id: string) => apiClient.get(`/payroll/structures/${id}`),
  createStructure: (data: any) => apiClient.post('/payroll/structures', data),
  updateStructure: (id: string, data: any) => apiClient.patch(`/payroll/structures/${id}`, data),

  // Employee salaries
  getSalaries: () => apiClient.get('/payroll/salaries'),
  getEmployeeSalary: (employeeId: string, asOf?: string) =>
    apiClient.get(`/payroll/salaries/employee/${employeeId}`, { params: { asOf } }),
  assignSalary: (data: any) => apiClient.post('/payroll/salaries', data),

  // Runs
  getRuns: (params?: any) => apiClient.get('/payroll/runs', { params }),
  getRun: (id: string) => apiClient.get(`/payroll/runs/${id}`),
  createRun: (data: any) => apiClient.post('/payroll/runs', data),
  processRun: (id: string) => apiClient.post(`/payroll/runs/${id}/process`),
  approveRun: (id: string) => apiClient.post(`/payroll/runs/${id}/approve`),
  markPaid: (id: string) => apiClient.post(`/payroll/runs/${id}/mark-paid`),
  cancelRun: (id: string) => apiClient.post(`/payroll/runs/${id}/cancel`),
  getBankFile: (id: string) => apiClient.get(`/payroll/runs/${id}/bank-file`, { responseType: 'blob' }),

  // Payslips
  getPayslips: (params?: any) => apiClient.get('/payroll/payslips', { params }),
  getPayslip: (id: string) => apiClient.get(`/payroll/payslips/${id}`),
  getEmployeePayslips: (employeeId: string) =>
    apiClient.get(`/payroll/employees/${employeeId}/payslips`),

  // Statutory
  getStatutoryConfigs: () => apiClient.get('/payroll/statutory/configs'),
  upsertStatutoryConfig: (data: any) => apiClient.post('/payroll/statutory/configs', data),
  getTaxSlabs: () => apiClient.get('/payroll/statutory/tax-slabs'),
  getComplianceCalendar: (params?: any) =>
    apiClient.get('/payroll/statutory/calendar', { params }),
  createComplianceItem: (data: any) => apiClient.post('/payroll/statutory/calendar', data),
  generateCalendar: (data: any) => apiClient.post('/payroll/statutory/calendar/generate', data),
  markFiled: (id: string, remarks?: string) =>
    apiClient.post(`/payroll/statutory/calendar/${id}/file`, { remarks }),
  getForm16: (params?: any) => apiClient.get('/payroll/statutory/form16', { params }),

  // Employees (for salary assignment dropdowns)
  getEmployees: (params?: any) => apiClient.get('/hr/employees', { params }),

  // Retro payroll / arrears
  detectArrears: (month: number, year: number) =>
    apiClient.get('/payroll/retro/arrears', { params: { month, year } }),
  getArrearsRecords: (runId?: string) =>
    apiClient.get('/payroll/retro/records', { params: { runId } }),
  applyArrearsToRun: (runId: string) =>
    apiClient.post(`/payroll/runs/${runId}/apply-arrears`),

  // Bank file export (Phase 81)
  listBankFileRuns: (runId: string) =>
    apiClient.get(`/payroll/runs/${runId}/bank-files`),
  generateBankFile: (runId: string, data: { format: string; options?: Record<string, string> }) =>
    apiClient.post(`/payroll/runs/${runId}/bank-files`, data),
  downloadBankFileUrl: (runId: string, fileId: string) =>
    `/payroll/runs/${runId}/bank-files/${fileId}/download`,
  markPayslipsPaid: (runId: string) =>
    apiClient.post(`/payroll/runs/${runId}/mark-payslips-paid`),
};
