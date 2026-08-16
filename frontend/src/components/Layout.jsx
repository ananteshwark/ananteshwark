import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { cycleTheme, getTheme } from '../theme'

const THEME_LABEL = { system: '🖥 System', light: '☀ Light', dark: '🌙 Dark' }

function ThemeToggle() {
  const [theme, setTheme] = useState(getTheme())
  return (
    <button className="secondary" style={{ marginTop: 6 }}
      title="Switch light / dark / system theme" onClick={() => setTheme(cycleTheme())}>
      {THEME_LABEL[theme] || 'Theme'}
    </button>
  )
}

function GlobalSearch() {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState({ contracts: [], vendors: [] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setResults({ contracts: [], vendors: [] }); setOpen(false); return }
    setLoading(true); setOpen(true)
    const t = setTimeout(() => {
      Promise.all([
        api.get(`/contracts?q=${encodeURIComponent(term)}&limit=6`).then((r) => r.items || []).catch(() => []),
        api.get(`/vendors?q=${encodeURIComponent(term)}`).then((r) => (Array.isArray(r) ? r : r.items || [])).catch(() => []),
      ]).then(([contracts, vendors]) => {
        setResults({ contracts, vendors: vendors.slice(0, 6) })
        setLoading(false)
      })
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  function go(path) { setOpen(false); setQ(''); navigate(path) }

  function onKeyDown(e) {
    if (e.key === 'Enter' && q.trim().length >= 2) go(`/contracts?q=${encodeURIComponent(q.trim())}`)
    if (e.key === 'Escape') setOpen(false)
  }

  const empty = !loading && results.contracts.length === 0 && results.vendors.length === 0
  return (
    <div className="global-search" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false) }}>
      <input type="search" placeholder="Search contracts & vendors…" value={q}
        onChange={(e) => setQ(e.target.value)} onKeyDown={onKeyDown}
        onFocus={() => { if (q.trim().length >= 2) setOpen(true) }}
        aria-label="Global search" />
      {open && (
        <div className="search-menu" role="listbox">
          {loading && <p className="hint" style={{ margin: 6 }}>Searching…</p>}
          {empty && <p className="hint" style={{ margin: 6 }}>No matches.</p>}
          {results.contracts.length > 0 && (
            <>
              <div className="search-group">Contracts</div>
              {results.contracts.map((c) => (
                <button key={`c${c.sr_no}`} className="search-item" onClick={() => go(`/contracts/${c.sr_no}`)}>
                  <strong>#{c.sr_no}</strong> {c.vendor_name || '—'}
                  <span className="hint"> · {c.contract_service || ''}</span>
                </button>
              ))}
            </>
          )}
          {results.vendors.length > 0 && (
            <>
              <div className="search-group">Vendors</div>
              {results.vendors.map((v) => (
                <button key={`v${v.id}`} className="search-item" onClick={() => go(`/vendors/${v.id}`)}>
                  {v.name} <span className="hint"> · {v.contract_count ?? 0} contracts</span>
                </button>
              ))}
            </>
          )}
          {(results.contracts.length > 0 || results.vendors.length > 0) && (
            <button className="search-item all" onClick={() => go(`/contracts?q=${encodeURIComponent(q.trim())}`)}>
              See all contract results for “{q.trim()}” →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function NotificationBell() {
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([])

  const refresh = () => api.get('/notifications/unread-count').then((r) => setUnread(r.unread)).catch(() => {})

  useEffect(() => {
    refresh()
    const t = setInterval(refresh, 60000)  // poll each minute
    return () => clearInterval(t)
  }, [])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next) api.get('/notifications?limit=20').then(setItems).catch(() => {})
  }

  async function openItem(n) {
    try { await api.post(`/notifications/${n.id}/read`) } catch { /* ignore */ }
    setOpen(false); refresh()
    if (n.link) navigate(n.link)
  }

  async function markAll() {
    try { await api.post('/notifications/read-all') } catch { /* ignore */ }
    setItems((xs) => xs.map((x) => ({ ...x, read: true })))
    refresh()
  }

  return (
    <div className="bell">
      <button className="secondary" onClick={toggle} style={{ width: '100%' }}>
        🔔 Notifications{unread > 0 ? ` (${unread})` : ''}
      </button>
      {open && (
        <div className="bell-menu">
          <div className="toolbar" style={{ margin: '0 0 6px' }}>
            <strong>Notifications</strong>
            <span className="spacer" />
            <button className="secondary" onClick={markAll} style={{ padding: '2px 8px' }}>Mark all read</button>
          </div>
          {items.length === 0 && <p className="hint">Nothing yet.</p>}
          {items.map((n) => (
            <div key={n.id} className={`bell-item${n.read ? '' : ' unread'}`} onClick={() => openItem(n)}>
              <div>{n.message}</div>
              <div className="hint" style={{ fontSize: 11 }}>{new Date(n.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  async function submit() {
    setError(null)
    try {
      await api.post('/auth/change-password', { current_password: current, new_password: next })
      setDone(true)
    } catch (e) { setError(e.message) }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 400 }}>
        <h3>Change my password</h3>
        {done ? (
          <>
            <div className="success">Password updated.</div>
            <button onClick={onClose}>Close</button>
          </>
        ) : (
          <>
            <label>Current password</label>
            <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
            <label>New password (min 8 characters)</label>
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
            {error && <div className="error">{error}</div>}
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button disabled={!current || next.length < 8} onClick={submit}>Update password</button>
              <button className="secondary" onClick={onClose}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function AppVersion() {
  const [v, setV] = useState(null)
  useEffect(() => { api.get('/version').then(setV).catch(() => {}) }, [])
  if (!v) return null
  const title = [
    v.commit ? `build ${v.commit}` : null,
    v.build_date ? new Date(v.build_date).toLocaleString() : null,
  ].filter(Boolean).join(' · ')
  return <div className="app-version" title={title}>v{v.version}</div>
}

export default function Layout({ children }) {
  const { user, logout, isAdmin, canAuthor, canSeePage } = useAuth()
  const [showPw, setShowPw] = useState(false)
  const [navOpen, setNavOpen] = useState(false)  // mobile off-canvas sidebar
  // A link renders only when the user's role satisfies BOTH the module-level
  // permission (unchanged security posture) and the admin-configured page access.
  const show = (key, roleOk = true) => roleOk && canSeePage(key)
  return (
    <div className={`layout${navOpen ? ' nav-open' : ''}`}>
      <div className="mobile-topbar">
        <button className="hamburger" aria-label="Open navigation" aria-expanded={navOpen}
          onClick={() => setNavOpen(true)}>☰</button>
        <span className="mobile-title">Contract MS</span>
      </div>
      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <aside className="sidebar">
        <h1>Contract MS</h1>
        <GlobalSearch />
        <nav onClick={() => setNavOpen(false)}>
          {show('dashboard') && <NavLink to="/" end>Dashboard</NavLink>}
          {show('requests') && <NavLink to="/requests">Contract Requests</NavLink>}
          {show('tasks') && <NavLink to="/tasks">My Tasks</NavLink>}
          {show('ingestion') && <NavLink to="/ingestion">Ingestion Log</NavLink>}
          {show('validation') && <NavLink to="/validation">Validation Queue</NavLink>}
          {show('duplicates') && <NavLink to="/duplicates">Duplicate Review</NavLink>}
          {show('contracts') && <NavLink to="/contracts">Contracts</NavLink>}
          {show('repository_ai') && <NavLink to="/repository-ai">🔎 Repository AI</NavLink>}
          {show('obligations') && <NavLink to="/obligations">Obligations</NavLink>}
          {show('authoring', canAuthor) && <NavLink to="/authoring/new">✎ Author contract</NavLink>}
          {show('drafts', canAuthor) && <NavLink to="/authoring/drafts">Drafting Queue</NavLink>}
          {show('reviews', canAuthor) && <NavLink to="/reviews">Reviews</NavLink>}
          {show('templates', canAuthor) && <NavLink to="/authoring/templates">Templates</NavLink>}
          {show('clauses', canAuthor) && <NavLink to="/authoring/clauses">Clause Library</NavLink>}
          {show('redline', canAuthor) && <NavLink to="/authoring/inbox">Redline Inbox</NavLink>}
          {show('signatures', canAuthor) && <NavLink to="/authoring/signatures">Signatures</NavLink>}
          {show('vendors') && <NavLink to="/vendors">Vendors</NavLink>}
          {show('rules') && <NavLink to="/rules">Reminder Rules</NavLink>}
          {show('portfolio') && <NavLink to="/portfolio">Portfolio</NavLink>}
          {show('reports') && <NavLink to="/reports">Reports</NavLink>}
          {show('report_builder') && <NavLink to="/report-builder">Report Builder</NavLink>}
          {show('ai_governance', canAuthor) && <NavLink to="/ai-governance">AI Governance</NavLink>}
          {show('audit', isAdmin) && <NavLink to="/audit">Audit Log</NavLink>}
          {show('retention', isAdmin) && <NavLink to="/retention">Data Retention</NavLink>}
          {show('settings', isAdmin) && <NavLink to="/settings">Admin Settings</NavLink>}
        </nav>
        <div className="userbox">
          <div>{user.name}</div>
          <div style={{ opacity: 0.7 }}>{user.role}</div>
          <div style={{ marginTop: 6 }}><NotificationBell /></div>
          <button className="secondary" onClick={() => setShowPw(true)} style={{ marginTop: 6 }}>Change password</button>
          <ThemeToggle />
          <button className="secondary" onClick={logout} style={{ marginTop: 6 }}>Sign out</button>
        </div>
        <AppVersion />
      </aside>
      <main className="main">{children}</main>
      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} />}
    </div>
  )
}
