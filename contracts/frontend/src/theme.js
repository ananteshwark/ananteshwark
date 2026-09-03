// Light / dark / system theme, persisted in localStorage. "system" leaves the
// root unstamped so prefers-color-scheme decides; light/dark stamp data-theme.
const KEY = 'cms_theme'
export const THEMES = ['system', 'light', 'dark']

export function getTheme() {
  return localStorage.getItem(KEY) || 'system'
}

export function applyTheme(theme) {
  const root = document.documentElement
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme)
  else root.removeAttribute('data-theme')
  localStorage.setItem(KEY, theme)
}

export function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(getTheme()) + 1) % THEMES.length]
  applyTheme(next)
  return next
}

// Apply the saved theme immediately (called before render to avoid a flash).
export function initTheme() {
  applyTheme(getTheme())
}
