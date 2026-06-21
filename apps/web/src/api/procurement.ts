import axios from 'axios';
import { apiClient } from './client';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const procurementApi = {
  // Requisitions
  getRequisitions: (params?: any) => apiClient.get('/procurement/requisitions', { params }),
  getRequisition: (id: string) => apiClient.get(`/procurement/requisitions/${id}`),
  createRequisition: (data: any) => apiClient.post('/procurement/requisitions', data),
  updateRequisition: (id: string, data: any) => apiClient.patch(`/procurement/requisitions/${id}`, data),
  submitRequisition: (id: string) => apiClient.post(`/procurement/requisitions/${id}/submit`),
  approveRequisition: (id: string) => apiClient.post(`/procurement/requisitions/${id}/approve`),
  rejectRequisition: (id: string, data: any) => apiClient.post(`/procurement/requisitions/${id}/reject`, data),
  cancelRequisition: (id: string) => apiClient.post(`/procurement/requisitions/${id}/cancel`),

  // RFQ
  getRfqs: (params?: any) => apiClient.get('/procurement/rfqs', { params }),
  getRfq: (id: string) => apiClient.get(`/procurement/rfqs/${id}`),
  createRfq: (data: any) => apiClient.post('/procurement/rfqs', data),
  issueRfq: (id: string) => apiClient.post(`/procurement/rfqs/${id}/issue`),
  recordQuote: (id: string, data: any) => apiClient.post(`/procurement/rfqs/${id}/quotes`, data),
  getComparative: (id: string) => apiClient.get(`/procurement/rfqs/${id}/comparative`),
  awardRfq: (id: string, data: { vendorId: string }) => apiClient.post(`/procurement/rfqs/${id}/award`, data),
  closeRfq: (id: string) => apiClient.post(`/procurement/rfqs/${id}/close`),
  cancelRfq: (id: string) => apiClient.post(`/procurement/rfqs/${id}/cancel`),

  // Purchase Orders
  getPurchaseOrders: (params?: any) => apiClient.get('/procurement/purchase-orders', { params }),
  getPurchaseOrder: (id: string) => apiClient.get(`/procurement/purchase-orders/${id}`),
  createPurchaseOrder: (data: any) => apiClient.post('/procurement/purchase-orders', data),
  updatePurchaseOrder: (id: string, data: any) => apiClient.patch(`/procurement/purchase-orders/${id}`, data),
  submitPoForApproval: (id: string) => apiClient.post(`/procurement/purchase-orders/${id}/submit-for-approval`),
  approvePurchaseOrder: (id: string, data?: any) => apiClient.post(`/procurement/purchase-orders/${id}/approve`, data),
  approvePoLevel: (id: string, data: any) => apiClient.post(`/procurement/purchase-orders/${id}/approve-level`, data),
  rejectPoApproval: (id: string, data: any) => apiClient.post(`/procurement/purchase-orders/${id}/reject-approval`, data),
  releasePo: (id: string) => apiClient.post(`/procurement/purchase-orders/${id}/release`),
  sendPurchaseOrder: (id: string) => apiClient.post(`/procurement/purchase-orders/${id}/send`),
  cancelPurchaseOrder: (id: string) => apiClient.post(`/procurement/purchase-orders/${id}/cancel`),
  enableVendorPortal: (vendorId: string, data: any) => apiClient.post(`/vendor-portal/enable-access`, { vendorId, ...data }),

  // GRN
  getGrns: (params?: any) => apiClient.get('/procurement/grns', { params }),
  getGrn: (id: string) => apiClient.get(`/procurement/grns/${id}`),
  createGrn: (data: any) => apiClient.post('/procurement/grns', data),
  confirmGrn: (id: string) => apiClient.post(`/procurement/grns/${id}/confirm`),
  getGrnMatch: (id: string) => apiClient.get(`/procurement/grns/${id}/match`),
  cancelGrn: (id: string) => apiClient.post(`/procurement/grns/${id}/cancel`),

  // Workflow Config
  getWorkflowConfig: () => apiClient.get('/procurement/workflow-config'),
  updateWorkflowConfig: (data: any) => apiClient.patch('/procurement/workflow-config', data),

  // Delegation of Authority
  getDoaRules: (params?: any) => apiClient.get('/procurement/doa', { params }),
  createDoaRule: (data: any) => apiClient.post('/procurement/doa', data),
  updateDoaRule: (id: string, data: any) => apiClient.patch(`/procurement/doa/${id}`, data),
  deleteDoaRule: (id: string) => apiClient.delete(`/procurement/doa/${id}`),

  // Vendor Invoices
  getVendorInvoices: (params?: any) => apiClient.get('/procurement/vendor-invoices', { params }),
  getVendorInvoice: (id: string) => apiClient.get(`/procurement/vendor-invoices/${id}`),
  createVendorInvoice: (data: any) => apiClient.post('/procurement/vendor-invoices', data),
  submitVendorInvoice: (id: string) => apiClient.post(`/procurement/vendor-invoices/${id}/submit`),
  reviewVendorInvoice: (id: string) => apiClient.post(`/procurement/vendor-invoices/${id}/review`),
  matchVendorInvoice: (id: string) => apiClient.post(`/procurement/vendor-invoices/${id}/match`),
  approveVendorInvoice: (id: string) => apiClient.post(`/procurement/vendor-invoices/${id}/approve`),
  rejectVendorInvoice: (id: string, data: any) => apiClient.post(`/procurement/vendor-invoices/${id}/reject`, data),
  recordInvoicePayment: (id: string, data: any) => apiClient.post(`/procurement/vendor-invoices/${id}/payment`, data),
};

// Vendor Portal API — isolated axios instance so the tenant auth/tenant-header
// interceptors and 401-refresh logic on apiClient never touch vendor requests.
const vendorAxios = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});
vendorAxios.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('vendor_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const vendorPortalClient = {
  get: (url: string, config?: any) => vendorAxios.get(url, config),
  post: (url: string, data?: any, config?: any) => vendorAxios.post(url, data, config),
};

export const vendorPortalApi = {
  login: (data: any) => vendorAxios.post('/vendor-portal/login', data),
  getMyRfqs: () => vendorPortalClient.get('/vendor-portal/rfqs'),
  getRfqDetail: (id: string) => vendorPortalClient.get(`/vendor-portal/rfqs/${id}`),
  submitQuote: (rfqId: string, data: any) => vendorPortalClient.post(`/vendor-portal/rfqs/${rfqId}/quotes`, data),
  getMyPurchaseOrders: () => vendorPortalClient.get('/vendor-portal/purchase-orders'),
  getPurchaseOrderDetail: (id: string) => vendorPortalClient.get(`/vendor-portal/purchase-orders/${id}`),
  submitInvoice: (data: any) => vendorPortalClient.post('/vendor-portal/invoices', data),
  getMyInvoices: () => vendorPortalClient.get('/vendor-portal/invoices'),
  getInvoiceDetail: (id: string) => vendorPortalClient.get(`/vendor-portal/invoices/${id}`),
  getMyPayments: () => vendorPortalClient.get('/vendor-portal/payments'),
};
