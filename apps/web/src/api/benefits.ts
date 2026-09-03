import { apiClient } from './client';

export const benefitsApi = {
  // Benefit Plans
  getPlans: (params?: any) => apiClient.get('/benefits/plans', { params }),
  createPlan: (data: any) => apiClient.post('/benefits/plans', data),

  // Enrollments
  getEnrollments: (employeeId?: string) => apiClient.get('/benefits/enrollments', { params: employeeId ? { employeeId } : {} }),
  enroll: (data: any) => apiClient.post('/benefits/enrollments', data),
  terminateEnrollment: (id: string, data: any) => apiClient.patch(`/benefits/enrollments/${id}/terminate`, data),

  // Salary Bands
  getSalaryBands: () => apiClient.get('/benefits/salary-bands'),
  createSalaryBand: (data: any) => apiClient.post('/benefits/salary-bands', data),

  // Merit Cycles
  getMeritCycles: (params?: any) => apiClient.get('/benefits/merit-cycles', { params }),
  createMeritCycle: (data: any) => apiClient.post('/benefits/merit-cycles', data),
  updateCycleStatus: (id: string, data: any) => apiClient.patch(`/benefits/merit-cycles/${id}/status`, data),

  // Merit Allocations
  getAllocations: (cycleId: string) => apiClient.get(`/benefits/merit-cycles/${cycleId}/allocations`),
  bulkAllocate: (cycleId: string, data: any) => apiClient.post(`/benefits/merit-cycles/${cycleId}/allocations/bulk`, data),
  approveAllocation: (cycleId: string, id: string, data: any) => apiClient.patch(`/benefits/merit-cycles/${cycleId}/allocations/${id}/approve`, data),
};
