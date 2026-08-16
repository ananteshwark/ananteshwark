import { useEffect, useState } from 'react'

// useState that mirrors its value into localStorage, so a page's filters are
// retained across navigation and reloads until the user clears them. Keys should
// be page-specific (e.g. "cms_filters_validation").
export function usePersistedState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw != null ? JSON.parse(raw) : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* quota / private mode */ }
  }, [key, value])
  return [value, setValue]
}

// Remove one or more persisted filter keys (used by "Clear filters").
export function clearPersisted(...keys) {
  keys.forEach((k) => { try { localStorage.removeItem(k) } catch { /* ignore */ } })
}
