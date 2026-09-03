// i18n scaffolding (G15). A minimal, dependency-free string catalog + `t()`
// helper so UI strings can be externalized incrementally. The active locale is
// persisted in localStorage; unknown keys fall back to the provided default (or
// the key itself), so partial adoption is safe.
//
// Usage:  import { t } from '../i18n'
//         t('nav.dashboard', 'Dashboard')
//
// Add locales by extending CATALOGS. English is the base; other locales need
// only override the keys they translate.

const CATALOGS = {
  en: {
    'nav.dashboard': 'Dashboard',
    'nav.contracts': 'Contracts',
    'nav.obligations': 'Obligations',
    'nav.reports': 'Reports',
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.loading': 'Loading…',
  },
  // Example stub — real translations added over time.
  hi: {
    'common.loading': 'लोड हो रहा है…',
  },
}

const STORAGE_KEY = 'cms.locale'

export function getLocale() {
  try { return localStorage.getItem(STORAGE_KEY) || 'en' } catch { return 'en' }
}

export function setLocale(locale) {
  try { localStorage.setItem(STORAGE_KEY, locale) } catch { /* ignore */ }
}

export function availableLocales() {
  return Object.keys(CATALOGS)
}

export function t(key, fallback) {
  const locale = getLocale()
  const table = CATALOGS[locale] || CATALOGS.en
  if (table && key in table) return table[key]
  if (CATALOGS.en && key in CATALOGS.en) return CATALOGS.en[key]
  return fallback != null ? fallback : key
}
