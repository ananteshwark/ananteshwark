import { apiClient } from './client';

export const logisticsApi = {
  listCarriers: () => apiClient.get('/logistics/carriers'),
  createCarrier: (data: any) => apiClient.post('/logistics/carriers', data),
  updateCarrier: (id: string, data: any) => apiClient.patch(`/logistics/carriers/${id}`, data),
  listRates: (carrierId?: string) => apiClient.get('/logistics/rates', { params: carrierId ? { carrierId } : {} }),
  createRate: (data: any) => apiClient.post('/logistics/rates', data),
  rateShop: (data: { originZone: string; destZone: string; weight: number }) => apiClient.post('/logistics/rate-shop', data),
  listShipments: (status?: string) => apiClient.get('/logistics/shipments', { params: status ? { status } : {} }),
  planShipment: (data: any) => apiClient.post('/logistics/shipments', data),
  transitionShipment: (id: string, status: string) => apiClient.post(`/logistics/shipments/${id}/status`, { status }),
  freightAudit: (id: string, invoicedAmount: number, tolerancePct?: number) => apiClient.post(`/logistics/shipments/${id}/freight-audit`, { invoicedAmount, tolerancePct }),
};
