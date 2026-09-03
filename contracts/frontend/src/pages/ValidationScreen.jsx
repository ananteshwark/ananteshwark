import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import ContractForm, { useMandatoryFields } from '../components/ContractForm'

const FORM_FIELDS = [
  'signing_entity', 'vendor_id', 'vendor_address', 'start_date', 'end_date',
  'contract_tenure', 'department_id', 'po_number', 'contract_value', 'savings_amount', 'currency',
  'iks_signing_authority', 'vendor_signing_authority', 'contract_service', 'service_summary',
  'payment_term', 'notice_period', 'line_items', 'contract_type', 'location', 'phi_shared',
  'custom_fields',
]

const COMPARE_FIELDS = [
  'vendor_name', 'signing_entity', 'po_number', 'contract_service',
  'start_date', 'end_date', 'contract_value', 'department_name',
]

export default function ValidationScreen() {
  const { srNo } = useParams()
  const navigate = useNavigate()
  const [contract, setContract] = useState(null)
  const [form, setForm] = useState({})
  const [departments, setDepartments] = useState([])
  const [types, setTypes] = useState([])
  const [signingEntities, setSigningEntities] = useState([])
  const [currencies, setCurrencies] = useState([])
  const [businessUnits, setBusinessUnits] = useState([])
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [duplicates, setDuplicates] = useState(null)
  const [rejecting, setRejecting] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [doc, setDoc] = useState(null)  // { url, contentType } — fetched with auth
  const [suggest, setSuggest] = useState(null)   // { history_count, suggestions: [...] }
  const [applied, setApplied] = useState([])      // field names applied this session
  const mandatory = useMandatoryFields()

  // The document endpoint requires auth, which an <iframe src> can't send, so
  // fetch it as an authenticated blob and preview the object URL instead.
  useEffect(() => {
    let objUrl = null
    api.blobUrl(`/contracts/${srNo}/file`)
      .then(({ url, contentType }) => { objUrl = url; setDoc({ url, contentType }) })
      .catch(() => setDoc(null))
    return () => { if (objUrl) URL.revokeObjectURL(objUrl) }
  }, [srNo])

  useEffect(() => {
    api.get('/departments').then(setDepartments).catch(() => {})
    api.get('/contracts/types').then((r) => setTypes(r.types)).catch(() => {})
    api.get('/internal-entities').then((r) => setSigningEntities((r || []).map((e) => e.name))).catch(() => {})
    api.get('/settings/master-lists').then((r) => {
      setCurrencies(r.currencies || [])
      setBusinessUnits(r.business_units || [])
    }).catch(() => {})
    api.get(`/contracts/${srNo}`).then((c) => {
      setContract(c)
      const f = {}
      FORM_FIELDS.forEach((k) => { f[k] = c[k] })
      setForm(f)
    }).catch((e) => setError(e.message))
    api.get(`/contracts/${srNo}/field-suggestions`).then(setSuggest).catch(() => {})
  }, [srNo])

  // Apply a learned suggestion into the editable form (the validator still saves).
  function applySuggestion(s) {
    setForm((f) => ({ ...f, [s.field]: s.suggested }))
    setApplied((a) => (a.includes(s.field) ? a : [...a, s.field]))
  }
  function applyAllSuggestions() {
    const pending = (suggest?.suggestions || []).filter((s) => !applied.includes(s.field))
    if (pending.length === 0) return
    setForm((f) => { const n = { ...f }; pending.forEach((s) => { n[s.field] = s.suggested }); return n })
    setApplied((a) => [...new Set([...a, ...pending.map((s) => s.field)])])
  }

  function applyAllDocSuggestions() {
    const pending = (suggest?.document_suggestions || []).filter((s) => !applied.includes(s.field))
    if (pending.length === 0) return
    setForm((f) => { const n = { ...f }; pending.forEach((s) => { n[s.field] = s.suggested }); return n })
    setApplied((a) => [...new Set([...a, ...pending.map((s) => s.field)])])
  }

  async function save(validate, force = false) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      if (validate) {
        const res = await api.post(`/contracts/${srNo}/validate`, { ...form, force })
        if (res.status === 'DUPLICATES_FOUND') {
          setContract(res.contract)
          setDuplicates(res.duplicates)
        } else {
          setMessage('Contract validated ✔')
          setDuplicates(null)
          setTimeout(() => navigate('/validation'), 900)
        }
      } else {
        const c = await api.put(`/contracts/${srNo}`, form)
        setContract(c)
        setMessage('Draft saved')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function reject() {
    setBusy(true)
    try {
      await api.post(`/contracts/${srNo}/reject`, { reason: rejectReason })
      navigate('/validation')
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  if (error && !contract) return <div className="error">{error}</div>
  if (!contract) return <p>Loading…</p>

  return (
    <div>
      <h2>Validate contract #{contract.sr_no} <span className="hint">completeness {contract.completeness}%</span></h2>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
      <div className="split">
        <div className="pane">
          {doc && doc.contentType.startsWith('image/') ? (
            <img className="doc-preview" alt="document" src={doc.url} style={{ objectFit: 'contain', background: '#f4f6f8' }} />
          ) : doc && doc.contentType.includes('pdf') ? (
            <iframe className="doc-preview" title="document" src={doc.url} />
          ) : doc ? (
            // Anything else is NOT rendered inline: the iframe is same-origin,
            // so an unexpected type (e.g. html) would execute in this origin.
            <div className="doc-preview" style={{ display: 'grid', placeItems: 'center', color: '#7a8794' }}>
              <span className="hint">No inline preview for this file type — use the download link.</span>
            </div>
          ) : (
            <div className="doc-preview" style={{ display: 'grid', placeItems: 'center', color: '#7a8794' }}>
              <span className="hint">Loading document preview…</span>
            </div>
          )}
          <p className="hint">Source: {contract.contract_link} · model {contract.extraction_model} · prompt v{contract.prompt_version}</p>
        </div>
        <div className="pane">
          <div className="card" style={{ maxHeight: '82vh', overflow: 'auto' }}>
            {suggest && suggest.suggestions.length > 0 && (
              <div className="card" style={{ background: '#f3f8ff', borderColor: '#bcd6f5', marginBottom: 12 }}>
                <div className="toolbar" style={{ margin: 0 }}>
                  <strong>Suggestions from this vendor's history</strong>
                  <span className="hint">
                    learned from {suggest.history_count} validated contract(s) for {suggest.vendor_name || 'this vendor'}
                  </span>
                  <span className="spacer" />
                  <button type="button" className="secondary"
                    disabled={suggest.suggestions.every((s) => applied.includes(s.field))}
                    onClick={applyAllSuggestions}>Apply all</button>
                </div>
                <table className="grid" style={{ marginTop: 8 }}>
                  <thead>
                    <tr><th>Field</th><th>Current</th><th>Suggested (from history)</th><th>Agreement</th><th /></tr>
                  </thead>
                  <tbody>
                    {suggest.suggestions.map((s) => {
                      const shown = s.field === 'department_id' ? (s.suggested_label ?? s.suggested) : s.suggested
                      const cur = s.current_empty ? '—' : (s.field === 'department_id' ? s.current : s.current)
                      return (
                        <tr key={s.field}>
                          <td>{s.label}</td>
                          <td>{s.current_empty ? <span className="hint">empty</span> : String(cur)}</td>
                          <td><strong>{String(shown)}</strong></td>
                          <td><span className="hint">{Math.round(s.confidence * 100)}% ({s.support}/{s.total})</span></td>
                          <td>
                            {applied.includes(s.field)
                              ? <span className="badge VALIDATED">applied</span>
                              : <button type="button" className="secondary" onClick={() => applySuggestion(s)}>Apply</button>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <p className="hint" style={{ margin: '6px 0 0' }}>
                  Applying only fills the form — review and Save/Validate to commit. Blank fields may already have been auto-filled from history.
                </p>
              </div>
            )}
            {suggest && (suggest.document_suggestions || []).length > 0 && (
              <div className="card" style={{ background: 'var(--derived-bg)', borderColor: 'var(--derived-border)', marginBottom: 12 }}>
                <div className="toolbar" style={{ margin: 0 }}>
                  <strong>Read from this document</strong>
                  <span className="hint">values found in the contract text — check the quote before applying</span>
                  <span className="spacer" />
                  <button type="button" className="secondary"
                    disabled={suggest.document_suggestions.every((s) => applied.includes(s.field))}
                    onClick={applyAllDocSuggestions}>Apply all</button>
                </div>
                <table className="grid" style={{ marginTop: 8 }}>
                  <thead>
                    <tr><th>Field</th><th>Current</th><th>Found in document</th><th>Where it says so</th><th /></tr>
                  </thead>
                  <tbody>
                    {suggest.document_suggestions.map((s) => (
                      <tr key={`doc-${s.field}`}>
                        <td>{s.label}</td>
                        <td>{s.current_empty ? <span className="hint">empty</span> : String(s.current)}</td>
                        <td><strong>{String(s.suggested)}</strong></td>
                        <td className="hint" style={{ maxWidth: 320 }}>“{s.evidence}”</td>
                        <td>
                          {applied.includes(s.field)
                            ? <span className="badge VALIDATED">applied</span>
                            : <button type="button" className="secondary" onClick={() => applySuggestion(s)}>Apply</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <ContractForm mandatory={mandatory} contract={contract} form={form} setForm={setForm} departments={departments} types={types}
              signingEntities={signingEntities} currencies={currencies} businessUnits={businessUnits}
              onSuggestDepartment={() => api.get(`/contracts/${srNo}/suggest-department`)} />
            <div className="toolbar" style={{ marginTop: 16 }}>
              <button disabled={busy} onClick={() => save(true)}>Save &amp; Validate</button>
              <button disabled={busy} className="secondary" onClick={() => save(false)}>Save draft</button>
              <span className="spacer" />
              <button disabled={busy} className="danger" onClick={() => setRejecting(true)}>Reject</button>
            </div>
          </div>
        </div>
      </div>

      {duplicates && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Potential duplicates found</h3>
            <p>Review before final save. These candidates were logged for the Duplicate Review screen.</p>
            {duplicates.map((d) => (
              <div className="card" key={d.candidate_id}>
                <p><strong>#{d.matched_contract.sr_no}</strong> — {d.reason} (score {d.score.toFixed(0)})</p>
                <div className="compare">
                  <div className="head">Field</div><div className="head">This contract</div><div className="head">Existing #{d.matched_contract.sr_no}</div>
                  {COMPARE_FIELDS.map((f) => {
                    const a = contract[f] ?? form[f] ?? '—'
                    const b = d.matched_contract[f] ?? '—'
                    const diff = String(a) !== String(b)
                    return (
                      <FragmentRow key={f} field={f} a={a} b={b} diff={diff} />
                    )
                  })}
                </div>
              </div>
            ))}
            <div className="toolbar">
              <button disabled={busy} onClick={() => save(true, true)}>Validate anyway</button>
              <button className="secondary" onClick={() => setDuplicates(null)}>Back to editing</button>
            </div>
          </div>
        </div>
      )}

      {rejecting && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 480 }}>
            <h3>Reject contract</h3>
            <label>Reason (e.g. not a contract)</label>
            <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button disabled={!rejectReason || busy} className="danger" onClick={reject}>Reject &amp; archive</button>
              <button className="secondary" onClick={() => setRejecting(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FragmentRow({ field, a, b, diff }) {
  return (
    <>
      <div>{field}</div>
      <div className={diff ? 'diff' : ''}>{String(a)}</div>
      <div className={diff ? 'diff' : ''}>{String(b)}</div>
    </>
  )
}
