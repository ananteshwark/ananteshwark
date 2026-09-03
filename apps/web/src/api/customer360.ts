import { apiClient } from './client';

const unwrap = (res: any) => res.data?.data ?? res.data;

export const customer360Api = {
  get: (customerId: string) =>
    apiClient.get(`/crm/customer-360/${customerId}`).then(unwrap),
  listPicker: (search?: string) =>
    apiClient
      .get('/crm/customer-360', { params: search ? { search } : {} })
      .then(unwrap),
};
