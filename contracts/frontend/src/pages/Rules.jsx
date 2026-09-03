import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../auth'

const EMPTY = {
  name: '', offsets: '90, 60, 30, 15, 7, 1', periodicity_days: '', post_expiry_days: '',
  escalation_after: '', escalation_email: '', department_ids: [], channels: ['email'],
  apply_scope: 'existing_and_new',
}

export default function Rules() {
  const { isAdmin } = useAuth()
  const [rules, setRules] = useState([])
  const [departments, setDepartments] = useState([])
  const [log, setLog] = useState([])
  const [logStatus, setLogStatus] = useState('')
  const [editing, setEditing] = useState(null) // null | {id?, ...form}
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const load = useCallback(() => {
    api.get('/rules').then(setRules).catch((e) => setError(e.message))
    api.get('/departments').then(setDepartments).catch(() => {})
  }, [])

  useEffect(load, [load])
  useEffect(() => {
    const p = logStatus ? `?status=${logStatus}` : ''
    api.get(`/rules/reminder-log${p}`).then(setLog).catch(() => {})
  }, [logStatus])

  function startEdit(rule) {
    setEditing(rule ? {
      id: rule.id,
      name: rule.name,
      offsets: rule.offsets.join(', '),
      periodicity_days: rule.periodicity_days ?? '',
      post_expiry_days: rule.post_expiry_days ?? '',
      escalation_after: rule.escalation_after ?? '',
      escalation_email: rule.escalation_email ?? '',
      department_ids: rule.department_ids,
      channels: rule.channels && rule.channels.length ? rule.channels : ['email'],
      apply_scope: 'existing_and_new',
    } : { ...EMPTY })
  }

  async function save() {
    const payload = {
      name: editing.name,
      offsets: editing.offsets.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n)),
      periodicity_days: editing.periodicity_days ? Number(editing.periodicity_days) : null,
      post_expiry_days: editing.post_expiry_days ? Number(editing.post_expiry_days) : null,
      escalation_after: editing.escalation_after ? Number(editing.escalation_after) : null,
      escalation_email: editing.escalation_email || null,
      channels: editing.channels && editing.channels.length ? editing.channels : ['email'],
      department_ids: editing.department_ids,
      apply_scope: editing.apply_scope,
    }
    try {
      if (editing.id) await api.put(`/rules/${editing.id}`, payload)
      else await api.post('/rules', payload)
      setEditing(null)
      load()
    } catch (e) { setError(e.message) }
  }

  async function runNow() {
    try {
      const res = await api.post('/rules/run-now')
      setMessage(`Reminder check ran: ${res.reminders_fired} reminder(s) fired`)
      load()
    } catch (e) { setError(e.message) }
  }

  const deptName = (id) => departments.find((d) => d.id === id)?.name || id

  return (
    <div>
      <h2>Reminder Rules</h2>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
      <div className="toolbar">
        {isAdmin && <button onClick={() => startEdit(null)}>+ New rule</button>}
        {isAdmin && <button className="secondary" onClick={runNow}>Run daily check now</button>}
      </div>

      <table className="grid">
        <thead>
          <tr><th>Rule</th><th>Offsets (days before expiry)</th><th>Then every</th><th>After expiry</th>
            <th>Escalation</th><th>Departments</th><th></th></tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td>{r.offsets.join(', ')}</td>
              <td>{r.periodicity_days ? `${r.periodicity_days} days until expiry` : '—'}</td>
              <td>{r.post_expiry_days ? `every ${r.post_expiry_days} days until acknowledged` : '—'}</td>
              <td>{r.escalation_after ? `CC ${r.escalation_email} after ${r.escalation_after} ignored` : '—'}</td>
              <td>{r.department_ids.map(deptName).join(', ') || '—'}</td>
              <td>{isAdmin && <button className="secondary" onClick={() => startEdit(r)}>Edit</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 560 }}>
            <h3>{editing.id ? 'Edit rule' : 'New reminder rule'}</h3>
            <label>Rule name</label>
            <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            <label>Reminder offsets — days before expiry, comma-separated</label>
            <input value={editing.offsets} onChange={(e) => setEditing({ ...editing, offsets: e.target.value })} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label>Then every N days until expiry (optional)</label>
                <input type="number" value={editing.periodicity_days} onChange={(e) => setEditing({ ...editing, periodicity_days: e.target.value })} />
              </div>
              <div>
                <label>Continue every N days after expiry (optional)</label>
                <input type="number" value={editing.post_expiry_days} onChange={(e) => setEditing({ ...editing, post_expiry_days: e.target.value })} />
              </div>
              <div>
                <label>Escalate after N ignored reminders</label>
                <input type="number" value={editing.escalation_after} onChange={(e) => setEditing({ ...editing, escalation_after: e.target.value })} />
              </div>
              <div>
                <label>Escalation contact email</label>
                <input value={editing.escalation_email} onChange={(e) => setEditing({ ...editing, escalation_email: e.target.value })} />
              </div>
            </div>
            <label>Departments using this rule</label>
            <div>
              {departments.map((d) => (
                <label key={d.id} style={{ fontWeight: 400, display: 'inline-flex', gap: 4, marginRight: 14, alignItems: 'center' }}>
                  <input type="checkbox" style={{ width: 'auto' }}
                    checked={editing.department_ids.includes(d.id)}
                    onChange={(e) => setEditing({
                      ...editing,
                      department_ids: e.target.checked
                        ? [...editing.department_ids, d.id]
                        : editing.department_ids.filter((x) => x !== d.id),
                    })} />
                  {d.name}
                </label>
              ))}
            </div>
            <label>Delivery channels</label>
            <div>
              {['email', 'slack', 'teams'].map((ch) => (
                <label key={ch} style={{ fontWeight: 400, display: 'inline-flex', gap: 4, marginRight: 14, alignItems: 'center' }}>
                  <input type="checkbox" style={{ width: 'auto' }}
                    checked={editing.channels.includes(ch)}
                    onChange={(e) => setEditing({
                      ...editing,
                      channels: e.target.checked
                        ? [...editing.channels, ch]
                        : editing.channels.filter((x) => x !== ch),
                    })} />
                  {ch}
                </label>
              ))}
            </div>
            <p className="hint">Slack/Teams require a webhook URL configured in Admin Settings.</p>
            <label>When the mapping changes, apply to…</label>
            <select value={editing.apply_scope} onChange={(e) => setEditing({ ...editing, apply_scope: e.target.value })}>
              <option value="existing_and_new">Existing and new contracts</option>
              <option value="new_only">New contracts only</option>
            </select>
            <div className="toolbar" style={{ marginTop: 14 }}>
              <button disabled={!editing.name} onClick={save}>Save rule</button>
              <button className="secondary" onClick={() => setEditing(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginTop: 18 }}>
        <h3>Reminder Log</h3>
        <div className="toolbar">
          <select value={logStatus} onChange={(e) => setLogStatus(e.target.value)}>
            <option value="">All statuses</option>
            {['SENT', 'SKIPPED', 'FAILED'].map((s) => <option key={s}>{s}</option>)}
          </select>
          <span className="hint">{log.length} entries</span>
          <span className="spacer" />
          <button className="secondary" onClick={() => {
            const p = logStatus ? `?status=${logStatus}` : ''
            api.download(`/rules/reminder-log/export${p}`, 'reminder_log.csv')
          }}>Export CSV</button>
        </div>
        <table className="grid">
          <thead><tr><th>Sent</th><th>Contract</th><th>Counterparty</th><th>Recipient</th><th>Channel</th>
            <th>Days to expiry</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>
            {log.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.sent_at).toLocaleString()}</td>
                <td>#{r.contract_id}</td>
                <td>{r.vendor || '—'}</td>
                <td>{r.recipient}{r.escalated && <span className="badge warn"> escalated</span>}</td>
                <td>{r.channel}</td>
                <td>{r.days_to_expiry}</td>
                <td><span className={`badge ${r.delivery_status}`}>{r.delivery_status}</span></td>
                <td className="hint">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
