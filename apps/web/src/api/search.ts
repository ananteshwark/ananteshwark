import { apiClient } from './client';

const unwrap = (res: any) => res.data?.data ?? res.data;

export interface SearchResultItem {
  id: string;
  title: string;
  subtitle?: string;
  route: string;
}

export interface SearchGroup {
  type: string;
  label: string;
  results: SearchResultItem[];
}

export const globalSearch = (q: string): Promise<SearchGroup[]> =>
  apiClient.get('/search', { params: { q } }).then(unwrap);
