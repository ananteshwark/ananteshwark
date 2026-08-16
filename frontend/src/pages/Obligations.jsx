import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { usePersistedState } from '../usePersistedState'

// Obligation portfolio (G4/D1): every obligation across the repository, with
// owner/type/status filters, overdue surfacing, and inline completion.

const TYPES = ['', 'payment', 'report', 'renewal', 'notice', 'sla', 'insurance', 'audit', 'compliance', 'other']

function Stat({ label, value, tone }) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 120, textAlign: 'center', margin: 0 }}>
      <div style={{ fontSize: 26, fontWeight: 700 }} className={tone ? `stat-${tone}` : undefined}>{value}</div>
      <div className="hint">{label}</div>
    </div>
  )
}

export default function Obligations() {
  const [stats, setStats] = useState(null)
  const [rows, setRows] = useState([])
  const [selected, setSelected] = useState([])
  const [users, setUsers] = useState([])
  const [error, setError] = useState(null)
  const [filters, setFilters] = usePersistedState('obligations.filters', {
    owner: '', status: 'PENDING', obligation_type: '', overdue: false,
  })

  const load = useCallback(() => {
    const p = new URLSearchParams()
    if (filters.owner) p.set('owner', filters.owner)
    if (filters.status) p.set('status', filters.status)
    if (filters.obligation_type) p.set('obligation_type', filters.obligation_type)
    if (filters.overdue) p.set('overdue', 'true')
    api.get(`/obligations?${p}`).then((r) => { setRows(r.obligations); setSelected([]) }).catch((e) => setError(e.message))
    api.get('/obligations/stats').then(setStats).catch(() => {})
  }, [filters])
  useEffect(() => { load() }, [load])
  useEffect(() => { api.get('/auth/users-lite').then(setUsers).catch(() => {}) }, [])

  const allChecked = rows.length > 0 && selected.length === rows.length
  const toggleOne = (id) => setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id])
  const toggleAll = () => setSelected(allChecked ? [] : rows.map((r) => r.id))

  async function bulk(body) {
    if (selected.length === 0) return
    setError(null)
    try { await api.post('/obligations/bulk', { ids: selected, ...body }); load() }
    catch (e) { setError(e.message) }
  }

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function toggle(o) {
    try {
      await api.patch(`/contracts/${o.contract_id}/milestones/${o.id}`, { status: o.status === 'DONE' ? 'PENDING' : 'DONE' })
      load()
    } catch (e) { setError(e.message) }
  }

  return (
    <div>
      <h2>Obligations</h2>
      <p className="hint">Every tracked obligation across the repository. Filter by owner, type, or status; tick to mark fulfilled.</p>
      {error && <div className="error">{error}</div>}

      {stats && (
        <div className="toolbar" style={{ gap: 10, margin: '10px 0' }}>
          <Stat label="Open" value={stats.open} />
          <Stat label="Overdue" value={stats.overdue} tone={stats.overdue ? 'bad' : undefined} />
          <Stat label="Assigned to me" value={stats.mine_open} />
          <Stat label="Done" value={stats.done} />
        </div>
      )}

      <div className="card">
        <div className="toolbar" style={{ margin: 0, flexWrap: 'wrap' }}>
          <select value={filters.owner} onChange={set('owner')}>
            <option value="">All owners</option>
            <option value="me">Assigned to me</option>
          </select>
          <select value={filters.status} onChange={set('status')}>
            <option value="">Any status</option>
            <option value="PENDING">Open</option>
            <option value="DONE">Done</option>
          </select>
          <select value={filters.obligation_type} onChange={set('obligation_type')}>
            {TYPES.map((t) => <option key={t} value={t}>{t || 'Any type'}</option>)}
          </select>
          <label style={{ margin: 0, display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 400 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={filters.overdue} onChange={set('overdue')} /> overdue only
          </label>
          <span className="spacer" />
          <button className="secondary" onClick={() => setFilters({ owner: '', status: 'PENDING', obligation_type: '', overdue: false })}>Clear</button>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="card" style={{ position: 'sticky', top: 0, zIndex: 2 }}>
          <div className="toolbar" style={{ margin: 0, flexWrap: 'wrap', alignItems: 'center' }}>
            <strong>{selected.length} selected</strong>
            <button className="secondary" onClick={() => bulk({ action: 'complete' })}>✓ Mark done</button>
            <button className="secondary" onClick={() => bulk({ action: 'reopen' })}>↺ Reopen</button>
            <select defaultValue="" onChange={(e) => { if (e.target.value) { bulk({ action: 'assign', owner_user_id: Number(e.target.value) }); e.target.value = '' } }}>
              <option value="">Assign to…</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <input type="date" onChange={(e) => { if (e.target.value) bulk({ action: 'due_date', due_date: e.target.value }) }} title="Set due date" />
            <span className="spacer" />
            <button className="secondary" onClick={() => setSelected([])}>Clear selection</button>
          </div>
        </div>
      )}

      <table className="grid">
        <thead><tr>
          <th style={{ width: 28 }}><input type="checkbox" style={{ width: 'auto' }} checked={allChecked} onChange={toggleAll} aria-label="Select all" /></th>
          <th></th><th>Obligation</th><th>Contract</th><th>Type</th><th>Owner</th><th>Due</th>
        </tr></thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} style={o.status === 'DONE' ? { opacity: 0.6 } : undefined}>
              <td><input type="checkbox" style={{ width: 'auto' }} checked={selected.includes(o.id)} onChange={() => toggleOne(o.id)} aria-label={`Select ${o.title}`} /></td>
              <td><input type="checkbox" style={{ width: 'auto' }} checked={o.status === 'DONE'} onChange={() => toggle(o)} aria-label="Mark done" /></td>
              <td style={o.status === 'DONE' ? { textDecoration: 'line-through' } : undefined}>
                {o.title}{o.ai_generated && <span className="badge ARCHIVED" style={{ marginLeft: 4 }}>AI</span>}
              </td>
              <td><Link to={`/contracts/${o.contract_id}`}>#{o.contract_id}</Link> <span className="hint">{o.vendor_name || ''}</span></td>
              <td>{o.obligation_type ? <span className="badge">{o.obligation_type}</span> : '—'}</td>
              <td className="hint">
                {o.owner_user_name || (o.owner_party === 'us' ? 'Us' : o.owner_party === 'counterparty' ? 'Vendor' : o.owner_party === 'both' ? 'Both' : '—')}
                {o.frequency ? ` · ${o.frequency}` : ''}
              </td>
              <td>{o.overdue ? <span className="badge REJECTED">{o.due_date}</span> : (o.due_date || '—')}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="7" className="hint">No obligations match these filters.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
