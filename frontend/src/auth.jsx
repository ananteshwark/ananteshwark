import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('cms_user')
    return raw ? JSON.parse(raw) : null
  })
  // Effective page→roles access map (role admin). Null until loaded.
  const [pageAccess, setPageAccess] = useState(null)

  function persist(data) {
    localStorage.setItem('cms_token', data.token)
    localStorage.setItem('cms_user', JSON.stringify(data.user))
    setUser(data.user)
    // Let the session-expiry watcher re-read the new token's exp claim.
    try { window.dispatchEvent(new Event('cms:auth')) } catch { /* no window */ }
  }

  async function login(email, password) {
    persist(await api.post('/auth/login', { email, password }))
  }

  async function loginWithGoogle(credential) {
    persist(await api.post('/auth/google', { credential }))
  }

  // SSO (OIDC) redirect returns only a token in the URL; store it, then fetch
  // the user so the session looks identical to a password login.
  async function loginWithToken(token) {
    localStorage.setItem('cms_token', token)
    const me = await api.get('/auth/me')
    persist({ token, user: me })
  }

  function logout() {
    localStorage.removeItem('cms_token')
    localStorage.removeItem('cms_user')
    setUser(null)
  }

  // Load the role→page access map once a user is signed in (drives nav filtering).
  useEffect(() => {
    if (!user) { setPageAccess(null); return }
    let cancelled = false
    api.get('/settings/page-access')
      .then((cfg) => { if (!cancelled) setPageAccess(cfg?.access || {}) })
      .catch(() => { if (!cancelled) setPageAccess({}) })
    return () => { cancelled = true }
  }, [user])

  const role = user?.role
  // A user may hold several roles; capabilities are the union across all of them.
  const roles = user?.roles && user.roles.length ? user.roles : (role ? [role] : [])
  const has = (...allowed) => roles.some((r) => allowed.includes(r))
  const isSuperAdmin = has('SUPER_ADMIN')
  // SUPER_ADMIN supersedes every role gate (mirrors the backend require_roles bypass).
  const isAdmin = has('ADMIN') || isSuperAdmin
  const canValidate = has('ADMIN', 'VALIDATOR') || isSuperAdmin
  // Authoring-module permissions (mirror the backend require_* rules)
  const canAuthor = has('ADMIN', 'VALIDATOR', 'AUTHOR', 'LEGAL', 'APPROVER') || isSuperAdmin
  const isLegal = has('ADMIN', 'LEGAL') || isSuperAdmin
  const isApprover = has('ADMIN', 'APPROVER') || isSuperAdmin

  // Page-level gate for the navigation. SUPER_ADMIN sees everything; until the
  // config loads we optimistically allow (the API is still the security boundary).
  function canSeePage(key) {
    if (isSuperAdmin) return true
    if (!pageAccess) return true
    const allowed = pageAccess[key]
    return !allowed || roles.some((r) => allowed.includes(r))
  }

  return (
    <AuthContext.Provider value={{ user, login, loginWithGoogle, loginWithToken, logout, isAdmin, isSuperAdmin, canValidate, canAuthor, isLegal, isApprover, canSeePage }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
