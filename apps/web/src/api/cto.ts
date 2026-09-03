import { apiClient } from './client';

export interface CtoVariantComponent {
  componentCode: string;
  componentName: string;
  quantity: number;
  uom: string;
  source: string;
}

export interface CtoMapping {
  id: string;
  modelCode: string;
  optionCode: string;
  action: 'ADD' | 'REMOVE' | 'SUBSTITUTE';
  componentCode: string;
  componentName: string;
  quantity: number;
  uom: string;
  substituteForCode?: string | null;
}

export interface CtoConfiguration {
  id: string;
  configNumber: string;
  modelCode: string;
  modelName?: string | null;
  variantItemCode: string;
  selectedOptions: string[];
  variantBom: CtoVariantComponent[];
  unitPrice: number;
  quantity: number;
  status: 'CONFIGURED' | 'RELEASED' | 'CANCELLED';
  workOrderNumber?: string | null;
}

export const ctoApi = {
  listMappings: (modelCode?: string) => apiClient.get('/sales/cto/mappings', { params: modelCode ? { modelCode } : {} }),
  createMapping: (data: Partial<CtoMapping>) => apiClient.post('/sales/cto/mappings', data),
  deleteMapping: (id: string) => apiClient.delete(`/sales/cto/mappings/${id}`),
  explode: (modelCode: string, selectedOptions: string[]) => apiClient.post('/sales/cto/explode', { modelCode, selectedOptions }),
  listConfigurations: () => apiClient.get('/sales/cto/configurations'),
  createConfiguration: (data: any) => apiClient.post('/sales/cto/configurations', data),
  release: (id: string) => apiClient.post(`/sales/cto/configurations/${id}/release`),
  cancel: (id: string) => apiClient.post(`/sales/cto/configurations/${id}/cancel`),
};
