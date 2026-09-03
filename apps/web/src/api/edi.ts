import { apiClient as api } from './client';

function unwrapList(res: any) {
  const d = res.data?.data ?? res.data;
  return Array.isArray(d) ? d : d?.items ?? [];
}

function unwrap(res: any) {
  return res.data?.data ?? res.data;
}

// Trading Partners
export const listPartners = () =>
  api.get('/platform/edi/partners').then(unwrapList);

export const getPartner = (id: string) =>
  api.get(`/platform/edi/partners/${id}`).then(unwrap);

export const createPartner = (data: {
  partnerId: string;
  name: string;
  idQualifier?: string;
  senderId: string;
  senderQualifier?: string;
  supportedSets?: string[];
  notes?: string;
}) => api.post('/platform/edi/partners', data).then(unwrap);

export const updatePartner = (id: string, data: Record<string, unknown>) =>
  api.patch(`/platform/edi/partners/${id}`, data).then(unwrap);

export const deletePartner = (id: string) =>
  api.delete(`/platform/edi/partners/${id}`);

// Transactions
export const listTransactions = (params?: Record<string, string>) =>
  api.get('/platform/edi/transactions', { params }).then((r) => {
    const d = r.data?.data ?? r.data;
    return { items: d?.items ?? [], total: d?.total ?? 0 };
  });

export const getTransaction = (id: string) =>
  api.get(`/platform/edi/transactions/${id}`).then(unwrap);

// Inbound processing
export const processInbound = (tradingPartnerId: string, rawContent: string) =>
  api.post('/platform/edi/inbound', { tradingPartnerId, rawContent }).then(unwrap);

// Outbound 850
export const generateOutbound850 = (data: {
  tradingPartnerId: string;
  purchaseOrderNumber: string;
  vendorName?: string;
  lineItems: Array<{
    lineNumber: number;
    quantity: number;
    unit: string;
    unitPrice: number;
    productCode: string;
    description?: string;
  }>;
}) => api.post('/platform/edi/outbound/850', data).then(unwrap);
