import { apiClient } from './client';

export const i18nApi = {
  listLocales: () => apiClient.get('/localization/i18n/locales'),
  seed: () => apiClient.post('/localization/i18n/locales/seed'),
  upsert: (data: any) => apiClient.post('/localization/i18n/translations', data),
  bundle: (locale: string, namespace = 'ui') => apiClient.get('/localization/i18n/bundle', { params: { locale, namespace } }),
  translate: (data: any) => apiClient.post('/localization/i18n/translate', data),
  format: (data: any) => apiClient.post('/localization/i18n/format', data),
};
