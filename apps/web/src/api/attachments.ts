import { apiClient } from './client';

export interface Attachment {
  id: string;
  entityType: string;
  entityId: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  uploadedBy: string;
  description?: string | null;
  createdAt: string;
}

export const attachmentsApi = {
  list: (entityType: string, entityId: string) =>
    apiClient.get('/attachments', { params: { entityType, entityId } }),

  upload: (entityType: string, entityId: string, file: File, description?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('entityType', entityType);
    formData.append('entityId', entityId);
    if (description) formData.append('description', description);
    return apiClient.post('/attachments', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  download: async (id: string, fileName: string) => {
    const res = await apiClient.get(`/attachments/${id}/download`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  },

  remove: (id: string) => apiClient.delete(`/attachments/${id}`),
};
