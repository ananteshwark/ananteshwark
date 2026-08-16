import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { confirmDialog } from '../confirm'

// Split the document text into plain + highlighted segments for each flagged
// (not-in-the-company's-favour) clause. Overlapping ranges are skipped.
function highlightSegments(text, flagged) {
  const ranges = []
  for (const f of flagged || []) {
    const idx = (text || '').indexOf(f.text)
    if (idx >= 0) ranges.push({ start: idx, end: idx + f.text.length, reasons: f.reasons, clause_type: f.clause_type })
  }
  ranges.sort((a, b) => a.start - b.start)
  const segs = []
  let pos = 0
  for (const r of ranges) {
    if (r.start < pos) continue
    if (r.start > pos) segs.push({ text: text.slice(pos, r.start) })
    segs.push({ text: text.slice(r.start, r.end), flag: r })
    pos = r.end
  }
  if (pos < (text || '').length) segs.push({ text: text.slice(pos) })
  return segs
}

// Left pane: the contract document with risk-flagged sections highlighted inline;
// hovering a highlight shows the risk details. A toggle shows the original file.
function ContractDocument({ srNo, contractLink }) {
  const [data, setData] = useState(null)
  const [view, setView] = useState('risks')   // 'risks' | 'original'
  const [fileUrl, setFileUrl] = useState(null)
  const [tip, setTip] = useState(null)         // { reasons, clause_type, x, y }

  useEffect(() => {
    let alive = true
    api.get(`/contracts/${srNo}/clause-risk`).then((d) => { if (alive) setData(d) })
      .catch(() => { if (alive) setData({ text: '', flagged: [] }) })
    return () => { alive = false }
  }, [srNo])

  // Load the original file (with auth) only when the user switches to it.
  useEffect(() => {
    let url = null
    if (view === 'original' && contractLink && !fileUrl) {
      api.blobUrl(`/contracts/${srNo}/file`).then(({ url: u }) => { url = u; setFileUrl(u) }).catch(() => {})
    }
    return () => { if (url) URL.revokeObjectURL(url) }
  }, [view, contractLink, srNo, fileUrl])

  const flagged = data?.flagged || []
  const segs = data ? highlightSegments(data.text || '', flagged) : []
  const showTip = (e, f) => setTip({ reasons: f.reasons, clause_type: f.clause_type, x: e.clientX, y: e.clientY })

  return (
    <div>
      <div className="toolbar" style={{ marginTop: 0 }}>
        <h3 style={{ margin: 0 }}>Contract document</h3>
        <span className="spacer" />
        {flagged.length > 0 && <span className="badge REJECTED" title="Clauses not in the company's favour">⚠ {flagged.length} risk(s)</span>}
        <button className={`secondary${view === 'risks' ? ' active' : ''}`} style={{ padding: '2px 8px' }} onClick={() => setView('risks')}>Risks</button>
        {contractLink && <button className={`secondary${view === 'original' ? ' active' : ''}`} style={{ padding: '2px 8px' }} onClick={() => setView('original')}>Original file</button>}
      </div>

      {view === 'original' && contractLink && (
        fileUrl
          ? <iframe src={fileUrl} title="Original document" style={{ width: '100%', height: '70vh', border: '1px solid #dde3e9', borderRadius: 6 }} />
          : <p className="hint">Loading original file…</p>
      )}

      {view === 'risks' && (
        <>
          {!data && <p className="hint">Loading document…</p>}
          {data && !(data.text || '').trim() && <p className="hint">No extracted text for this contract{contractLink ? ' — use “Original file” to view the source document.' : '.'}</p>}
          {data && (data.text || '').trim() && (
            <div className="doc-render" onMouseLeave={() => setTip(null)}>
              {segs.map((s, i) => s.flag
                ? <mark key={i} className="risk-flag"
                        onMouseEnter={(e) => showTip(e, s.flag)} onMouseMove={(e) => showTip(e, s.flag)} onMouseLeave={() => setTip(null)}>{s.text}</mark>
                : <span key={i}>{s.text}</span>)}
            </div>
          )}
          {flagged.length > 0 && (
            <div className="card" style={{ background: '#fff6f4', marginTop: 10 }}>
              <strong>Clauses not in the company's favour ({flagged.length})</strong>
              <ul style={{ margin: '6px 0 0' }}>
                {flagged.map((f, i) => (<li key={i} className="hint"><b>{f.clause_type}</b>: {f.reasons.join('; ')}</li>))}
              </ul>
            </div>
          )}
        </>
      )}

      {tip && (
        <div className="risk-tip" style={{ left: Math.min(tip.x + 14, window.innerWidth - 320), top: tip.y + 16 }}>
          <strong>⚠ Not in the company's favour</strong>
          <div className="hint" style={{ color: '#ffd7cf', marginTop: 2 }}>{tip.clause_type}</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>{tip.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

// G5: interrogate the document you are reading, not just the whole repository.
function AskThisContract({ srNo }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function ask() {
    if (!q.trim()) return
    setBusy(true); setErr(null); setRes(null)
    try { setRes(await api.post(`/repo-ai/contracts/${srNo}/ask`, { question: q.trim() })) }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="card">
      <div className="toolbar" style={{ marginTop: 0 }}>
        <h3 style={{ margin: 0 }}>Ask this contract</h3>
        <span className="spacer" />
      </div>
      <div className="toolbar" style={{ margin: 0 }}>
        <input placeholder="e.g. what is the liability cap? can we terminate early?"
          value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask() }} style={{ flex: 1 }} />
        <button disabled={busy || !q.trim()} onClick={ask}>{busy ? 'Reading…' : 'Ask'}</button>
      </div>
      {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
      {res && (
        <div style={{ marginTop: 10 }}>
          {!res.ai && <span className="badge ARCHIVED">offline — showing matching passages</span>}
          {res.ai && !res.verified && <span className="badge REJECTED">⚠ unverified</span>}
          <div className="snippet" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{res.answer}</div>
          {(res.passages || []).map((p, i) => (
            <div key={i} className="snippet" style={{ marginTop: 6 }}>
              <span className="hint">match {Math.round(p.score * 100)}%</span>
              <div>{p.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ContractDetail() {
  const { srNo } = useParams()
  const navigate = useNavigate()
  const { canValidate, user, isAdmin, isSuperAdmin, isLegal } = useAuth()
  const [c, setC] = useState(null)
  const [audit, setAudit] = useState([])
  const [reminderLog, setReminderLog] = useState([])
  const [rules, setRules] = useState([])
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [recipients, setRecipients] = useState([])
  const [editingRecipients, setEditingRecipients] = useState(false)
  const [override, setOverride] = useState({ reminder_rule_id: '', custom_offsets: '', escalation_after: '', escalation_email: '' })
  const [attachments, setAttachments] = useState([])
  const [attachKind, setAttachKind] = useState('amendment')
  const [attachFile, setAttachFile] = useState(null)
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')
  const [schedule, setSchedule] = useState(null)
  const [allTypes, setAllTypes] = useState([])
  const [allTags, setAllTags] = useState([])
  const [typeDraft, setTypeDraft] = useState('')
  const [tagDraft, setTagDraft] = useState([])   // selected tag ids
  const [preview, setPreview] = useState(null)   // { name, url, kind } | 'loading'
  const [assignees, setAssignees] = useState([])
  const [thread, setThread] = useState(null)
  const [milestones, setMilestones] = useState([])
  const [newMs, setNewMs] = useState({ title: '', due_date: '' })
  const [payments, setPayments] = useState([])
  const [newPay, setNewPay] = useState({ description: '', amount: '', due_date: '', po_reference: '' })
  const [group, setGroup] = useState(null)
  const [linkSr, setLinkSr] = useState('')

  const load = useCallback(() => {
    api.get(`/contracts/${srNo}`).then((data) => {
      setC(data)
      setRecipients(data.recipients || [])
      setOverride({
        reminder_rule_id: data.reminder_rule_id || '',
        custom_offsets: (data.custom_offsets || []).join(', '),
        escalation_after: data.escalation_after != null ? String(data.escalation_after) : '',
        escalation_email: data.escalation_email || '',
      })
      setTypeDraft(data.contract_type || '')
      setTagDraft((data.tags || []).map((t) => t.id))
    }).catch((e) => setError(e.message))
    api.get(`/contracts/${srNo}/audit`).then(setAudit).catch(() => {})
    api.get(`/contracts/${srNo}/attachments`).then(setAttachments).catch(() => {})
    api.get(`/contracts/${srNo}/notes`).then(setNotes).catch(() => {})
    api.get(`/contracts/${srNo}/reminder-schedule`).then(setSchedule).catch(() => {})
    api.get(`/rules/reminder-log?contract_id=${srNo}`).then(setReminderLog).catch(() => {})
    api.get('/rules').then(setRules).catch(() => {})
    api.get('/contracts/types').then((r) => setAllTypes(r.types)).catch(() => {})
    api.get('/tags').then(setAllTags).catch(() => {})
    api.get('/auth/assignable-users').then(setAssignees).catch(() => {})
    api.get(`/contracts/${srNo}/thread`).then(setThread).catch(() => {})
    api.get(`/contracts/${srNo}/group`).then(setGroup).catch(() => {})
    api.get(`/contracts/${srNo}/milestones`).then(setMilestones).catch(() => {})
    api.get(`/payments?contract_id=${srNo}`).then((r) => setPayments(r.payments)).catch(() => {})
  }, [srNo])

  const loadPayments = () => api.get(`/payments?contract_id=${srNo}`).then((r) => setPayments(r.payments)).catch(() => {})
  async function addPayment() {
    if (!newPay.amount && !newPay.description.trim()) return
    setError(null)
    try {
      await api.post('/payments', {
        contract_id: Number(srNo), description: newPay.description.trim() || null,
        amount: newPay.amount ? Number(newPay.amount) : null,
        due_date: newPay.due_date || null, po_reference: newPay.po_reference.trim() || null,
      })
      setNewPay({ description: '', amount: '', due_date: '', po_reference: '' }); loadPayments()
    } catch (e) { setError(e.message) }
  }
  async function setPaymentStatus(p, status) {
    try { await api.patch(`/payments/${p.id}`, { status }); loadPayments() } catch (e) { setError(e.message) }
  }
  async function deletePayment(id) {
    try { await api.del(`/payments/${id}`); loadPayments() } catch (e) { setError(e.message) }
  }

  async function addMilestone() {
    if (!newMs.title.trim()) return
    setError(null)
    try {
      await api.post(`/contracts/${srNo}/milestones`, {
        title: newMs.title.trim(), due_date: newMs.due_date || null,
      })
      setNewMs({ title: '', due_date: '' })
      api.get(`/contracts/${srNo}/milestones`).then(setMilestones)
    } catch (e) { setError(e.message) }
  }

  async function extractObligations() {
    setError(null); setMessage('Extracting obligations…')
    try {
      const r = await api.post(`/contracts/${srNo}/obligations/extract`)
      setMessage(`Extracted ${r.created} obligation(s)${r.ai ? ' with AI' : ''}.`)
      api.get(`/contracts/${srNo}/milestones`).then(setMilestones)
    } catch (e) { setError(e.message); setMessage(null) }
  }

  async function toggleMilestone(m) {
    try {
      await api.patch(`/contracts/${srNo}/milestones/${m.id}`, { status: m.status === 'DONE' ? 'PENDING' : 'DONE' })
      api.get(`/contracts/${srNo}/milestones`).then(setMilestones)
    } catch (e) { setError(e.message) }
  }

  async function deleteMilestone(id) {
    try {
      await api.del(`/contracts/${srNo}/milestones/${id}`)
      api.get(`/contracts/${srNo}/milestones`).then(setMilestones)
    } catch (e) { setError(e.message) }
  }

  async function snooze(body) {
    setError(null)
    try {
      await api.post(`/contracts/${srNo}/snooze-reminders`, body)
      setMessage(body.days || body.until ? 'Reminders snoozed' : 'Snooze cleared')
      load()
    } catch (e) { setError(e.message) }
  }

  async function setAssignee(userId) {
    setError(null)
    try {
      await api.put(`/contracts/${srNo}/assignee`, { user_id: userId })
      setMessage('Assignee updated')
      load()
    } catch (e) { setError(e.message) }
  }

  function closePreview() {
    setPreview((p) => {
      if (p && p.url) URL.revokeObjectURL(p.url)
      return null
    })
  }

  async function openPreview(path, name) {
    closePreview()
    setPreview('loading')
    try {
      const { url, contentType } = await api.blobUrl(path)
      const lower = (name || '').toLowerCase()
      const kind = contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/.test(lower) ? 'image'
        : contentType.includes('pdf') || lower.endsWith('.pdf') ? 'pdf'
          : 'other'
      if (kind === 'other') {
        URL.revokeObjectURL(url)
        setPreview({ name, url: null, kind })
      } else {
        setPreview({ name, url, kind })
      }
    } catch (e) {
      setPreview(null)
      setError(e.message)
    }
  }

  // Revoke any object URL when leaving the page
  useEffect(() => () => { if (preview && preview.url) URL.revokeObjectURL(preview.url) }, [preview])

  async function saveCategorization() {
    setError(null)
    try {
      if ((c.contract_type || '') !== typeDraft) {
        await api.put(`/contracts/${srNo}`, { contract_type: typeDraft || null })
      }
      await api.put(`/contracts/${srNo}/tags`, { tag_ids: tagDraft })
      setMessage('Type and tags updated')
      load()
    } catch (e) { setError(e.message) }
  }

  async function addNote() {
    if (!newNote.trim()) return
    try {
      await api.post(`/contracts/${srNo}/notes`, { body: newNote.trim() })
      setNewNote('')
      load()
    } catch (e) { setError(e.message) }
  }

  async function deleteNote(id) {
    try {
      await api.del(`/contracts/${srNo}/notes/${id}`)
      load()
    } catch (e) { setError(e.message) }
  }

  async function uploadAttachment() {
    if (!attachFile) return
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', attachFile)
      const res = await fetch(`/api/contracts/${srNo}/attachments?kind=${attachKind}`, {
        method: 'POST', headers: api.authHeader(), body: fd,
      })
      if (!res.ok) throw new Error('Upload failed')
      setAttachFile(null)
      setMessage('Attachment added')
      load()
    } catch (e) { setError(e.message) }
  }

  async function deleteAttachment(id) {
    try {
      await api.del(`/contracts/${srNo}/attachments/${id}`)
      load()
    } catch (e) { setError(e.message) }
  }

  useEffect(load, [load])

  async function setLifecycle(status) {
    try {
      await api.post(`/contracts/${srNo}/lifecycle`, { status })
      setMessage(`Marked ${status}. Pending reminders ${status === 'RENEWED' || status === 'TERMINATED' ? 'stopped' : 'resumed'}.`)
      load()
    } catch (e) { setError(e.message) }
  }

  async function renew() {
    try {
      const draft = await api.post(`/contracts/${srNo}/renew`)
      navigate(`/validation/${draft.sr_no}`)
    } catch (e) { setError(e.message) }
  }

  async function deleteContract() {
    if (!await confirmDialog(`Delete contract #${srNo}? It moves to Data Retention where it can be restored or purged.`)) return
    setError(null)
    try {
      await api.del(`/contracts/${srNo}`)
      navigate('/contracts')
    } catch (e) { setError(e.message) }
  }

  async function placeLegalHold() {
    const reason = window.prompt('Reason for legal hold (optional):', '')
    if (reason === null) return
    setError(null)
    try { await api.post(`/contracts/${srNo}/legal-hold`, { reason: reason || null }); load() }
    catch (e) { setError(e.message) }
  }
  async function releaseLegalHold() {
    if (!await confirmDialog('Release the legal hold on this contract? Editing and deletion will be re-enabled.')) return
    setError(null)
    try { await api.del(`/contracts/${srNo}/legal-hold`); load() } catch (e) { setError(e.message) }
  }

  async function linkDocument() {
    const other = parseInt(linkSr, 10)
    if (!other) return
    setError(null)
    try {
      const g = await api.post(`/contracts/${srNo}/link-document`, { sr_no: other })
      setGroup(g)
      setLinkSr('')
      setMessage(`Linked #${other} as a document of this contract`)
    } catch (e) { setError(e.message) }
  }

  async function unlinkDocument() {
    if (!await confirmDialog('Remove this contract from its document group?')) return
    try {
      await api.post(`/contracts/${srNo}/unlink-document`)
      load()
    } catch (e) { setError(e.message) }
  }

  async function saveRecipients() {
    try {
      await api.put(`/contracts/${srNo}/recipients`, { recipients })
      setEditingRecipients(false)
      setMessage('Recipients updated')
      load()
    } catch (e) { setError(e.message) }
  }

  async function saveOverride() {
    try {
      await api.put(`/contracts/${srNo}/reminder-override`, {
        reminder_rule_id: override.reminder_rule_id ? Number(override.reminder_rule_id) : null,
        custom_offsets: override.custom_offsets
          ? override.custom_offsets.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n))
          : null,
        escalation_after: override.escalation_after !== '' ? Number(override.escalation_after) : null,
        escalation_email: override.escalation_email.trim() || null,
      })
      setMessage('Reminder override saved (recorded in audit trail)')
      load()
    } catch (e) { setError(e.message) }
  }

  if (error && !c) return <div className="error">{error}</div>
  if (!c) return <p>Loading…</p>

  const F = ({ label, value }) => (
    <tr><th style={{ width: 220 }}>{label}</th><td>{value ?? '—'}</td></tr>
  )

  return (
    <div>
      <div className="toolbar" style={{ marginTop: 0 }}>
        <button className="secondary" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/contracts'))}>← Back</button>
        <span className="spacer" />
        {(isAdmin || isLegal) && (c.legal_hold
          ? <button className="secondary" onClick={releaseLegalHold} title="Release the legal hold">🔓 Release hold</button>
          : <button className="secondary" onClick={placeLegalHold} title="Lock this record from edit/deletion for legal preservation">🔒 Legal hold</button>)}
        {isSuperAdmin && (
          <button className="danger" onClick={deleteContract} title="Delete this contract (super admin only)">Delete contract</button>
        )}
      </div>
      <h2>
        Contract #{c.sr_no}{' '}
        <span className={`badge ${c.status}`}>{c.status}</span>{' '}
        <span className={`badge ${c.lifecycle_status}`}>{c.lifecycle_status}</span>
        {c.risk_level && (
          <span className={`badge ${c.risk_level === 'high' ? 'REJECTED' : c.risk_level === 'medium' ? 'warn' : 'VALIDATED'}`}
                title={`Playbook risk score ${c.risk_score}`} style={{ marginLeft: 6 }}>
            risk: {c.risk_level} ({c.risk_score})
          </span>
        )}
        {canValidate && (
          <button className="secondary" style={{ marginLeft: 8, verticalAlign: 'middle' }}
            title="Re-score this contract against Legal's playbook"
            onClick={async () => {
              setError(null); setMessage('Scoring…')
              try { const r = await api.post(`/contracts/${srNo}/score-risk`); setMessage(r.configured ? `Scored: ${r.risk_level} (${r.risk_score})` : 'No playbook configured yet.'); load() }
              catch (e) { setError(e.message); setMessage(null) }
            }}>Score risk</button>
        )}
        {c.legal_hold && <span className="badge REJECTED" title={c.legal_hold_reason || 'Under legal hold'} style={{ marginLeft: 6 }}>🔒 Legal hold</span>}
      </h2>
      {c.legal_hold && <div className="error" style={{ background: 'var(--warn-bg, #fff6e5)', color: 'inherit' }}>Under legal hold{c.legal_hold_reason ? `: ${c.legal_hold_reason}` : ''}. Editing and deletion are locked until released.</div>}
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <div className="toolbar">
        {c.status === 'PENDING_VALIDATION' && canValidate && (
          <Link className="btn" to={`/validation/${c.sr_no}`}>Open in validation screen</Link>
        )}
        {canValidate && c.status === 'VALIDATED' && (
          <>
            <Link className="btn secondary" to={`/validation/${c.sr_no}`}>Edit fields</Link>
            <button onClick={renew}>Renew…</button>
            <button className="secondary" onClick={() => setLifecycle('RENEWED')}>Mark Renewed</button>
            <button className="danger" onClick={() => setLifecycle('TERMINATED')}>Mark Terminated</button>
            <button className="secondary" onClick={() => api.post(`/contracts/${srNo}/acknowledge-reminders`).then(load)}>
              Acknowledge reminders
            </button>
          </>
        )}
        {canValidate && (c.status === 'REJECTED' || c.status === 'ARCHIVED') && (
          <button onClick={() => api.post(`/contracts/${srNo}/restore`).then(() => { setMessage('Contract restored to the validation queue'); load() }).catch((e) => setError(e.message))}>
            Restore to validation queue
          </button>
        )}
        <span className="spacer" />
        {c.contract_link && <>
          <button className="secondary" onClick={() => openPreview(`/contracts/${srNo}/file`, c.contract_link.split('/').pop())}>Preview document</button>
          <button className="secondary" onClick={() => api.download(`/contracts/${srNo}/file`, c.contract_link.split('/').pop())}>Download</button>
        </>}
      </div>

      <AskThisContract srNo={srNo} />

      {(c.ai_summary || canValidate) && (
        <div className="card">
          <div className="toolbar" style={{ marginTop: 0 }}>
            <h3 style={{ margin: 0 }}>AI abstract</h3>
            {c.ai_indexed_at && <span className="hint">indexed {new Date(c.ai_indexed_at).toLocaleDateString()}</span>}
            <span className="spacer" />
            {canValidate && (
              <button className="secondary" onClick={async () => {
                setError(null); setMessage('Generating…')
                try { await api.post(`/repo-ai/contracts/${srNo}/summarize`); setMessage('Abstract updated'); load() }
                catch (e) { setError(e.message); setMessage(null) }
              }}>{c.ai_summary ? 'Regenerate' : 'Generate abstract'}</button>
            )}
          </div>
          {c.ai_summary
            ? <p style={{ marginTop: 4 }}>{c.ai_summary}</p>
            : <p className="hint">No abstract yet — generate a one-paragraph summary and key-terms card.</p>}
          {(c.ai_key_terms || []).length > 0 && (
            <div className="chips" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {c.ai_key_terms.map((t) => (
                <span key={t.label} className="badge" title={t.label} style={{ maxWidth: 320 }}>
                  <b>{t.label}:</b> {t.value}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {preview === 'loading' && <div className="card"><p className="hint">Loading preview…</p></div>}
      {preview && preview !== 'loading' && (
        <div className="card">
          <div className="toolbar" style={{ marginTop: 0 }}>
            <h3 style={{ margin: 0 }}>Preview — {preview.name}</h3>
            <span className="spacer" />
            <button className="secondary" onClick={closePreview}>Close</button>
          </div>
          {preview.kind === 'image' && <img src={preview.url} alt={preview.name} style={{ maxWidth: '100%', borderRadius: 6 }} />}
          {preview.kind === 'pdf' && <iframe src={preview.url} title={preview.name} style={{ width: '100%', height: '70vh', border: '1px solid #dde3e9', borderRadius: 6 }} />}
          {preview.kind === 'other' && <p className="hint">No inline preview available for this file type — use the download link.</p>}
        </div>
      )}

      <div className="split">
        <div className="pane card">
          <ContractDocument srNo={srNo} contractLink={c.contract_link} />
        </div>
        <div className="pane card">
          <h3>Register fields</h3>
          <table className="grid">
            <tbody>
              <F label="Signing entity" value={c.signing_entity} />
              <F label="Vendor" value={c.vendor_id ? <Link to={`/vendors/${c.vendor_id}`}>{c.vendor_name}</Link> : c.vendor_name} />
              <F label="Vendor address" value={c.vendor_address} />
              <F label="Start date" value={c.start_date} />
              <F label="End date" value={c.end_date} />
              <F label="Tenure" value={c.contract_tenure} />
              <F label="Department" value={c.department_name} />
              <F label="PO number" value={c.po_number} />
              <F label="Value" value={c.contract_value != null ? `${c.currency} ${c.contract_value.toLocaleString('en-IN')}` : null} />
              <F label="Negotiated savings" value={c.savings_amount != null ? `${c.currency} ${c.savings_amount.toLocaleString('en-IN')}` : null} />
              <F label="IKS signing authority" value={c.iks_signing_authority} />
              <F label="Vendor signing authority" value={c.vendor_signing_authority} />
              <F label="Contract service" value={c.contract_service} />
              <F label="Service summary" value={c.service_summary} />
              <F label="Payment term" value={c.payment_term} />
              <F label="Notice period" value={c.notice_period} />
              <F label="Contract type" value={c.contract_type} />
              <F label="PHI shared" value={c.phi_shared == null ? null : (c.phi_shared ? 'Yes' : 'No')} />
              <F label="Tags" value={(c.tags && c.tags.length)
                ? c.tags.map((t) => <span key={t.id} className="tag-chip" style={t.color ? { borderColor: t.color, color: t.color } : undefined}>{t.name}</span>)
                : null} />
              <F label="Assignee" value={c.assignee_name} />
              <F label="Renewal of" value={c.renews_contract_id ? <Link to={`/contracts/${c.renews_contract_id}`}>#{c.renews_contract_id}</Link> : null} />
              <F label="Thread" value={c.thread_id} />
              {c.rejection_reason && <F label="Rejection reason" value={c.rejection_reason} />}
              {c.custom_fields && Object.entries(c.custom_fields).filter(([, v]) => v !== null && v !== '').map(([k, v]) => (
                <F key={k} label={k.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())}
                   value={typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)} />
              ))}
            </tbody>
          </table>

          {c.line_items && c.line_items.length > 0 && (
            <div className="card" style={{ marginTop: 12 }}>
              <h3>Line items — unit rates</h3>
              <table className="grid">
                <thead>
                  <tr><th>Item</th><th>Unit</th><th>Qty</th><th>Unit rate</th><th>Amount</th></tr>
                </thead>
                <tbody>
                  {c.line_items.map((li, i) => (
                    <tr key={i}>
                      <td>{li.item || '—'}</td>
                      <td>{li.unit || '—'}</td>
                      <td>{li.quantity != null ? li.quantity.toLocaleString('en-IN') : '—'}</td>
                      <td>{li.unit_rate != null ? `${c.currency || ''} ${li.unit_rate.toLocaleString('en-IN')}` : '—'}</td>
                      <td>{li.amount != null ? `${c.currency || ''} ${li.amount.toLocaleString('en-IN')}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="detail-below">
          <div className="card">
            <h3>Documents &amp; attachments</h3>
            <p className="hint">Primary document: {c.contract_link ? c.contract_link.split('/').pop() : '— none —'}</p>
            <table className="grid">
              <thead><tr><th>File</th><th>Kind</th><th>Added by</th><th></th></tr></thead>
              <tbody>
                {attachments.map((a) => (
                  <tr key={a.id}>
                    <td>{a.filename}</td>
                    <td><span className="badge">{a.kind}</span></td>
                    <td>{a.uploaded_by || '—'}</td>
                    <td>
                      <div className="toolbar" style={{ margin: 0 }}>
                        <button className="secondary" onClick={() => openPreview(`/contracts/${srNo}/attachments/${a.id}/file`, a.filename)}>Preview</button>
                        <button className="secondary" onClick={() => api.download(`/contracts/${srNo}/attachments/${a.id}/file`, a.filename)}>Download</button>
                        {canValidate && <button className="danger" onClick={() => deleteAttachment(a.id)}>×</button>}
                      </div>
                    </td>
                  </tr>
                ))}
                {attachments.length === 0 && <tr><td colSpan={4} className="hint">No additional attachments.</td></tr>}
              </tbody>
            </table>
            {canValidate && (
              <div className="toolbar" style={{ marginTop: 8 }}>
                <select value={attachKind} onChange={(e) => setAttachKind(e.target.value)}>
                  <option value="amendment">Amendment</option>
                  <option value="annexure">Annexure</option>
                  <option value="signed">Signed copy</option>
                  <option value="other">Other</option>
                </select>
                <input type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg,.tif,.tiff" onChange={(e) => setAttachFile(e.target.files[0] || null)} />
                <button disabled={!attachFile} onClick={uploadAttachment}>Attach</button>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Type &amp; tags</h3>
            {canValidate ? (
              <>
                <label>Assignee</label>
                <select value={c.assignee_id || ''} onChange={(e) => setAssignee(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">— Unassigned —</option>
                  {assignees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <label style={{ marginTop: 8 }}>Contract type</label>
                <input list="contract-type-list" value={typeDraft} onChange={(e) => setTypeDraft(e.target.value)} placeholder="e.g. NDA, MSA, SOW" />
                <datalist id="contract-type-list">
                  {allTypes.map((t) => <option key={t} value={t} />)}
                </datalist>
                <label style={{ marginTop: 8 }}>Tags</label>
                {allTags.length === 0 && <p className="hint">No tags defined yet — create them in Admin Settings.</p>}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {allTags.map((t) => (
                    <label key={t.id} style={{ margin: 0, display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 400, whiteSpace: 'nowrap' }}>
                      <input type="checkbox" style={{ width: 'auto' }}
                        checked={tagDraft.includes(t.id)}
                        onChange={(e) => setTagDraft(e.target.checked ? [...tagDraft, t.id] : tagDraft.filter((id) => id !== t.id))} />
                      {t.name}
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 10 }}><button onClick={saveCategorization}>Save type &amp; tags</button></div>
              </>
            ) : (
              <p className="hint">
                Type: {c.contract_type || '—'} · Tags: {(c.tags || []).map((t) => t.name).join(', ') || '—'}
              </p>
            )}
          </div>

          <div className="card">
            <div className="toolbar" style={{ marginTop: 0 }}>
              <h3 style={{ margin: 0 }}>Obligations &amp; milestones</h3>
              <span className="spacer" />
              {canValidate && <button className="secondary" onClick={extractObligations} title="AI-extract obligations from the contract text into this register">Extract obligations (AI)</button>}
            </div>
            {milestones.length === 0 && <p className="hint">No obligations yet — add one below or extract them from the contract.</p>}
            {milestones.length > 0 && (
              <table className="grid">
                <thead><tr><th></th><th>Obligation</th><th>Type</th><th>Owner</th><th>Due</th><th></th></tr></thead>
                <tbody>
                  {milestones.map((m) => (
                    <tr key={m.id}>
                      <td><input type="checkbox" style={{ width: 'auto' }} checked={m.status === 'DONE'} disabled={!canValidate} onChange={() => toggleMilestone(m)} /></td>
                      <td style={m.status === 'DONE' ? { textDecoration: 'line-through', color: '#94a3b8' } : undefined}>
                        {m.title}
                        {m.ai_generated && <span className="badge ARCHIVED" style={{ marginLeft: 4 }} title="AI-extracted">AI</span>}
                        {m.source_text && <div className="hint" title={m.source_text}>{m.source_text.slice(0, 120)}{m.source_text.length > 120 ? '…' : ''}</div>}
                      </td>
                      <td>{m.obligation_type ? <span className="badge">{m.obligation_type}</span> : '—'}</td>
                      <td className="hint">
                        {canValidate ? (
                          <select value={m.owner_user_id || ''} style={{ padding: '2px 4px', minWidth: 110 }}
                            onChange={async (e) => {
                              try { await api.patch(`/contracts/${srNo}/milestones/${m.id}`, { owner_user_id: e.target.value ? Number(e.target.value) : 0 }); api.get(`/contracts/${srNo}/milestones`).then(setMilestones) }
                              catch (err) { setError(err.message) }
                            }}>
                            <option value="">{m.owner_party === 'us' ? 'Us' : m.owner_party === 'counterparty' ? 'Vendor' : m.owner_party === 'both' ? 'Both' : 'Unassigned'}</option>
                            {assignees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                          </select>
                        ) : (m.owner_user_name || (m.owner_party === 'us' ? 'Us' : m.owner_party === 'counterparty' ? 'Vendor' : m.owner_party === 'both' ? 'Both' : '—'))}
                        {m.frequency ? ` · ${m.frequency}` : ''}
                      </td>
                      <td>{m.due_date || '—'} {m.overdue && <span className="badge REJECTED">overdue</span>}</td>
                      <td>{canValidate && <button className="danger" onClick={() => deleteMilestone(m.id)}>×</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {canValidate && (
              <div className="toolbar" style={{ marginTop: 8 }}>
                <input placeholder="New obligation / milestone…" value={newMs.title} onChange={(e) => setNewMs({ ...newMs, title: e.target.value })} />
                <input type="date" value={newMs.due_date} onChange={(e) => setNewMs({ ...newMs, due_date: e.target.value })} />
                <button disabled={!newMs.title.trim()} onClick={addMilestone}>Add</button>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Payment schedule &amp; spend</h3>
            {payments.length === 0 && <p className="hint">No payment lines yet.</p>}
            {payments.length > 0 && (
              <table className="grid">
                <thead><tr><th>Description</th><th>Amount</th><th>Due</th><th>PO / Invoice</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{p.description || '—'}</td>
                      <td>{p.amount != null ? `${p.currency} ${p.amount.toLocaleString('en-IN')}` : '—'}</td>
                      <td>{p.overdue ? <span className="badge REJECTED">{p.due_date}</span> : (p.due_date || '—')}</td>
                      <td className="hint">{p.po_reference || '—'}{p.invoice_reference ? ` / ${p.invoice_reference}` : ''}</td>
                      <td>
                        {canValidate ? (
                          <select value={p.status} style={{ padding: '2px 4px' }} onChange={(e) => setPaymentStatus(p, e.target.value)}>
                            <option value="SCHEDULED">Scheduled</option>
                            <option value="INVOICED">Invoiced</option>
                            <option value="PAID">Paid</option>
                          </select>
                        ) : <span className={`badge ${p.status === 'PAID' ? 'VALIDATED' : p.status === 'INVOICED' ? 'warn' : ''}`}>{p.status}</span>}
                      </td>
                      <td>{canValidate && <button className="danger" onClick={() => deletePayment(p.id)}>×</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {canValidate && (
              <div className="toolbar" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                <input placeholder="Description / milestone…" value={newPay.description} onChange={(e) => setNewPay({ ...newPay, description: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
                <input type="number" placeholder="Amount" value={newPay.amount} onChange={(e) => setNewPay({ ...newPay, amount: e.target.value })} style={{ maxWidth: 120 }} />
                <input type="date" value={newPay.due_date} onChange={(e) => setNewPay({ ...newPay, due_date: e.target.value })} />
                <input placeholder="PO ref" value={newPay.po_reference} onChange={(e) => setNewPay({ ...newPay, po_reference: e.target.value })} style={{ maxWidth: 110 }} />
                <button onClick={addPayment}>Add</button>
              </div>
            )}
          </div>

          <div className="card">
            <h3>Notes</h3>
            {canValidate && (
              <div style={{ marginBottom: 10 }}>
                <textarea rows={2} placeholder="Add a note for other validators…" value={newNote} onChange={(e) => setNewNote(e.target.value)} />
                <div style={{ marginTop: 6 }}><button disabled={!newNote.trim()} onClick={addNote}>Add note</button></div>
              </div>
            )}
            {notes.length === 0 && <p className="hint">No notes yet.</p>}
            {notes.map((n) => (
              <div key={n.id} style={{ borderTop: '1px solid #eef2f6', padding: '8px 0' }}>
                <div style={{ fontSize: 12, color: '#64748b' }}>
                  <b>{n.author || 'system'}</b> · {new Date(n.created_at).toLocaleString()}
                  {(isAdmin || n.author_id === user.id) && canValidate && (
                    <button className="danger" style={{ float: 'right', padding: '1px 8px' }} onClick={() => deleteNote(n.id)}>×</button>
                  )}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{n.body}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <h3>Reminder recipients</h3>
            {!editingRecipients ? (
              <>
                <ul>
                  {(c.recipients || []).map((r) => (
                    <li key={r.id}>{r.name} &lt;{r.email}&gt; {r.is_primary && <strong>(primary)</strong>}</li>
                  ))}
                  {(c.recipients || []).length === 0 && (
                    <li className="hint">
                      {c.department_default_recipient_email
                        ? <>Inheriting department default: <strong>{c.department_default_recipient_email}</strong></>
                        : 'Using department default recipient (none configured on the department)'}
                    </li>
                  )}
                </ul>
                {canValidate && <button className="secondary" onClick={() => setEditingRecipients(true)}>Edit recipients</button>}
              </>
            ) : (
              <>
                {recipients.map((r, i) => (
                  <div key={i} className="toolbar">
                    <input placeholder="Name" value={r.name} onChange={(e) => {
                      const next = [...recipients]; next[i] = { ...r, name: e.target.value }; setRecipients(next)
                    }} />
                    <input placeholder="Email" value={r.email} onChange={(e) => {
                      const next = [...recipients]; next[i] = { ...r, email: e.target.value }; setRecipients(next)
                    }} />
                    <label style={{ margin: 0, whiteSpace: 'nowrap' }}>
                      <input type="radio" style={{ width: 'auto' }} checked={r.is_primary}
                        onChange={() => setRecipients(recipients.map((x, j) => ({ ...x, is_primary: i === j })))} /> primary
                    </label>
                    <button className="danger" onClick={() => setRecipients(recipients.filter((_, j) => j !== i))}>×</button>
                  </div>
                ))}
                {recipients.length === 0 && (
                  <p className="hint">
                    No contract-level recipients — reminders fall back to the department default
                    {c.department_default_recipient_email ? <> (<strong>{c.department_default_recipient_email}</strong>)</> : ''}.
                  </p>
                )}
                <div className="toolbar">
                  <button className="secondary" onClick={() => setRecipients([...recipients, { name: '', email: '', is_primary: recipients.length === 0 }])}>+ Add</button>
                  {c.department_default_recipient_email && (
                    <button className="secondary" title="Copy the department default email(s) into this contract so you can edit them"
                      onClick={() => {
                        const existing = new Set(recipients.map((r) => (r.email || '').trim().toLowerCase()))
                        const inherited = c.department_default_recipient_email
                          .split(/[,\n;]+/).map((s) => s.trim()).filter(Boolean)
                          .filter((email) => !existing.has(email.toLowerCase()))
                          .map((email, k) => ({ name: '', email, is_primary: recipients.length === 0 && k === 0 }))
                        setRecipients([...recipients, ...inherited])
                      }}>Prefill from department</button>
                  )}
                  <button onClick={saveRecipients}>Save</button>
                  <button className="secondary" onClick={() => { setEditingRecipients(false); setRecipients(c.recipients || []) }}>Cancel</button>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <h3>Reminder rule override</h3>
            <label>Rule (blank = department default)</label>
            <select value={override.reminder_rule_id} onChange={(e) => setOverride({ ...override, reminder_rule_id: e.target.value })} disabled={!canValidate}>
              <option value="">— department default —</option>
              {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <label>Custom offsets (days before expiry, comma-separated; blank = rule offsets)</label>
            <input value={override.custom_offsets} onChange={(e) => setOverride({ ...override, custom_offsets: e.target.value })} disabled={!canValidate} placeholder="90, 60, 30" />
            <label>Escalation after N reminders (blank = rule default)</label>
            <input type="number" min="1" value={override.escalation_after}
              onChange={(e) => setOverride({ ...override, escalation_after: e.target.value })}
              disabled={!canValidate} placeholder="e.g. 3" />
            <label>Escalation email — CC'd once the threshold is reached (blank = rule default)</label>
            <input type="email" value={override.escalation_email}
              onChange={(e) => setOverride({ ...override, escalation_email: e.target.value })}
              disabled={!canValidate} placeholder="escalation@example.com" />
            {canValidate && <div style={{ marginTop: 10 }}><button onClick={saveOverride}>Save override</button></div>}
            {schedule && (
              <div style={{ marginTop: 12 }}>
                <label style={{ marginBottom: 4 }}>Upcoming reminders {schedule.rule ? `(rule: ${schedule.rule})` : ''}</label>
                {schedule.stopped ? (
                  <p className="hint">Reminders stopped ({schedule.stopped_reason}).</p>
                ) : (
                  <>
                    {schedule.snoozed_until && <p className="hint">Snoozed until {schedule.snoozed_until} — resumes after that date.</p>}
                    {schedule.dates.length === 0 ? (
                      <p className="hint">No upcoming reminders (no rule/offsets or no end date).</p>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {schedule.dates.slice(0, 12).map((d) => (
                          <span key={d} className="badge PENDING_VALIDATION">{d}</span>
                        ))}
                      </div>
                    )}
                  </>
                )}
                {canValidate && !schedule.stopped && (
                  <div className="toolbar" style={{ marginTop: 10 }}>
                    <span className="hint">Snooze:</span>
                    {[7, 30, 90].map((d) => (
                      <button key={d} className="secondary" onClick={() => snooze({ days: d })}>{d}d</button>
                    ))}
                    <input type="date" onChange={(e) => e.target.value && snooze({ until: e.target.value })} />
                    {schedule.snoozed_until && <button className="secondary" onClick={() => snooze({})}>Clear snooze</button>}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <div className="toolbar" style={{ marginTop: 0 }}>
              <h3 style={{ margin: 0 }}>Reminder log</h3>
              <span className="spacer" />
              {reminderLog.length > 0 && (
                <button className="secondary" onClick={() => api.download(`/rules/reminder-log/export?contract_id=${srNo}`, `reminder_log_${srNo}.csv`)}>Export CSV</button>
              )}
            </div>
            <table className="grid">
              <thead><tr><th>Sent</th><th>Recipient</th><th>Days to expiry</th><th>Status</th></tr></thead>
              <tbody>
                {reminderLog.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.sent_at).toLocaleString()}</td>
                    <td>{r.recipient}{r.escalated && <span className="badge warn"> escalated</span>}</td>
                    <td>{r.days_to_expiry}</td>
                    <td><span className={`badge ${r.delivery_status}`}>{r.delivery_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      <div className="card">
        <h3>Documents in this contract</h3>
        <p className="hint">
          Link the related documents that make up this contract (NDA, BAA, MSA, SOW, …).
          Each keeps its own type, dates and renewals.
        </p>
        <table className="grid">
          <thead>
            <tr><th>Type</th><th>#</th><th>Vendor</th><th>Start</th><th>End</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {(group?.members || []).map((m) => (
              <tr key={m.sr_no} style={m.is_current ? { background: '#eef4ff' } : undefined}>
                <td>{m.contract_type || '—'}</td>
                <td>{m.is_current ? <strong>#{m.sr_no} (this)</strong> : <Link to={`/contracts/${m.sr_no}`}>#{m.sr_no}</Link>}</td>
                <td>{m.vendor_name || '—'}</td>
                <td>{m.start_date || '—'}</td>
                <td>{m.end_date || '—'}</td>
                <td><span className={`badge ${m.status}`}>{m.status}</span></td>
                <td>{m.is_current && group?.group_id && canValidate && (
                  <button className="danger" onClick={unlinkDocument} title="Remove this document from the group">Unlink</button>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {canValidate && (
          <div className="toolbar" style={{ marginTop: 8 }}>
            <input type="number" placeholder="Contract # to link (e.g. 42)" value={linkSr}
              onChange={(e) => setLinkSr(e.target.value)} style={{ maxWidth: 220 }} />
            <button disabled={!linkSr} onClick={linkDocument}>Link document</button>
          </div>
        )}

        {group && group.renewal_history.length > 1 && (
          <>
            <h3 style={{ marginTop: 16 }}>Renewal history</h3>
            <p className="hint">Every document and renewal across this contract group, oldest first.</p>
            <table className="grid">
              <thead>
                <tr><th>Start</th><th>End</th><th>Type</th><th>#</th><th>Renews</th><th>Lifecycle</th></tr>
              </thead>
              <tbody>
                {group.renewal_history.map((h) => (
                  <tr key={h.sr_no} style={h.is_current ? { background: '#eef4ff' } : undefined}>
                    <td>{h.start_date || '—'}</td>
                    <td>{h.end_date || '—'}</td>
                    <td>{h.contract_type || '—'}</td>
                    <td>{h.is_current ? <strong>#{h.sr_no}</strong> : <Link to={`/contracts/${h.sr_no}`}>#{h.sr_no}</Link>}</td>
                    <td>{h.renews_contract_id ? <Link to={`/contracts/${h.renews_contract_id}`}>#{h.renews_contract_id}</Link> : '—'}</td>
                    <td><span className={`badge ${h.lifecycle_status}`}>{h.lifecycle_status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {thread && thread.versions.length > 1 && (
        <div className="card">
          <h3>Renewal thread ({thread.versions.length} versions)</h3>
          <p className="hint">Cells highlighted in violet changed from the previous version.</p>
          <div style={{ overflowX: 'auto' }}>
            <table className="grid">
              <thead>
                <tr>
                  <th>Field</th>
                  {thread.versions.map((v) => (
                    <th key={v.sr_no} style={v.is_current ? { background: '#eef4ff' } : undefined}>
                      <Link to={`/contracts/${v.sr_no}`}>#{v.sr_no}</Link>
                      {v.is_current && ' (this)'}
                      <div style={{ fontWeight: 400 }}><span className={`badge ${v.lifecycle_status}`}>{v.lifecycle_status}</span></div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {thread.fields.map((f) => (
                  <tr key={f}>
                    <th style={{ textAlign: 'left' }}>{f}</th>
                    {thread.versions.map((v) => (
                      <td key={v.sr_no} style={v.changed.includes(f) ? { background: '#f0e8fc', fontWeight: 600 } : undefined}>
                        {v.values[f] == null || v.values[f] === '' ? '—'
                          : (f === 'contract_value' ? Number(v.values[f]).toLocaleString('en-IN') : String(v.values[f]))}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h3>Audit trail</h3>
        <table className="grid">
          <thead><tr><th>When</th><th>Action</th><th>Field</th><th>Old value</th><th>New value</th><th>Who</th></tr></thead>
          <tbody>
            {audit.map((a) => (
              <tr key={a.id}>
                <td>{new Date(a.created_at).toLocaleString()}</td>
                <td>{a.action}</td>
                <td>{a.field || '—'}</td>
                <td>{a.old_value ?? '∅'}</td>
                <td>{a.new_value ?? '∅'}</td>
                <td>{a.user || 'system'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
