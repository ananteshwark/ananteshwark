import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../../api'
import { confirmDialog } from '../../confirm'

const DISPO_BADGE = { ACCEPTED: 'VALIDATED', REJECTED: 'REJECTED', COUNTERED: 'DUPLICATE', PENDING: 'PENDING_VALIDATION' }

const REC_BADGE = { accept: 'VALIDATED', counter: 'warn', reject: 'REJECTED', review: '' }

// H2: what the playbook and this counterparty's history say we should do, plus a
// drafted reply. Advice only — the decision buttons stay where they were.
function Copilot({ changeId }) {
  const [advice, setAdvice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  async function ask() {
    setBusy(true); setErr(null)
    try { setAdvice(await api.get(`/authoring/changes/${changeId}/advice`)) }
    catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  if (!advice) {
    return (
      <>
        <button className="secondary" disabled={busy} onClick={ask}
          title="What does the playbook and this counterparty's history suggest?">
          {busy ? 'Thinking…' : '🤝 Copilot'}
        </button>
        {err && <span className="hint" style={{ color: 'var(--danger,#b5361f)' }}>{err}</span>}
      </>
    )
  }

  const h = advice.history || {}
  return (
    <div style={{ width: '100%', marginTop: 8 }}>
      <div className="snippet">
        <div className="toolbar" style={{ margin: 0 }}>
          <span className={`badge ${REC_BADGE[advice.recommendation] || ''}`}>
            {advice.recommendation}
          </span>
          {advice.position && <span className="hint">their wording is {advice.position.replace('_', '-')}</span>}
          <span className="spacer" />
          <button className="secondary" onClick={() => setAdvice(null)}>Hide</button>
        </div>
        <p style={{ margin: '6px 0' }}>{advice.rationale}</p>
        {h.seen > 0 && (
          <p className="hint" style={{ margin: 0 }}>
            This counterparty: {h.seen} prior change(s) · {h.accepted} accepted · {h.rejected} rejected · {h.countered} countered
          </p>
        )}
        {advice.counter_text && (
          <>
            <div className="hint" style={{ marginTop: 8 }}>Suggested counter-wording</div>
            <div className="diff" style={{ whiteSpace: 'pre-wrap' }}>{advice.counter_text}</div>
          </>
        )}
        {advice.reply && (
          <>
            <div className="hint" style={{ marginTop: 8 }}>Drafted reply</div>
            <textarea rows={4} readOnly value={advice.reply} style={{ width: '100%', fontFamily: 'inherit' }} />
            <button className="secondary" style={{ marginTop: 4 }}
              onClick={() => { navigator.clipboard?.writeText(advice.reply); window.dispatchEvent(new CustomEvent('cms:toast', { detail: { message: 'Reply copied', type: 'success' } })) }}>
              Copy reply
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function RedlineReview() {
  const { id } = useParams()
  const [changes, setChanges] = useState([])
  const [ledger, setLedger] = useState(null)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [selected, setSelected] = useState([])

  const [ledgerDispo, setLedgerDispo] = useState('')
  const load = useCallback(() => {
    api.get(`/authoring/drafts/${id}/changes`).then(setChanges).catch((e) => setError(e.message))
    const q = ledgerDispo ? `?disposition=${ledgerDispo}` : ''
    api.get(`/authoring/drafts/${id}/ledger${q}`).then(setLedger).catch(() => {})
  }, [id, ledgerDispo])
  useEffect(load, [load])

  async function decide(c, decision) {
    let reason = null, countered = null
    if (decision === 'REJECTED') { reason = prompt('Reason for rejecting (required):'); if (!reason) return }
    if (decision === 'COUNTERED') { countered = prompt('Counter-proposal text:'); if (!countered) return }
    try {
      await api.post(`/authoring/changes/${c.id}/decide`, { decision, reason, countered_text: countered })
      load()
    } catch (e) { setError(e.message) }
  }

  async function bulkDecide(decision) {
    if (selected.length === 0) return
    let reason = null, countered = null
    if (decision === 'REJECTED') { reason = prompt(`Reason for rejecting ${selected.length} change(s):`); if (!reason) return }
    if (decision === 'COUNTERED') { countered = prompt('Counter text applied to all selected:'); if (!countered) return }
    try {
      await api.post('/authoring/changes/bulk-decide', { change_ids: selected, decision, reason, countered_text: countered })
      setSelected([]); load()
    } catch (e) { setError(e.message) }
  }
  function toggleSel(id) { setSelected((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) }

  async function notifyVendor() {
    if (!await confirmDialog('Email the vendor a fresh link with the itemized disposition summary? This supersedes prior links.')) return
    try {
      const r = await api.post(`/authoring/drafts/${id}/notify-vendor`)
      setMessage(`Vendor notified (round ${r.round_no}). Accepted ${r.summary.ACCEPTED || 0}, rejected ${r.summary.REJECTED || 0}, countered ${r.summary.COUNTERED || 0}.`)
    } catch (e) { setError(e.message) }
  }

  const pending = changes.filter((c) => c.disposition === 'PENDING')

  return (
    <div>
      <h2>Redline review — draft #{id}</h2>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
      <div className="toolbar">
        <span className="hint">{pending.length} change(s) awaiting decision</span>
        {selected.length > 0 && <>
          <strong>{selected.length} selected:</strong>
          <button className="secondary" onClick={() => bulkDecide('ACCEPTED')}>Accept</button>
          <button className="danger" onClick={() => bulkDecide('REJECTED')}>Reject</button>
          <button className="secondary" onClick={() => bulkDecide('COUNTERED')}>Counter</button>
        </>}
        <span className="spacer" />
        <button className="secondary" onClick={() => api.download(`/authoring/drafts/${id}/redline.docx`, `draft-${id}-redline.docx`).catch((e) => setError(e.message))}>Export redline (DOCX)</button>
        <button className="secondary" onClick={notifyVendor}>Notify vendor of decisions</button>
      </div>

      {changes.map((c) => (
        <div className="card" key={c.id}>
          <div className="toolbar" style={{ margin: 0 }}>
            {c.disposition === 'PENDING' && (
              <input type="checkbox" style={{ width: 'auto' }} checked={selected.includes(c.id)} onChange={() => toggleSel(c.id)} />
            )}
            <strong>{c.clause_type || 'General'}</strong>
            <span className="badge">{c.change_type}</span>
            <span className="hint">by {c.author_email}</span>
            <span className="spacer" />
            <span className={`badge ${DISPO_BADGE[c.disposition]}`}>{c.disposition}</span>
          </div>
          <div className="compare" style={{ marginTop: 8 }}>
            <div className="head">Original</div><div className="head">Proposed</div><div className="head" />
            <div className="diff" style={{ whiteSpace: 'pre-wrap' }}>{c.original_text || '—'}</div>
            <div className="diff" style={{ whiteSpace: 'pre-wrap' }}>{c.proposed_text || (c.change_type === 'DELETE' ? '(deleted)' : c.change_type === 'COMMENT' ? '(comment)' : '—')}</div>
            <div />
          </div>
          {c.rationale && <p className="hint" style={{ marginTop: 6 }}>Vendor rationale: {c.rationale}</p>}
          {c.risk_commentary && <div className="snippet"><strong>AI risk:</strong> {c.risk_commentary}<br /><strong>Suggested:</strong> {c.suggested_response}</div>}
          {c.disposition_reason && <p className="hint">Decision reason: {c.disposition_reason}</p>}
          {c.countered_text && <p className="hint">Counter: {c.countered_text}</p>}
          {c.disposition === 'PENDING' && (
            <div className="toolbar" style={{ marginTop: 8 }}>
              <button className="secondary" onClick={() => decide(c, 'ACCEPTED')}>Accept</button>
              <button className="danger" onClick={() => decide(c, 'REJECTED')}>Reject</button>
              <button className="secondary" onClick={() => decide(c, 'COUNTERED')}>Counter</button>
              <Copilot changeId={c.id} />
            </div>
          )}
        </div>
      ))}
      {changes.length === 0 && <p className="hint">No vendor changes on this draft yet.</p>}

      {ledger && ledger.rounds.length > 0 && (
        <div className="card">
          <div className="toolbar" style={{ margin: 0 }}>
            <h3 style={{ margin: 0 }}>Negotiation ledger</h3>
            <select value={ledgerDispo} onChange={(e) => setLedgerDispo(e.target.value)}>
              <option value="">All dispositions</option>
              {['PENDING', 'ACCEPTED', 'REJECTED', 'COUNTERED', 'WITHDRAWN'].map((d) => <option key={d}>{d}</option>)}
            </select>
            <span className="spacer" />
            <button className="secondary" onClick={() => api.download(`/authoring/drafts/${id}/ledger.xlsx${ledgerDispo ? `?disposition=${ledgerDispo}` : ''}`, `draft-${id}-ledger.xlsx`)}>Excel</button>
            <button className="secondary" onClick={() => api.download(`/authoring/drafts/${id}/ledger.pdf${ledgerDispo ? `?disposition=${ledgerDispo}` : ''}`, `draft-${id}-ledger.pdf`)}>PDF</button>
          </div>
          {ledger.rounds.map((r) => (
            <div key={r.round_no} style={{ marginBottom: 10 }}>
              <strong>Round {r.round_no}</strong> <span className="badge">{r.status}</span>
              <span className="hint"> · shared with {r.shared_with} · {r.shared_at ? new Date(r.shared_at).toLocaleString() : ''}</span>
              <span className="hint"> · {r.changes.length} change(s)</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
