import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { usePersistedState, clearPersisted } from '../usePersistedState'

const PAGE = 50
const K = 'cms_filters_audit'

export default function Audit() {
  const [data, setData] = useState({ total: 0, items: [] })
  const [types, setTypes] = useState([])
  const [entityType, setEntityType] = usePersistedState(`${K}_entity`, '')
  const [action, setAction] = usePersistedState(`${K}_action`, '')
  const [page, setPage] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => { api.get('/audit/entity-types').then(setTypes).catch(() => {}) }, [])

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: PAGE, offset: page * PAGE })
    if (entityType) params.set('entity_type', entityType)
    if (action) params.set('action', action)
    api.get(`/audit?${params}`).then(setData).catch((e) => setError(e.message))
  }, [entityType, action, page])

  useEffect(load, [load])
  useEffect(() => { setPage(0) }, [entityType, action])

  const link = (t, id) =>
    t === 'contract' ? <Link to={`/contracts/${id}`}>#{id}</Link>
      : t === 'vendor' ? <Link to={`/vendors/${id}`}>#{id}</Link>
        : `#${id}`

  const maxPage = Math.max(0, Math.ceil(data.total / PAGE) - 1)

  return (
    <div>
      <h2>Audit Log</h2>
      <div className="toolbar">
        <select value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          <option value="">All entity types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="Filter action (e.g. VALIDATE)" value={action} onChange={(e) => setAction(e.target.value)} />
        {(entityType || action) && (
          <button className="secondary" onClick={() => { setEntityType(''); setAction(''); clearPersisted(`${K}_entity`, `${K}_action`) }}>Clear filters</button>
        )}
        <span className="hint">{data.total} entries</span>
        <span className="spacer" />
        <button className="secondary" onClick={() => {
          const p = new URLSearchParams()
          if (entityType) p.set('entity_type', entityType)
          if (action) p.set('action', action)
          api.download(`/audit/export?${p}`, 'audit_log.csv')
        }}>Export CSV</button>
      </div>
      {error && <div className="error">{error}</div>}
      <table className="grid">
        <thead>
          <tr><th>When</th><th>Entity</th><th>Action</th><th>Field</th><th>Old → New</th><th>Who</th></tr>
        </thead>
        <tbody>
          {data.items.map((a) => (
            <tr key={a.id}>
              <td>{new Date(a.created_at).toLocaleString()}</td>
              <td>{a.entity_type} {link(a.entity_type, a.entity_id)}</td>
              <td>{a.action}</td>
              <td>{a.field || '—'}</td>
              <td>{a.field ? `${a.old_value ?? '∅'} → ${a.new_value ?? '∅'}` : (a.new_value || '—')}</td>
              <td>{a.user || 'system'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <button className="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
        <span className="hint">Page {page + 1} of {maxPage + 1}</span>
        <button className="secondary" disabled={page >= maxPage} onClick={() => setPage((p) => p + 1)}>Next →</button>
      </div>
    </div>
  )
}
