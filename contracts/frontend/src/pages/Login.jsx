import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'

const GSI_SRC = 'https://accounts.google.com/gsi/client'

function loadGsi() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve()
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', reject)
      return
    }
    const s = document.createElement('script')
    s.src = GSI_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = reject
    document.head.appendChild(s)
  })
}

export default function Login() {
  const { login, loginWithGoogle, adoptServerSession } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [googleClientId, setGoogleClientId] = useState('')
  const [oidc, setOidc] = useState({ enabled: false, label: 'Sign in with SSO' })
  const [version, setVersion] = useState(null)
  const btnRef = useRef(null)

  useEffect(() => {
    api.get('/auth/config').then((cfg) => {
      if (cfg.google_enabled && cfg.google_client_id) setGoogleClientId(cfg.google_client_id)
    }).catch(() => {})
    api.get('/auth/oidc/config').then((cfg) => {
      if (cfg.oidc_enabled) setOidc({ enabled: true, label: cfg.button_label || 'Sign in with SSO' })
    }).catch(() => {})
    api.get('/version').then((v) => setVersion(v.version)).catch(() => {})
  }, [])

  // The OIDC redirect now lands with the session cookie already set, so there
  // is nothing to read out of the URL — a token in a query string ends up in
  // history, referrers and access logs, and it only lived there because the
  // client used to have to store it. `?sso=1` just says "a sign-in happened",
  // so this page can hydrate the user instead of showing a login form.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has('sso')) return
    adoptServerSession().catch((e) => setError(e.message)).finally(() => {
      window.history.replaceState({}, '', window.location.pathname)
    })
  }, [adoptServerSession])

  async function startOidc() {
    setError(null)
    try {
      const { authorization_url } = await api.get('/auth/oidc/login')
      window.location.href = authorization_url
    } catch (e) { setError(e.message) }
  }

  useEffect(() => {
    if (!googleClientId || !btnRef.current) return
    let cancelled = false
    loadGsi().then(() => {
      if (cancelled) return
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          setError(null)
          try {
            await loginWithGoogle(credential)
          } catch (err) {
            setError(err.message)
          }
        },
      })
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: 'outline', size: 'large', width: 304, text: 'signin_with',
      })
    }).catch(() => setError('Could not load Google Sign-In'))
    return () => { cancelled = true }
  }, [googleClientId, loginWithGoogle])

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h2>Contract Management System</h2>
        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        <label>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        {error && <div className="error">{error}</div>}
        <div style={{ marginTop: 16 }}>
          <button disabled={busy} style={{ width: '100%' }}>Sign in</button>
        </div>
        {(googleClientId || oidc.enabled) && (
          <div style={{ textAlign: 'center', color: '#8a97a6', margin: '16px 0 12px', fontSize: 12 }}>
            — or —
          </div>
        )}
        {oidc.enabled && (
          <button type="button" className="secondary" style={{ width: '100%', marginBottom: googleClientId ? 12 : 0 }} onClick={startOidc}>
            🔐 {oidc.label}
          </button>
        )}
        {googleClientId && (
          <div ref={btnRef} style={{ display: 'flex', justifyContent: 'center' }} />
        )}
        {version && (
          <div style={{ textAlign: 'center', color: '#8a97a6', marginTop: 18, fontSize: 12 }}>
            v{version}
          </div>
        )}
      </form>
    </div>
  )
}
