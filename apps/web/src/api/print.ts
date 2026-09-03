import { apiClient } from './client';

/**
 * Fetch a server-rendered HTML document (authenticated) and open it in a new
 * browser tab as a blob URL. The endpoints are JWT-guarded, so a plain
 * window.open(url) would not carry the auth header — this fetches via the
 * axios client (which adds the bearer token) and then opens the result.
 */
export async function openPrintWindow(path: string): Promise<void> {
  const res = await apiClient.get(path, { responseType: 'blob' });
  const blob = new Blob([res.data], { type: 'text/html' });
  const url = window.URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  // Revoke after a delay so the new tab has time to load the document.
  setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  if (!win) {
    // Pop-up blocked — fall back to navigating via an anchor.
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

export const printApi = {
  bill: (id: string) => openPrintWindow(`/finance/ap/bills/${id}/print`),
  invoice: (id: string) => openPrintWindow(`/finance/ar/invoices/${id}/print`),
  payslip: (id: string) => openPrintWindow(`/payroll/payslips/${id}/print`),
};
