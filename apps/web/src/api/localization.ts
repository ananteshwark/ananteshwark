import { apiClient } from './client';

export const localizationApi = {
  getCountries: () => apiClient.get('/localization/countries'),
  calculateTax: (country: string, grossMonthly: number, basicMonthly?: number) =>
    apiClient.get('/localization/calculate', {
      params: {
        country,
        grossMonthly,
        ...(basicMonthly !== undefined ? { basicMonthly } : {}),
      },
    }),
};
