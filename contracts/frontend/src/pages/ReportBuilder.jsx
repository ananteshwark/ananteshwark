import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'

// Custom report builder (G8): saved definitions (filters + columns), run/preview,
// CSV export, and scheduled email delivery.

const EMPTY = {
  name: '', description: '', filters: { contract_type: '', status: '', value_min: '', expiring_within_days: '' },
  columns: ['sr_no', 'vendor_name', 'contract_type', 'end_date', 'contract_value'],
  sort: '', schedule: 'none', schedule_day: '', recipients: '',
}

export default function ReportBuilder() {
  const { isAdmin } = useAuth()
  const [reports, setReports] = useState([])
  const [cols, setCols] = useState([])
  const [types, setTypes] = useState([])
  const [editing, setEditing] = useState(null)   // definition being edited (or EMPTY for new)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const load = useCallback(() => api.get('/report-builder').then(setReports).catch((e) => setError(e.message)), [])
  useEffect(() => {
    load()
    api.get('/report-builder/columns').then((r) => setCols(r.columns)).catch(() => {})
    api.get('/contracts/types').then((r) => setTypes(r.types)).catch(() => {})
  }, [load])

  function startNew() { setEditing({ ...EMPTY }); setPreview(null) }
  function startEdit(d) {
    setEditing({
      ...d,
      filters: { contract_type: '', status: '', value_min: '', expiring_within_days: '', ...(d.filters || {}) },
      recipients: (d.recipients || []).join(', '),
      schedule_day: d.schedule_day ?? '',
    })
    setPreview(null)
  }

  function toBody(e) {
    return {
      name: e.name.trim(), description: e.description || null,
      filters: Object.fromEntries(Object.entries(e.filters).filter(([, v]) => v !== '' && v != null)),
      columns: e.columns, sort: e.sort || null, schedule: e.schedule,
      schedule_day: e.schedule_day === '' ? null : Number(e.schedule_day),
      recipients: e.recipients ? e.recipients.split(',').map((s) => s.trim()).filter(Boolean) : [],
    }
  }
  async function save() {
    if (!editing.name.trim()) return
    setError(null)
    try {
      if (editing.id) await api.put(`/report-builder/${editing.id}`, toBody(editing))
      else await api.post('/report-builder', toBody(editing))
      setEditing(null); load()
    } catch (e) { setError(e.message) }
  }
  async function remove(id) {
    try { await api.del(`/report-builder/${id}`); load(); if (editing?.id === id) setEditing(null) } catch (e) { setError(e.message) }
  }
  async function runPreview(id) {
    setError(null)
    try { setPreview(await api.post(`/report-builder/${id}/run`)) } catch (e) { setError(e.message) }
  }
  function exportCsv(d) {
    api.download(`/report-builder/${d.id}/export.csv`, `${d.name.replace(/\s+/g, '_').toLowerCase()}.csv`).catch((e) => setError(e.message))
  }
  async function sendNow(id) {
    setError(null); setMessage('Sending…')
    try { const r = await api.post(`/report-builder/${id}/send`); setMessage(r.detail); load() }
    catch (e) { setError(e.message); setMessage(null) }
  }

  const toggleCol = (key) => {
    const has = editing.columns.includes(key)
    setEditing({ ...editing, columns: has ? editing.columns.filter((c) => c !== key) : [...editing.columns, key] })
  }
  const setF = (k) => (e) => setEditing({ ...editing, filters: { ...editing.filters, [k]: e.target.value } })

  return (
    <div>
      <div className="toolbar" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Report Builder</h2>
        <span className="spacer" />
        {isAdmin && <button onClick={startNew}>New report</button>}
      </div>
      <p className="hint">Build saved reports over the contract repository, export CSV, or schedule email delivery.</p>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <div className="card">
        <table className="grid">
          <thead><tr><th>Name</th><th>Schedule</th><th>Recipients</th><th>Last run</th><th></th></tr></thead>
          <tbody>
            {reports.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.name}</strong>{d.description && <div className="hint">{d.description}</div>}</td>
                <td>{d.schedule === 'none' ? '—' : <span className="badge">{d.schedule}</span>}{!d.active && <span className="badge REJECTED" style={{ marginLeft: 4 }}>off</span>}</td>
                <td className="hint">{(d.recipients || []).join(', ') || '—'}</td>
                <td className="hint">{d.last_run_at ? new Date(d.last_run_at).toLocaleString() : '—'}</td>
                <td>
                  <div className="toolbar" style={{ margin: 0 }}>
                    <button className="secondary" onClick={() => runPreview(d.id)}>Run</button>
                    <button className="secondary" onClick={() => exportCsv(d)}>CSV</button>
                    {isAdmin && d.recipients?.length > 0 && <button className="secondary" onClick={() => sendNow(d.id)}>Send</button>}
                    {isAdmin && <button className="secondary" onClick={() => startEdit(d)}>Edit</button>}
                    {isAdmin && <button className="danger" onClick={() => remove(d.id)}>×</button>}
                  </div>
                </td>
              </tr>
            ))}
            {reports.length === 0 && <tr><td colSpan="5" className="hint">No saved reports yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {preview && (
        <div className="card">
          <h3>Preview <span className="hint">{preview.total} row(s)</span></h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="grid">
              <thead><tr>{preview.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
              <tbody>
                {preview.rows.slice(0, 100).map((row, i) => (
                  <tr key={i}>{row.map((v, j) => <td key={j}>{v == null ? '—' : String(v)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.total > 100 && <p className="hint">Showing first 100 rows — export CSV for all.</p>}
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <h3>{editing.id ? 'Edit report' : 'New report'}</h3>
            <label>Name</label>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <label>Description</label>
            <input value={editing.description || ''} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />

            <h4>Filters</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label>Contract type</label>
                <select value={editing.filters.contract_type} onChange={setF('contract_type')}>
                  <option value="">Any</option>
                  {types.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label>Status</label>
                <select value={editing.filters.status} onChange={setF('status')}>
                  <option value="">Validated (default)</option>
                  <option value="PENDING_VALIDATION">Pending validation</option>
                  <option value="VALIDATED">Validated</option>
                </select>
              </div>
              <div>
                <label>Min value</label>
                <input type="number" value={editing.filters.value_min} onChange={setF('value_min')} />
              </div>
              <div>
                <label>Expiring within (days)</label>
                <input type="number" value={editing.filters.expiring_within_days} onChange={setF('expiring_within_days')} />
              </div>
            </div>

            <h4>Columns</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {cols.map((c) => (
                <label key={c.key} style={{ margin: 0, display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 400 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={editing.columns.includes(c.key)} onChange={() => toggleCol(c.key)} /> {c.label}
                </label>
              ))}
            </div>

            <h4>Schedule &amp; delivery</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label>Frequency</label>
                <select value={editing.schedule} onChange={(e) => setEditing({ ...editing, schedule: e.target.value })}>
                  <option value="none">None</option><option value="daily">Daily</option>
                  <option value="weekly">Weekly</option><option value="monthly">Monthly</option>
                </select>
              </div>
              {(editing.schedule === 'weekly' || editing.schedule === 'monthly') && (
                <div>
                  <label>{editing.schedule === 'weekly' ? 'Day (0=Mon … 6=Sun)' : 'Day of month (1–28)'}</label>
                  <input type="number" value={editing.schedule_day} onChange={(e) => setEditing({ ...editing, schedule_day: e.target.value })} />
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <label>Recipients (comma-separated emails)</label>
                <input value={editing.recipients} onChange={(e) => setEditing({ ...editing, recipients: e.target.value })} placeholder="ops@example.com, legal@example.com" />
              </div>
            </div>
            <label style={{ marginTop: 8, display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 400 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={editing.active !== false} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} /> active
            </label>

            <div className="toolbar" style={{ marginTop: 12 }}>
              <button disabled={!editing.name.trim()} onClick={save}>{editing.id ? 'Save' : 'Create'}</button>
              <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
