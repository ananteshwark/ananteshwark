import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from './client';
import { useAuthStore } from '../store/authStore';

// Auth hooks
export const useLogin = () => {
  return useMutation({
    mutationFn: (data: { email: string; password: string; tenantSlug?: string }) =>
      apiClient.post('/auth/login', data).then((r) => r.data.data),
  });
};

export const useRegister = () => {
  return useMutation({
    mutationFn: (data: {
      companyName: string;
      firstName: string;
      lastName: string;
      email: string;
      password: string;
    }) => apiClient.post('/auth/register', data).then((r) => r.data.data),
  });
};

// User hooks
export const useCurrentUser = () => {
  const { isAuthenticated } = useAuthStore();
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: () => apiClient.get('/users/me').then((r) => r.data.data),
    enabled: isAuthenticated,
  });
};

export const useUsers = (params?: { page?: number; limit?: number; search?: string }) => {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () =>
      apiClient
        .get('/users', { params })
        .then((r) => r.data.data),
  });
};

export const useInviteUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { email: string; firstName: string; lastName: string; roleIds?: string[] }) =>
      apiClient.post('/users/invite', data).then((r) => r.data.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
};

export const useDeactivateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiClient.delete(`/users/${userId}`).then((r) => r.data.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['users'] }),
  });
};

// Roles hooks
export const useRoles = () => {
  return useQuery({
    queryKey: ['roles'],
    queryFn: () => apiClient.get('/rbac/roles').then((r) => r.data.data),
  });
};

export const usePermissions = () => {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: () => apiClient.get('/rbac/permissions').then((r) => r.data.data),
  });
};

export const useCreateRole = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string; permissions?: string[] }) =>
      apiClient.post('/rbac/roles', data).then((r) => r.data.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roles'] }),
  });
};

// Workflow hooks
export const useWorkflowDefinitions = () => {
  return useQuery({
    queryKey: ['workflows'],
    queryFn: () => apiClient.get('/workflows/definitions').then((r) => r.data.data),
  });
};

export const usePendingApprovals = () => {
  return useQuery({
    queryKey: ['pendingApprovals'],
    queryFn: () => apiClient.get('/workflows/instances/pending').then((r) => r.data.data),
  });
};

export const useApproveStep = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      instanceId,
      stepId,
      comment,
    }: {
      instanceId: string;
      stepId: string;
      comment?: string;
    }) =>
      apiClient
        .post(`/workflows/instances/${instanceId}/steps/${stepId}/approve`, { comment })
        .then((r) => r.data.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pendingApprovals'] }),
  });
};

export const useRejectStep = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      instanceId,
      stepId,
      comment,
    }: {
      instanceId: string;
      stepId: string;
      comment?: string;
    }) =>
      apiClient
        .post(`/workflows/instances/${instanceId}/steps/${stepId}/reject`, { comment })
        .then((r) => r.data.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pendingApprovals'] }),
  });
};

// Notification hooks
export const useNotifications = (params?: { page?: number; limit?: number }) => {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: () => apiClient.get('/notifications', { params }).then((r) => r.data.data),
  });
};

export const useUnreadCount = () => {
  return useQuery({
    queryKey: ['notificationUnreadCount'],
    queryFn: () => apiClient.get('/notifications/unread-count').then((r) => r.data.data),
    refetchInterval: 30000,
  });
};

export const useMarkAsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiClient.post(`/notifications/${id}/read`).then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notificationUnreadCount'] });
    },
  });
};

export const useMarkAllAsRead = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post('/notifications/read-all').then((r) => r.data.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notificationUnreadCount'] });
    },
  });
};

// Audit hooks
export const useAuditLogs = (params?: {
  page?: number;
  limit?: number;
  userId?: string;
  resourceType?: string;
  action?: string;
  startDate?: string;
  endDate?: string;
}) => {
  return useQuery({
    queryKey: ['auditLogs', params],
    queryFn: () => apiClient.get('/audit/logs', { params }).then((r) => r.data.data),
  });
};

// Tenant hooks
export const useTenantSettings = () => {
  const { tenant } = useAuthStore();
  return useQuery({
    queryKey: ['tenantSettings', tenant?.id],
    queryFn: () => apiClient.get(`/tenants/${tenant?.id}`).then((r) => r.data.data),
    enabled: !!tenant?.id,
  });
};

export const useUpdateTenantSettings = () => {
  const queryClient = useQueryClient();
  const { tenant } = useAuthStore();
  return useMutation({
    mutationFn: (data: any) =>
      apiClient
        .patch(`/tenants/${tenant?.id}/settings`, data)
        .then((r) => r.data.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tenantSettings'] }),
  });
};
