import { apiClient } from './client';

export const hrApi = {
  // Employees
  getEmployees: (params?: any) => apiClient.get('/hr/employees', { params }),
  getEmployee: (id: string) => apiClient.get(`/hr/employees/${id}`),
  createEmployee: (data: any) => apiClient.post('/hr/employees', data),
  updateEmployee: (id: string, data: any) => apiClient.patch(`/hr/employees/${id}`, data),
  terminateEmployee: (id: string, data: any) => apiClient.post(`/hr/employees/${id}/terminate`, data),
  resignEmployee: (id: string, data: any) => apiClient.post(`/hr/employees/${id}/resign`, data),
  getReportees: (id: string) => apiClient.get(`/hr/employees/${id}/reportees`),

  // Org hierarchy: Business Unit > Department > Function > Sub Function
  getOrgTree: () => apiClient.get('/hr/departments/tree'),

  // Business Units
  getBusinessUnits: (params?: any) => apiClient.get('/hr/business-units', { params }),
  createBusinessUnit: (data: any) => apiClient.post('/hr/business-units', data),
  updateBusinessUnit: (id: string, data: any) => apiClient.patch(`/hr/business-units/${id}`, data),

  // Departments
  getDepartments: (params?: any) => apiClient.get('/hr/departments', { params }),
  getDepartmentTree: () => apiClient.get('/hr/departments/tree'),
  getDepartment: (id: string) => apiClient.get(`/hr/departments/${id}`),
  createDepartment: (data: any) => apiClient.post('/hr/departments', data),
  updateDepartment: (id: string, data: any) => apiClient.patch(`/hr/departments/${id}`, data),

  // Functions
  getFunctions: (params?: any) => apiClient.get('/hr/functions', { params }),
  createFunction: (data: any) => apiClient.post('/hr/functions', data),
  updateFunction: (id: string, data: any) => apiClient.patch(`/hr/functions/${id}`, data),

  // Sub Functions
  getSubFunctions: (params?: any) => apiClient.get('/hr/sub-functions', { params }),
  createSubFunction: (data: any) => apiClient.post('/hr/sub-functions', data),
  updateSubFunction: (id: string, data: any) => apiClient.patch(`/hr/sub-functions/${id}`, data),

  // Designations
  getDesignations: (params?: any) => apiClient.get('/hr/designations', { params }),
  createDesignation: (data: any) => apiClient.post('/hr/designations', data),
  updateDesignation: (id: string, data: any) => apiClient.patch(`/hr/designations/${id}`, data),

  // Locations
  getLocations: (params?: any) => apiClient.get('/hr/locations', { params }),
  createLocation: (data: any) => apiClient.post('/hr/locations', data),
  updateLocation: (id: string, data: any) => apiClient.patch(`/hr/locations/${id}`, data),

  // Shifts
  getShifts: () => apiClient.get('/hr/shifts'),
  createShift: (data: any) => apiClient.post('/hr/shifts', data),

  // Holidays
  getHolidays: (params?: any) => apiClient.get('/hr/holidays', { params }),
  createHoliday: (data: any) => apiClient.post('/hr/holidays', data),

  // Attendance
  getAttendance: (params?: any) => apiClient.get('/hr/attendance', { params }),
  getMonthlyAttendance: (params?: any) => apiClient.get('/hr/attendance/monthly', { params }),
  markAttendance: (data: any) => apiClient.post('/hr/attendance', data),
  bulkImportAttendance: (data: any) => apiClient.post('/hr/attendance/bulk', data),
  regularizeAttendance: (id: string, data: any) => apiClient.post(`/hr/attendance/${id}/regularize`, data),

  // Time Entries
  getTimeEntries: (params?: any) => apiClient.get('/hr/time-entries', { params }),
  createTimeEntry: (data: any) => apiClient.post('/hr/time-entries', data),
  getTimesheets: (params?: any) => apiClient.get('/hr/timesheets', { params }),
  submitTimesheet: (data: any) => apiClient.post('/hr/timesheets/submit', data),
  approveTimesheet: (id: string) => apiClient.post(`/hr/timesheets/${id}/approve`),

  // Leave Types
  getLeaveTypes: () => apiClient.get('/hr/leave/types'),
  createLeaveType: (data: any) => apiClient.post('/hr/leave/types', data),
  updateLeaveType: (id: string, data: any) => apiClient.patch(`/hr/leave/types/${id}`, data),

  // Leave Balance
  getLeaveBalance: (params?: any) => apiClient.get('/hr/leave/balance', { params }),

  // Leave Applications
  getLeaveApplications: (params?: any) => apiClient.get('/hr/leave/applications', { params }),
  applyLeave: (data: any) => apiClient.post('/hr/leave/applications', data),
  approveLeave: (id: string, data: any) => apiClient.post(`/hr/leave/applications/${id}/approve`, data),
  rejectLeave: (id: string, data: any) => apiClient.post(`/hr/leave/applications/${id}/reject`, data),
  cancelLeave: (id: string) => apiClient.post(`/hr/leave/applications/${id}/cancel`),
  withdrawLeave: (id: string) => apiClient.post(`/hr/leave/applications/${id}/withdraw`),

  // Leave Calendar
  getLeaveCalendar: (params?: any) => apiClient.get('/hr/leave/calendar', { params }),
};
