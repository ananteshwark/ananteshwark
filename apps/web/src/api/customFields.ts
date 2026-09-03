import { apiClient } from './client';

export const customFieldsApi = {
  // Definitions
  listDefinitions: (entityType?: string) =>
    apiClient.get('/platform/custom-fields/definitions', {
      params: entityType ? { entityType } : {},
    }),
  getDefinition: (id: string) =>
    apiClient.get(`/platform/custom-fields/definitions/${id}`),
  createDefinition: (data: any) =>
    apiClient.post('/platform/custom-fields/definitions', data),
  updateDefinition: (id: string, data: any) =>
    apiClient.patch(`/platform/custom-fields/definitions/${id}`, data),
  deleteDefinition: (id: string) =>
    apiClient.delete(`/platform/custom-fields/definitions/${id}`),

  // Values
  getValues: (entityType: string, entityId: string) =>
    apiClient.get(`/platform/custom-fields/values/${entityType}/${entityId}`),
  getValuesWithMeta: (entityType: string, entityId: string) =>
    apiClient.get(`/platform/custom-fields/values/${entityType}/${entityId}/meta`),
  setValues: (entityType: string, entityId: string, values: { fieldDefinitionId: string; value?: string | null }[]) =>
    apiClient.post(`/platform/custom-fields/values/${entityType}/${entityId}`, { values }),
};
