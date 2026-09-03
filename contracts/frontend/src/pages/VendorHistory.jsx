import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'

const DOC_TYPES = ['insurance', 'w9', 'nda', 'dpa', 'certification', 'license', 'other']
const STATUS_BADGE = { valid: 'VALIDATED', expiring: 'warn', expired: 'REJECTED', none: '' }

function ComplianceVault({ vendorId, vendor }) {
  const [docs, setDocs] = useState([])
  const [form, setForm] = useState({ doc_type: 'insurance', name: '', reference: '', issued_date: '', expiry_date: '' })
  const [risk, setRisk] = useState({ risk_rating: vendor.risk_rating || '', risk_notes: vendor.risk_notes || '' })
  const [error, setError] = useState(null)

  const load = () => api.get(`/compliance?vendor_id=${vendorId}`).then((r) => setDocs(r.documents)).catch(() => {})
  useEffect(() => { load() }, [vendorId])

  async function add() {
    if (!form.name.trim()) return
    setError(null)
    try {
      await api.post('/compliance', {
        vendor_id: Number(vendorId), doc_type: form.doc_type, name: form.name.trim(),
        reference: form.reference || null, issued_date: form.issued_date || null, expiry_date: form.expiry_date || null,
      })
      setForm({ doc_type: 'insurance', name: '', reference: '', issued_date: '', expiry_date: '' }); load()
    } catch (e) { setError(e.message) }
  }
  async function remove(id) {
    try { await api.del(`/compliance/${id}`); load() } catch (e) { setError(e.message) }
  }
  async function upload(id, fileInput) {
    const file = fileInput.files[0]; if (!file) return
    try { const fd = new FormData(); fd.append('file', file); await api.post(`/compliance/${id}/file`, fd); load() }
    catch (e) { setError(e.message) } finally { fileInput.value = '' }
  }
  async function saveRisk() {
    try { await api.put(`/compliance/vendors/${vendorId}/risk`, { risk_rating: risk.risk_rating || null, risk_notes: risk.risk_notes || null }) }
    catch (e) { setError(e.message) }
  }

  return (
    <div className="card">
      <h3>Compliance vault <span className="hint">— documents, expiry &amp; risk profile</span></h3>
      {error && <div className="error">{error}</div>}

      <div className="toolbar" style={{ margin: '0 0 10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ margin: 0 }}>Risk rating:</label>
        <select value={risk.risk_rating} onChange={(e) => setRisk({ ...risk, risk_rating: e.target.value })}>
          <option value="">— not set —</option><option value="low">Low</option>
          <option value="medium">Medium</option><option value="high">High</option>
        </select>
        <input placeholder="Risk notes" value={risk.risk_notes} onChange={(e) => setRisk({ ...risk, risk_notes: e.target.value })} style={{ flex: 1, minWidth: 160 }} />
        <button className="secondary" onClick={saveRisk}>Save risk</button>
      </div>

      {docs.length > 0 && (
        <table className="grid">
          <thead><tr><th>Type</th><th>Name</th><th>Reference</th><th>Expiry</th><th>Status</th><th>File</th><th></th></tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td>{d.doc_type}</td>
                <td>{d.name}</td>
                <td className="hint">{d.reference || '—'}</td>
                <td>{d.expiry_date || '—'}</td>
                <td><span className={`badge ${STATUS_BADGE[d.status] || ''}`}>{d.status}</span></td>
                <td>
                  {d.has_file
                    ? <button className="secondary" onClick={() => api.download(`/compliance/${d.id}/file`, d.filename)}>{d.filename}</button>
                    : <label className="linklike" style={{ cursor: 'pointer' }}>upload<input type="file" style={{ display: 'none' }} onChange={(e) => upload(d.id, e.target)} /></label>}
                </td>
                <td><button className="danger" onClick={() => remove(d.id)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="toolbar" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <select value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value })}>
          {DOC_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input placeholder="Document name…" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} style={{ maxWidth: 120 }} />
        <input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} title="Expiry date" />
        <button disabled={!form.name.trim()} onClick={add}>Add document</button>
      </div>
    </div>
  )
}

export default function VendorHistory() {
  const { vendorId } = useParams()
  const [data, setData] = useState(null)
  const [insights, setInsights] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get(`/vendors/${vendorId}/history`).then(setData).catch((e) => setError(e.message))
    api.get(`/authoring/vendors/${vendorId}/insights`).then(setInsights).catch(() => {})
  }, [vendorId])

  if (error) return <div className="error">{error}</div>
  if (!data) return <p>Loading…</p>

  const { vendor, contracts, totals_per_year, line_item_rate_history, renewal_chains, audit } = data

  const rateHistory = line_item_rate_history || []
  const rateYears = [...new Set(rateHistory.flatMap((h) => Object.keys(h.rates_by_year)))].sort()
  const fmt = (n) => (n != null ? n.toLocaleString('en-IN') : '—')
  const pctClass = (p) => (p == null ? '' : p > 0 ? 'REJECTED' : p < 0 ? 'VALIDATED' : '')

  const statusLabel = (c) =>
    c.display_status.startsWith('EXPIRING_IN')
      ? `Expiring in ${c.days_to_expiry} days`
      : c.display_status

  return (
    <div>
      <h2>{vendor.name}
        {vendor.risk_rating && <span className={`badge ${vendor.risk_rating === 'high' ? 'REJECTED' : vendor.risk_rating === 'medium' ? 'warn' : 'VALIDATED'}`} style={{ marginLeft: 8 }} title={vendor.risk_notes || ''}>risk: {vendor.risk_rating}</span>}
      </h2>
      <div className="toolbar">
        <span className="hint">Aliases: {vendor.aliases.join(', ') || '—'} · Addresses: {(vendor.addresses || []).join('; ') || '—'}</span>
        <span className="spacer" />
        <button onClick={() => api.download(`/vendors/${vendor.id}/export`, `vendor_${vendor.id}_history.xlsx`)}>
          Export to Excel (register format)
        </button>
      </div>

      <ComplianceVault vendorId={vendorId} vendor={vendor} />

      {insights && insights.total_changes > 0 && (
        <div className="card">
          <h3>Negotiation insights <span className="hint">— {insights.total_changes} tracked change(s) across this vendor's drafts</span></h3>
          <table className="grid">
            <thead><tr><th>Clause type</th><th>Challenged</th><th>Accepted</th><th>Rejected</th></tr></thead>
            <tbody>
              {insights.by_clause.map((r) => (
                <tr key={r.clause_type}>
                  <td>{r.clause_type}</td><td>{r.challenged}</td><td>{r.accepted}</td><td>{r.rejected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>Contract chronology ({contracts.length})</h3>
        <table className="grid">
          <thead>
            <tr><th>#</th><th>Service</th><th>Department</th><th>PO</th><th>Start</th><th>End</th>
              <th>Value</th><th>Status</th><th>Thread</th></tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.sr_no}>
                <td><Link to={`/contracts/${c.sr_no}`}>{c.sr_no}</Link></td>
                <td>{c.contract_service}</td>
                <td>{c.department_name || '—'}</td>
                <td>{c.po_number || '—'}</td>
                <td>{c.start_date}</td>
                <td>{c.end_date}</td>
                <td>{c.contract_value != null ? `${c.currency} ${c.contract_value.toLocaleString('en-IN')}` : '—'}</td>
                <td><span className={`badge ${c.display_status.startsWith('EXPIRING') ? 'warn' : c.display_status}`}>{statusLabel(c)}</span></td>
                <td>{c.thread_id || c.sr_no}{c.renews_contract_id ? ` (renews #${c.renews_contract_id})` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="split">
        <div className="pane card">
          <h3>Contract value totals per year</h3>
          <table className="grid">
            <thead><tr><th>Year</th><th>Total value</th></tr></thead>
            <tbody>
              {Object.entries(totals_per_year).sort().map(([year, total]) => (
                <tr key={year}><td>{year}</td><td>{total.toLocaleString('en-IN')}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pane card">
          <h3>Renewal chains</h3>
          {renewal_chains.map((chain, i) => (
            <p key={i}>
              {chain.map((sr, j) => (
                <span key={sr}>
                  {j > 0 && ' → '}
                  <Link to={`/contracts/${sr}`}>#{sr}</Link>
                </span>
              ))}
            </p>
          ))}
        </div>
      </div>

      {rateHistory.length > 0 && (
        <div className="card">
          <h3>Unit rate changes year on year</h3>
          <p className="hint">
            Line items matched by name across this vendor&apos;s contracts, by contract start year.
            ▲ marks an increase vs the previous year with data, ▼ a decrease.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>Item</th><th>Unit</th>
                  {rateYears.map((y) => <th key={y}>{y}</th>)}
                  <th>Latest change</th>
                </tr>
              </thead>
              <tbody>
                {rateHistory.map((h, i) => (
                  <tr key={i}>
                    <td>{h.item || '—'}</td>
                    <td>{h.unit || '—'}</td>
                    {rateYears.map((y) => <td key={y}>{fmt(h.rates_by_year[y])}</td>)}
                    <td>
                      {h.latest_pct_change == null ? '—' : (
                        <span className={`badge ${pctClass(h.latest_pct_change)}`}>
                          {h.latest_pct_change > 0 ? '▲ ' : h.latest_pct_change < 0 ? '▼ ' : ''}
                          {Math.abs(h.latest_pct_change)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Audit history</h3>
        <table className="grid">
          <thead><tr><th>When</th><th>Entity</th><th>Action</th><th>Field</th><th>Old → New</th><th>Who</th></tr></thead>
          <tbody>
            {audit.map((a, i) => (
              <tr key={i}>
                <td>{new Date(a.created_at).toLocaleString()}</td>
                <td>{a.entity_type} #{a.entity_id}</td>
                <td>{a.action}</td>
                <td>{a.field || '—'}</td>
                <td>{a.field ? `${a.old_value ?? '∅'} → ${a.new_value ?? '∅'}` : a.new_value || '—'}</td>
                <td>{a.user || 'system'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
