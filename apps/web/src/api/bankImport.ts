import { apiClient } from './client';

export const bankImportApi = {
  listImports: () => apiClient.get('/finance/bank/imports'),
  importRows: (bankAccountId: string, fileName: string, rows: any[]) =>
    apiClient.post('/finance/bank/imports', { bankAccountId, fileName, rows }),
  getLines: (importId: string) => apiClient.get(`/finance/bank/imports/${importId}/lines`),
  autoMatch: (importId: string) => apiClient.post(`/finance/bank/imports/${importId}/auto-match`),
  manualMatch: (lineId: string, type: string, id: string) =>
    apiClient.post(`/finance/bank/lines/${lineId}/match`, { type, id }),
};
