import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { confirmDialog } from '../confirm'

const TYPES = [
  { key: 'contract', label: 'Contracts' },
  { key: 'vendor', label: 'Vendors' },
  { key: 'department', label: 'Departments' },
]

export default function Retention() {
  const [summary, setSummary] = useState({})
  const [entityType, setEntityType] = useState('contract')
  const [items, setItems] = useState([])
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const loadSummary = useCallback(() => {
    api.get('/retention/summary').then(setSummary).catch((e) => setError(e.message))
  }, [])

  const load = useCallback(() => {
    api.get(`/retention/deleted?entity_type=${entityType}`)
      .then((r) => setItems(r.items)).catch((e) => setError(e.message))
  }, [entityType])

  useEffect(loadSummary, [loadSummary])
  useEffect(load, [load])

  async function restore(id) {
    setError(null); setMessage(null)
    try {
      await api.post('/retention/restore', { entity_type: entityType, id })
      setMessage(`Restored ${entityType} #${id}`)
      load(); loadSummary()
    } catch (e) { setError(e.message) }
  }

  async function purge(id, label) {
    if (!await confirmDialog(`Permanently delete ${entityType} "${label}"? This cannot be undone.`)) return
    setError(null); setMessage(null)
    try {
      await api.post('/retention/purge', { entity_type: entityType, id })
      setMessage(`Purged ${entityType} #${id}`)
      load(); loadSummary()
    } catch (e) { setError(e.message) }
  }

  return (
    <div>
      <h2>Data Retention</h2>
      <p className="hint">
        Soft-deleted records are kept until an administrator restores or permanently
        purges them. Purging is irreversible; a vendor or department still referenced
        by a live contract cannot be purged.
      </p>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <div className="toolbar">
        {TYPES.map((t) => (
          <button key={t.key} className={entityType === t.key ? '' : 'secondary'} onClick={() => setEntityType(t.key)}>
            {t.label} ({summary[t.key] ?? 0})
          </button>
        ))}
      </div>

      <table className="grid">
        <thead><tr><th>ID</th><th>Record</th><th>Deleted at</th><th></th></tr></thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>{it.id}</td>
              <td>{it.label}</td>
              <td>{it.deleted_at ? new Date(it.deleted_at).toLocaleString() : '—'}</td>
              <td>
                <div className="toolbar" style={{ margin: 0 }}>
                  <button className="secondary" onClick={() => restore(it.id)}>Restore</button>
                  <button className="danger" onClick={() => purge(it.id, it.label)}>Purge</button>
                </div>
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={4} className="hint">No soft-deleted {entityType}s.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
