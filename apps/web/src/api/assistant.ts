import { apiClient } from './client';

export const assistantApi = {
  classify: (utterance: string) => apiClient.post('/assistant/classify', { utterance }),
  chat: (utterance: string, context: any) => apiClient.post('/assistant/chat', { utterance, context }),
  history: () => apiClient.get('/assistant/history'),
};
