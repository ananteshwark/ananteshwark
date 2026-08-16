import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'

export default function NewContract() {
  const navigate = useNavigate()
  const [types, setTypes] = useState([])
  const [templates, setTemplates] = useState([])
  const [error, setError] = useState(null)

  // From scratch
  const [scratchType, setScratchType] = useState('MSA')
  // Duplicate
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [picked, setPicked] = useState(null)
  const [linkAs, setLinkAs] = useState('')
  const [deleted, setDeleted] = useState([])
  // Import
  const [importType, setImportType] = useState('')
  const [importThirdParty, setImportThirdParty] = useState(false)
  const [importing, setImporting] = useState(false)

  const loadDeleted = () => api.get('/authoring/drafts/deleted').then(setDeleted).catch(() => {})
  useEffect(() => {
    api.get('/contracts/types').then((r) => setTypes(r.types)).catch(() => {})
    api.get('/authoring/templates').then(setTemplates).catch(() => {})
    loadDeleted()
  }, [])

  async function restoreDraft(id) {
    try { await api.post(`/authoring/drafts/${id}/restore-deleted`); navigate(`/authoring/drafts/${id}`) }
    catch (e) { setError(e.message) }
  }

  useEffect(() => {
    if (!q) { setResults([]); return }
    const t = setTimeout(() => {
      api.get(`/contracts?q=${encodeURIComponent(q)}&limit=10`).then((r) => setResults(r.items)).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  async function create(body) {
    setError(null)
    try {
      const d = await api.post('/authoring/drafts', body)
      navigate(`/authoring/drafts/${d.id}`)
    } catch (e) { setError(e.message) }
  }

  async function importDoc(fileInput) {
    const file = fileInput.files[0]
    if (!file) return
    setError(null)
    setImporting(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const p = new URLSearchParams()
      if (importType) p.set('contract_type', importType)
      if (importThirdParty) p.set('third_party', 'true')
      const qs = p.toString() ? `?${p}` : ''
      const d = await api.post(`/authoring/drafts/import${qs}`, fd)
      navigate(`/authoring/drafts/${d.id}`)
    } catch (e) { setError(e.message); setImporting(false) }
    finally { fileInput.value = '' }
  }

  return (
    <div>
      <h2>New contract</h2>
      <p className="hint">Author a contract in-app. Pick a starting point — all three land in the same workspace.</p>
      {error && <div className="error">{error}</div>}

      <div className="split">
        <div className="pane card">
          <h3>① From scratch</h3>
          <p className="hint">Start with a standard section skeleton for the chosen type.</p>
          <label>Contract type</label>
          <input list="new-types" value={scratchType} onChange={(e) => setScratchType(e.target.value)} placeholder="MSA, SOW, NDA…" />
          <datalist id="new-types">
            {['MSA', 'SOW', 'NDA', 'Service Agreement', 'Purchase Agreement', 'Amendment', 'Renewal', ...types]
              .filter((v, i, a) => a.indexOf(v) === i).map((t) => <option key={t} value={t} />)}
          </datalist>
          <div style={{ marginTop: 10 }}>
            <button onClick={() => create({ origin: 'scratch', contract_type: scratchType })}>Start blank draft</button>
          </div>
        </div>

        <div className="pane card">
          <h3>③ From a template</h3>
          <p className="hint">Reusable skeletons with placeholders and default clauses. <Link to="/authoring/templates">Manage templates →</Link></p>
          {templates.length === 0 && <p className="hint">No templates yet.</p>}
          <table className="grid">
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td>{t.name} <span className="hint">v{t.version}{t.contract_type ? ` · ${t.contract_type}` : ''}</span></td>
                  <td style={{ width: 90 }}><button className="secondary" onClick={() => create({ origin: 'template', template_id: t.id })}>Use</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>② Duplicate an existing contract</h3>
        <p className="hint">Clone the body and register fields into a new draft. Instance values (dates, PO, value, signatures) are cleared. For the same vendor you can link it as a renewal/amendment.</p>
        <input placeholder="Search vendor / PO / service…" value={q} onChange={(e) => setQ(e.target.value)} />
        {results.length > 0 && (
          <table className="grid" style={{ marginTop: 8 }}>
            <thead><tr><th>#</th><th>Vendor</th><th>Service</th><th>Type</th><th /></tr></thead>
            <tbody>
              {results.map((c) => (
                <tr key={c.sr_no} className={picked?.sr_no === c.sr_no ? 'row-selected' : ''}>
                  <td>{c.sr_no}</td><td>{c.vendor_name}</td><td>{c.contract_service}</td><td>{c.contract_type || '—'}</td>
                  <td><button className="secondary" onClick={() => setPicked(c)}>Select</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {picked && (
          <div className="card" style={{ marginTop: 10, background: '#f3f8ff' }}>
            <strong>#{picked.sr_no} — {picked.vendor_name}</strong>
            <div className="toolbar" style={{ marginTop: 8 }}>
              <label style={{ margin: 0 }}>Link as:</label>
              <select value={linkAs} onChange={(e) => setLinkAs(e.target.value)}>
                <option value="">Standalone copy</option>
                <option value="renewal">Renewal (join renewal chain)</option>
                <option value="amendment">Amendment (join renewal chain)</option>
              </select>
              <button onClick={() => create({ origin: 'duplicate', source_contract_id: picked.sr_no, link_as: linkAs || null })}>
                Duplicate into draft
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>④ Import a Word or PDF document</h3>
        <p className="hint">Upload an existing contract (.docx or .pdf). We extract its text into an editable draft so you can continue authoring in the workspace. Tick “counterparty paper” to review it against the clause library and playbook.</p>
        <div className="toolbar" style={{ margin: 0, flexWrap: 'wrap' }}>
          <label style={{ margin: 0 }}>Contract type (optional):</label>
          <input list="new-types" value={importType} onChange={(e) => setImportType(e.target.value)}
            placeholder="MSA, SOW, NDA…" style={{ maxWidth: 200 }} />
          <label style={{ margin: 0, display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 400 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={importThirdParty}
              onChange={(e) => setImportThirdParty(e.target.checked)} /> counterparty paper
          </label>
          <label className="btn" style={{ cursor: importing ? 'wait' : 'pointer', margin: 0 }}>
            {importing ? 'Importing…' : '⬆ Choose Word/PDF…'}
            <input type="file" accept=".pdf,.docx" style={{ display: 'none' }} disabled={importing}
              onChange={(e) => importDoc(e.target)} />
          </label>
        </div>
      </div>

      {deleted.length > 0 && (
        <div className="card">
          <h3>Recently deleted drafts <span className="hint">— restore</span></h3>
          <table className="grid">
            <tbody>
              {deleted.map((d) => (
                <tr key={d.id}>
                  <td>{d.title || `Draft #${d.id}`} <span className="hint">{d.contract_type || ''} · deleted {d.deleted_at ? new Date(d.deleted_at).toLocaleDateString() : ''}</span></td>
                  <td style={{ width: 90 }}><button className="secondary" onClick={() => restoreDraft(d.id)}>Restore</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
