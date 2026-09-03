import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { StartContractModal } from '../components/StartContractOptions'
import { promptDialog } from '../confirm'
import { useAuth } from '../auth'
import { endFromStartMonths, monthsFromTenure } from '../components/ContractForm'

const PRIORITY = ['low', 'normal', 'high']
const EMPTY = { title: '', counterparty_name: '', contract_type: '', department_id: '',
  description: '', estimated_value: '', currency: 'INR', needed_by: '', priority: 'normal',
  internal_entity: '', purpose: '', counterparty_address: '', spoc_name: '',
  phi_shared: '', start_date: '', end_date: '', tenure: '' }

// Tenure options offered on intake. The end date is derived from start + tenure
// by the same rule the register uses, so the request and the contract it becomes
// do not disagree about when it ends.
const TENURES = ['6 Months', '1 Year', '2 Years', '3 Years', '5 Years']

function StatusBadge({ s }) {
  const cls = s === 'CONVERTED' ? 'VALIDATED' : s === 'REJECTED' ? 'REJECTED'
    : s === 'IN_REVIEW' ? 'warn' : 'PENDING_VALIDATION'
  return <span className={`badge ${cls}`}>{s.replace('_', ' ').toLowerCase()}</span>
}

export default function ContractRequests() {
  const navigate = useNavigate()
  const [data, setData] = useState({ requests: [], can_triage: false })
  const [departments, setDepartments] = useState([])
  const [types, setTypes] = useState([])
  const [statusFilter, setStatusFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [entities, setEntities] = useState([])
  const [templateFile, setTemplateFile] = useState(null)
  const { user } = useAuth()
  const [nlText, setNlText] = useState('')
  const [interpreting, setInterpreting] = useState(false)
  const [hint, setHint] = useState(null)
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(null)   // four-option chooser

  // H3: read a plain-language ask into the form. Nothing is submitted — the
  // requester reviews and corrects every field first.
  async function interpret() {
    if (!nlText.trim()) return
    setInterpreting(true); setHint(null)
    try {
      const r = await api.post('/requests/interpret', { text: nlText.trim() })
      const f = r.fields || {}
      setForm((cur) => ({
        ...cur,
        title: f.title || cur.title,
        contract_type: f.contract_type || cur.contract_type,
        counterparty_name: f.counterparty_name || cur.counterparty_name,
        estimated_value: f.estimated_value != null ? String(f.estimated_value) : cur.estimated_value,
        currency: f.currency || cur.currency,
        needed_by: f.needed_by || cur.needed_by,
        priority: f.priority || cur.priority,
        description: f.description || cur.description,
      }))
      setHint(r.understood
        ? `Filled what I could${r.template ? ` · suggested template: ${r.template.name}` : ''} — please check each field.`
        : 'I couldn’t identify a contract type or counterparty — please fill the form manually.')
    } catch (e) { setHint(e.message) }
    finally { setInterpreting(false) }
  }
  const [message, setMessage] = useState(null)

  const load = useCallback(() => {
    api.get(`/requests${statusFilter ? `?status=${statusFilter}` : ''}`).then(setData).catch((e) => setError(e.message))
  }, [statusFilter])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    api.get('/departments').then(setDepartments).catch(() => {})
    api.get('/internal-entities').then((r) => setEntities(r || [])).catch(() => {})
    api.get('/contracts/types').then((r) => setTypes(r.types || [])).catch(() => {})
  }, [])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  // Show the end date the term implies, before the request is submitted, using
  // the same rule the register applies (end dates are inclusive).
  const derivedEnd = form.end_date
    || endFromStartMonths(form.start_date, monthsFromTenure(form.tenure))
    || ''

  async function submit() {
    setError(null)
    try {
      const created = await api.post('/requests', {
        ...form,
        department_id: form.department_id ? Number(form.department_id) : null,
        estimated_value: form.estimated_value === '' ? null : Number(form.estimated_value),
        needed_by: form.needed_by || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        phi_shared: form.phi_shared === '' ? null : form.phi_shared === 'yes',
        // Blank means "me" — the server fills in the signed-in user.
        spoc_name: form.spoc_name || null,
      })
      // The document goes up after the request exists, so it has somewhere to live.
      if (templateFile && created?.id) {
        const fd = new FormData()
        fd.append('file', templateFile)
        try { await api.post(`/requests/${created.id}/template`, fd) }
        catch (e) { setError(`Request submitted, but the document did not attach: ${e.message}`) }
      }
      setCreating(false); setForm(EMPTY); setTemplateFile(null)
      setMessage('Request submitted.'); load()
    } catch (e) { setError(e.message) }
  }

  async function triage(id, patch) {
    setError(null)
    try { await api.patch(`/requests/${id}`, patch); load() } catch (e) { setError(e.message) }
  }
  async function reject(id) {
    const reason = await promptDialog('Reason for declining this request?',
      { title: 'Decline request', confirmLabel: 'Decline', danger: true, required: true })
    if (reason && reason.trim()) triage(id, { status: 'REJECTED', decision_reason: reason.trim() })
  }
  // Converting silently picked a template matching the contract type. The
  // requester's answers still pre-fill the draft whichever starting point the
  // author chooses — the choice is theirs now, not the type's.
  function convert(r) {
    setStarting({
      title: `Convert request: ${r.title}`,
      context: {
        contractType: r.contract_type || '',
        create: async (body) => {
          const origin = body.origin === 'scratch' ? 'scratch' : body.origin
          const p = new URLSearchParams({ origin })
          if (body.template_id) p.set('template_id', String(body.template_id))
          if (body.source_contract_id) p.set('source_contract_id', String(body.source_contract_id))
          const res = await api.post(`/requests/${r.id}/convert?${p}`)
          return { id: res.draft_id }
        },
        // An upload has to create the draft first, then be attached to the request.
        importDraft: async (file, { contractType, thirdParty }) => {
          const fd = new FormData()
          fd.append('file', file)
          const p = new URLSearchParams()
          if (contractType) p.set('contract_type', contractType)
          if (thirdParty) p.set('third_party', 'true')
          const draft = await api.post(`/authoring/drafts/import${p.toString() ? `?${p}` : ''}`, fd)
          await api.post(`/requests/${r.id}/link-draft?draft_id=${draft.id}`)
          return draft
        },
      },
    })
  }

  const canTriage = data.can_triage

  return (
    <div>
      <div className="toolbar" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Contract Requests</h2>
        <span className="spacer" />
        {canTriage && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="IN_REVIEW">In review</option>
            <option value="CONVERTED">Converted</option>
            <option value="REJECTED">Rejected</option>
          </select>
        )}
        <button onClick={() => { setForm(EMPTY); setCreating(true) }}>+ New request</button>
      </div>
      <p className="hint">
        {canTriage
          ? 'Triage incoming requests: assign, review, decline, or convert into an authoring draft.'
          : 'Request a new contract. Legal will review and start the draft; you can track status here.'}
      </p>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <table className="grid">
        <thead>
          <tr>
            <th>Title</th>{canTriage && <th>Requested by</th>}<th>Counterparty</th><th>Type</th>
            <th>Value</th><th>Needed by</th><th>Priority</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {data.requests.map((r) => (
            <tr key={r.id}>
              <td>{r.title}{r.description && <div className="hint">{r.description}</div>}</td>
              {canTriage && <td>{r.requested_by_name || '—'}</td>}
              <td>{r.counterparty_name || '—'}</td>
              <td>{r.contract_type || '—'}</td>
              <td>{r.estimated_value != null ? `${r.currency || ''} ${r.estimated_value.toLocaleString('en-IN')}` : '—'}</td>
              <td>{r.needed_by || '—'}</td>
              <td>{r.priority === 'high' ? <span className="badge warn">high</span> : r.priority}</td>
              <td><StatusBadge s={r.status} /></td>
              <td>
                <div className="toolbar" style={{ margin: 0 }}>
                  {r.draft_id && <button className="secondary" onClick={() => navigate(`/authoring/drafts/${r.draft_id}`)}>Open draft</button>}
                  {canTriage && r.status !== 'CONVERTED' && r.status !== 'REJECTED' && (
                    <>
                      {r.status === 'SUBMITTED' && <button className="secondary" onClick={() => triage(r.id, { status: 'IN_REVIEW' })}>Review</button>}
                      <button onClick={() => convert(r)}>Convert →</button>
                      <button className="danger" onClick={() => reject(r.id)}>Decline</button>
                    </>
                  )}
                </div>
                {r.status === 'REJECTED' && r.decision_reason && <div className="hint">Declined: {r.decision_reason}</div>}
                {/* What the requester told us, so triage does not have to ask again. */}
                <div className="hint" style={{ marginTop: 4 }}>
                  {r.internal_entity && <span>Entity: {r.internal_entity} · </span>}
                  {r.spoc_name && <span>SPOC: {r.spoc_name} · </span>}
                  {r.tenure && <span>Tenure: {r.tenure}{r.end_date ? ` (to ${r.end_date})` : ''} · </span>}
                  {r.phi_shared != null && <span>PHI: {r.phi_shared ? 'Yes' : 'No'} · </span>}
                  {r.template_filename && (
                    <button className="linklike" title="Download the counterparty template attached to this request"
                      onClick={() => api.download(`/requests/${r.id}/template`, r.template_filename)}>
                      📎 {r.template_filename}
                    </button>
                  )}
                </div>
                {r.purpose && <div className="hint">Purpose: {r.purpose}</div>}
              </td>
            </tr>
          ))}
          {data.requests.length === 0 && (
            <tr><td colSpan={canTriage ? 9 : 8} className="hint">No requests yet.</td></tr>
          )}
        </tbody>
      </table>

      {creating && (
        <div className="modal-backdrop" onClick={() => setCreating(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3>Request a contract</h3>

            {/* H3: describe it in a sentence and let the copilot fill the form. */}
            <div style={{ background: 'var(--surface-2, #f7fafc)', padding: 10, borderRadius: 6, marginBottom: 12 }}>
              <label style={{ marginTop: 0 }}>Describe it in your own words</label>
              <div className="toolbar" style={{ margin: 0 }}>
                <input placeholder="e.g. we urgently need an NDA with Globex Health before the pilot in March"
                  value={nlText} onChange={(e) => setNlText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); interpret() } }}
                  style={{ flex: 1 }} />
                <button type="button" className="secondary" disabled={!nlText.trim() || interpreting}
                  onClick={interpret}>{interpreting ? 'Reading…' : 'Fill the form'}</button>
              </div>
              {hint && <p className="hint" style={{ margin: '6px 0 0' }}>{hint}</p>}
            </div>

            <label>What do you need? *</label>
            <input value={form.title} onChange={set('title')} placeholder="e.g. NDA with Globex Corporation" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label>Counterparty</label><input value={form.counterparty_name} onChange={set('counterparty_name')} placeholder="Vendor / other party" /></div>
              <div><label>Contract type</label>
                <input list="req-types" value={form.contract_type} onChange={set('contract_type')} placeholder="e.g. NDA, MSA" />
                <datalist id="req-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
              </div>
              <div><label>Department</label>
                <select value={form.department_id} onChange={set('department_id')}>
                  <option value="">—</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div><label>Estimated value</label><input type="number" min="0" value={form.estimated_value} onChange={set('estimated_value')} /></div>
              <div><label>Needed by</label><input type="date" value={form.needed_by} onChange={set('needed_by')} /></div>
              <div><label>Priority</label>
                <select value={form.priority} onChange={set('priority')}>{PRIORITY.map((p) => <option key={p} value={p}>{p}</option>)}</select>
              </div>
              <div><label>Internal entity</label>
                <select value={form.internal_entity} onChange={set('internal_entity')}>
                  <option value="">— select —</option>
                  {entities.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
                </select>
              </div>
              <div><label>PHI shared</label>
                <select value={form.phi_shared} onChange={set('phi_shared')}>
                  <option value="">— not set —</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div><label>Start date</label>
                <input type="date" value={form.start_date} onChange={set('start_date')} />
              </div>
              <div><label>Tenure</label>
                <input list="req-tenures" value={form.tenure} onChange={set('tenure')} placeholder="e.g. 2 Years" />
                <datalist id="req-tenures">{TENURES.map((t) => <option key={t} value={t} />)}</datalist>
              </div>
              <div><label>End date</label>
                <input type="date" value={derivedEnd} onChange={set('end_date')} />
                {form.start_date && form.tenure && !form.end_date && (
                  <span className="hint derived">calculated from start date + tenure</span>
                )}
              </div>
              <div><label>User SPOC</label>
                <input value={form.spoc_name} onChange={set('spoc_name')}
                  placeholder={user?.name || user?.email || 'you'} />
                <span className="hint">defaults to you if left blank</span>
              </div>
            </div>
            <label>Purpose of engagement</label>
            <input value={form.purpose} onChange={set('purpose')}
              placeholder="What this contract is for" />
            <label>Counterparty registered address</label>
            <textarea rows={3} value={form.counterparty_address} onChange={set('counterparty_address')}
              placeholder="Registered office address as it should appear on the contract" />
            <label>Counterparty template <span className="hint">— if they have given you their paper</span></label>
            <div className="toolbar" style={{ margin: 0 }}>
              <label className="btn secondary" style={{ margin: 0, cursor: 'pointer' }}>
                {templateFile ? 'Choose a different file…' : '⬆ Attach Word/PDF…'}
                <input type="file" accept=".pdf,.docx" style={{ display: 'none' }}
                  onChange={(e) => setTemplateFile(e.target.files[0] || null)} />
              </label>
              {templateFile && (
                <span className="hint">
                  {templateFile.name}{' '}
                  <button type="button" className="linklike" onClick={() => setTemplateFile(null)}>remove</button>
                </span>
              )}
            </div>
            <label>Details / context</label>
            <textarea rows={3} value={form.description} onChange={set('description')} placeholder="Key terms, background, urgency…" />
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button disabled={!form.title.trim()} onClick={submit}>Submit request</button>
              <button className="secondary" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {starting && (
        <StartContractModal
          title={starting.title}
          context={starting.context}
          onClose={() => setStarting(null)}
          onCreated={(d) => { setStarting(null); navigate(`/authoring/drafts/${d.id}`) }}
        />
      )}
    </div>
  )
}
