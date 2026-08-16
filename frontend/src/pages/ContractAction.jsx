import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { confirmDialog } from '../confirm'

// Public, token-only page reached from an expiry-reminder email. No auth/OTP —
// uses raw fetch (the api helper would redirect to /login on 401).
async function cget(token) {
  const r = await fetch(`/api/contract-action/${token}`)
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Link error')
  return r.json()
}
async function cpost(token, path, body) {
  const r = await fetch(`/api/contract-action/${token}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).detail || 'Request failed')
  return r.json()
}

function Row({ label, value }) {
  return <div style={{ display: 'flex', gap: 8 }}><div style={{ width: 160, color: '#5a6b7b' }}>{label}</div><div><b>{value ?? '—'}</b></div></div>
}

export default function ContractAction() {
  const { token } = useParams()
  const [state, setState] = useState('loading')   // loading | ready | done | error
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState(null)          // null | 'renew'
  const [message, setMessage] = useState(null)
  const [form, setForm] = useState(null)

  const load = useCallback(() => {
    cget(token).then((d) => {
      setData(d)
      const rd = d.renewal_defaults || {}
      setForm({
        signing_entity: rd.signing_entity || '',
        contract_type: rd.contract_type || '',
        contract_service: rd.contract_service || '',
        start_date: rd.start_date || '',
        end_date: rd.end_date || '',
        phi_shared: rd.phi_shared ? 'yes' : 'no',
      })
      setState('ready')
    }).catch((e) => { setError(e.message); setState('error') })
  }, [token])
  useEffect(load, [load])

  async function terminate() {
    if (!await confirmDialog('Confirm that this contract should be TERMINATED (not renewed)?')) return
    try { const r = await cpost(token, '/terminate'); setMessage(r.message); setState('done') }
    catch (e) { setError(e.message) }
  }
  async function submitRenew() {
    try {
      const r = await cpost(token, '/renew', {
        signing_entity: form.signing_entity || null,
        contract_type: form.contract_type || null,
        contract_service: form.contract_service || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        phi_shared: form.phi_shared === 'yes',
      })
      setMessage(r.message); setState('done')
    } catch (e) { setError(e.message) }
  }

  if (state === 'loading') return <div className="login-wrap"><p>Loading…</p></div>
  if (state === 'error') return <div className="login-wrap"><div className="login-card"><h2>Link unavailable</h2><div className="error">{error}</div></div></div>
  if (state === 'done') return (
    <div className="login-wrap"><div className="login-card">
      <h2>Thank you</h2>
      <div className="success">{message}</div>
    </div></div>
  )

  const c = data.contract
  const opts = data.options || {}
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 20px' }}>
      <h2 style={{ marginBottom: 4 }}>Contract renewal decision</h2>
      <p className="hint">Contract #{c.sr_no} — please tell us whether to renew or terminate.</p>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Current contract</h3>
        <Row label="Vendor" value={c.vendor} />
        <Row label="Signing entity" value={c.signing_entity} />
        <Row label="Department" value={c.department} />
        <Row label="Service" value={c.contract_service} />
        <Row label="Type" value={c.contract_type} />
        <Row label="Term" value={`${c.start_date || '—'} → ${c.end_date || '—'}`} />
        <Row label="Value" value={c.contract_value != null ? `${c.currency || ''} ${c.contract_value.toLocaleString('en-IN')}` : '—'} />
      </div>

      {mode !== 'renew' && (
        <div className="toolbar">
          <button onClick={() => setMode('renew')}>Renew this contract</button>
          <button className="danger" onClick={terminate}>Terminate — do not renew</button>
        </div>
      )}

      {mode === 'renew' && form && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Renewal details</h3>
          <p className="hint">Prefilled from the current contract — adjust as needed. Dates default to the next term.</p>

          <label>Entity name</label>
          <select value={form.signing_entity} onChange={(e) => setForm({ ...form, signing_entity: e.target.value })}>
            {!(opts.signing_entities || []).includes(form.signing_entity) && form.signing_entity &&
              <option value={form.signing_entity}>{form.signing_entity}</option>}
            {(opts.signing_entities || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>

          <label>Document type</label>
          <select value={form.contract_type} onChange={(e) => setForm({ ...form, contract_type: e.target.value })}>
            {!(opts.contract_types || []).includes(form.contract_type) && form.contract_type &&
              <option value={form.contract_type}>{form.contract_type}</option>}
            {(opts.contract_types || []).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>

          <label>Service type</label>
          <input value={form.contract_service} onChange={(e) => setForm({ ...form, contract_service: e.target.value })} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label>Start date (renewal)</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label>End date</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>

          <label>Any PHI shared?</label>
          <select value={form.phi_shared} onChange={(e) => setForm({ ...form, phi_shared: e.target.value })}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
          </select>

          <div className="toolbar" style={{ marginTop: 14 }}>
            <button onClick={submitRenew}>Submit renewal request</button>
            <button className="secondary" onClick={() => setMode(null)}>Back</button>
          </div>
        </div>
      )}
    </div>
  )
}
