import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

// The four ways to start a contract, in one place.
//
// They lived only on the New contract page, so every other button that creates a
// contract quietly picked one for you: Renew always duplicated, Convert always
// took a template matching the type, and + New contract went to the manual
// register form. The author was never asked. This component is that question,
// wherever it needs to be asked, pre-seeded with whatever the caller knows.
//
// `onCreated(draft)` fires once a draft exists. `context` may carry:
//   sourceContract  { sr_no, vendor_name }  — pre-selects "duplicate"
//   linkAs          'renewal' | 'amendment' — how to link that duplicate
//   contractType    string                  — pre-fills the type
//   create          async ({origin, ...}) => draft   — override the call, so a
//                                                     request can convert itself
//   importDraft     async (file) => draft   — override the upload
export default function StartContractOptions({ context = {}, onCreated, onError, compact = false }) {
  const [types, setTypes] = useState([])
  const [templates, setTemplates] = useState([])
  const [scratchType, setScratchType] = useState(context.contractType || 'MSA')
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [picked, setPicked] = useState(context.sourceContract || null)
  const [linkAs, setLinkAs] = useState(context.linkAs || '')
  const [importType, setImportType] = useState(context.contractType || '')
  const [importThirdParty, setImportThirdParty] = useState(false)
  const [importing, setImporting] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.get('/contracts/types').then((r) => setTypes(r.types)).catch(() => {})
    api.get('/authoring/templates').then(setTemplates).catch(() => {})
  }, [])

  useEffect(() => {
    if (!q) { setResults([]); return }
    const t = setTimeout(() => {
      api.get(`/contracts?q=${encodeURIComponent(q)}&limit=10`).then((r) => setResults(r.items)).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  async function create(body) {
    setBusy(true)
    try {
      const draft = context.create
        ? await context.create(body)
        : await api.post('/authoring/drafts', body)
      onCreated(draft)
    } catch (e) { onError?.(e.message) }
    finally { setBusy(false) }
  }

  async function importDoc(input) {
    const file = input.files[0]
    if (!file) return
    setImporting(true)
    try {
      let draft
      if (context.importDraft) {
        draft = await context.importDraft(file, { contractType: importType, thirdParty: importThirdParty })
      } else {
        const fd = new FormData()
        fd.append('file', file)
        const p = new URLSearchParams()
        if (importType) p.set('contract_type', importType)
        if (importThirdParty) p.set('third_party', 'true')
        draft = await api.post(`/authoring/drafts/import${p.toString() ? `?${p}` : ''}`, fd)
      }
      onCreated(draft)
    } catch (e) { onError?.(e.message); setImporting(false) }
    finally { input.value = '' }
  }

  const typeList = ['MSA', 'SOW', 'NDA', 'Service Agreement', 'Purchase Agreement', 'Amendment', 'Renewal', ...types]
    .filter((v, i, a) => a.indexOf(v) === i)

  return (
    <div className={compact ? '' : 'split-wrap'}>
      <datalist id="start-types">{typeList.map((t) => <option key={t} value={t} />)}</datalist>

      <div className="split">
        <div className="pane card">
          <h3>① From scratch</h3>
          <p className="hint">A standard section skeleton for the chosen type.</p>
          <label>Contract type</label>
          <input list="start-types" value={scratchType} onChange={(e) => setScratchType(e.target.value)}
            placeholder="MSA, SOW, NDA…" />
          <div style={{ marginTop: 10 }}>
            <button disabled={busy} onClick={() => create({ origin: 'scratch', contract_type: scratchType })}>
              Start blank draft
            </button>
          </div>
        </div>

        <div className="pane card">
          <h3>③ From a template</h3>
          <p className="hint">
            Reusable skeletons with placeholders and default clauses.{' '}
            <Link to="/authoring/templates">Manage templates →</Link>
          </p>
          {templates.length === 0 && <p className="hint">No templates yet.</p>}
          <table className="grid">
            <tbody>
              {templates.map((t) => (
                <tr key={t.id}>
                  <td>{t.name} <span className="hint">v{t.version}{t.contract_type ? ` · ${t.contract_type}` : ''}</span></td>
                  <td style={{ width: 90 }}>
                    <button className="secondary" disabled={busy}
                      onClick={() => create({ origin: 'template', template_id: t.id })}>Use</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>② Duplicate an existing contract</h3>
        <p className="hint">
          Clones the body and register fields. Instance values (dates, PO, value, signatures) are cleared.
          For the same vendor you can link it as a renewal or amendment.
        </p>
        {picked ? (
          <div className="card" style={{ background: 'var(--derived-bg)' }}>
            <strong>#{picked.sr_no} — {picked.vendor_name || picked.signing_entity || 'contract'}</strong>
            {' '}<button className="linklike" onClick={() => setPicked(null)}>change</button>
            <div className="toolbar" style={{ marginTop: 8 }}>
              <label style={{ margin: 0 }}>Link as:</label>
              <select value={linkAs} onChange={(e) => setLinkAs(e.target.value)}>
                <option value="">Standalone copy</option>
                <option value="renewal">Renewal (join renewal chain)</option>
                <option value="amendment">Amendment (join renewal chain)</option>
              </select>
              <button disabled={busy}
                onClick={() => create({ origin: 'duplicate', source_contract_id: picked.sr_no, link_as: linkAs || null })}>
                Duplicate into draft
              </button>
            </div>
          </div>
        ) : (
          <>
            <input placeholder="Search vendor / PO / service…" value={q} onChange={(e) => setQ(e.target.value)} />
            {results.length > 0 && (
              <table className="grid" style={{ marginTop: 8 }}>
                <thead><tr><th>#</th><th>Counterparty</th><th>Service</th><th>Type</th><th /></tr></thead>
                <tbody>
                  {results.map((c) => (
                    <tr key={c.sr_no}>
                      <td>{c.sr_no}</td><td>{c.vendor_name}</td><td>{c.contract_service}</td><td>{c.contract_type || '—'}</td>
                      <td><button className="secondary" onClick={() => setPicked(c)}>Select</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3>④ Import a Word or PDF document</h3>
        <p className="hint">
          Upload an existing contract (.docx or .pdf); its text becomes an editable draft. Tick
          “counterparty paper” to review it against the clause library and playbook.
        </p>
        <div className="toolbar" style={{ margin: 0, flexWrap: 'wrap' }}>
          <label style={{ margin: 0 }}>Contract type (optional):</label>
          <input list="start-types" value={importType} onChange={(e) => setImportType(e.target.value)}
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
    </div>
  )
}

// The same four options in a dialog, for the buttons that used to decide for you.
export function StartContractModal({ title = 'Start a contract', context, onClose, onCreated }) {
  const [error, setError] = useState(null)
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}
        onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, maxHeight: '88vh', overflow: 'auto' }}>
        <div className="toolbar" style={{ marginTop: 0 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <span className="spacer" />
          <button className="secondary" onClick={onClose}>Close</button>
        </div>
        {error && <div className="error">{error}</div>}
        <StartContractOptions context={context} compact onError={setError} onCreated={onCreated} />
      </div>
    </div>
  )
}
