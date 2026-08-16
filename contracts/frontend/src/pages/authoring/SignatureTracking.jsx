import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'

const BADGE = {
  SENT: 'PENDING_VALIDATION', DELIVERED: 'PENDING_VALIDATION', VIEWED: 'DUPLICATE',
  SIGNED: 'DUPLICATE', COMPLETED: 'VALIDATED', DECLINED: 'REJECTED', VOIDED: 'ARCHIVED', CREATED: 'ARCHIVED',
}

export default function SignatureTracking() {
  const [rows, setRows] = useState([])
  const [error, setError] = useState(null)
  const [sel, setSel] = useState(null)

  const load = () => api.get('/esign/envelopes').then(setRows).catch((e) => setError(e.message))
  useEffect(load, [])

  async function voidEnv(e) {
    const reason = prompt('Reason for voiding the envelope:')
    if (!reason) return
    try { await api.post(`/esign/envelopes/${e.id}/void?reason=${encodeURIComponent(reason)}`); load() }
    catch (err) { setError(err.message) }
  }
  async function resend(e) {
    try { await api.post(`/esign/envelopes/${e.id}/resend`); alert('Resent.') } catch (err) { setError(err.message) }
  }

  return (
    <div>
      <h2>Signature Tracking</h2>
      {error && <div className="error">{error}</div>}
      <table className="grid">
        <thead><tr><th>Envelope</th><th>Draft</th><th>Provider</th><th>Status</th><th>Signers</th><th>Contract</th><th /></tr></thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td className="hint">{e.external_id}</td>
              <td><Link to={`/authoring/drafts/${e.draft_id}`}>#{e.draft_id}</Link></td>
              <td>{e.provider}</td>
              <td><span className={`badge ${BADGE[e.status]}`}>{e.status}</span></td>
              <td>{(e.signers || []).map((s) => s.email).join(', ')}</td>
              <td>{e.contract_id ? <Link to={`/contracts/${e.contract_id}`}>#{e.contract_id}</Link> : '—'}</td>
              <td>
                <div className="toolbar" style={{ margin: 0 }}>
                  <button className="secondary" onClick={() => setSel(e)}>Trail</button>
                  {!['COMPLETED', 'VOIDED', 'DECLINED'].includes(e.status) && <>
                    <button className="secondary" onClick={() => resend(e)}>Resend</button>
                    <button className="danger" onClick={() => voidEnv(e)}>Void</button>
                  </>}
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="7" className="hint">No envelopes yet.</td></tr>}
        </tbody>
      </table>

      {sel && (
        <div className="modal-backdrop" onClick={() => setSel(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3>Audit trail — {sel.external_id}</h3>
            <table className="grid">
              <thead><tr><th>Event</th><th>Recipient</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {sel.events.map((ev, i) => (
                  <tr key={i}><td>{ev.event_type}</td><td>{ev.recipient || '—'}</td><td>{ev.status || '—'}</td>
                    <td className="hint">{ev.occurred_at ? new Date(ev.occurred_at).toLocaleString() : ''}</td></tr>
                ))}
              </tbody>
            </table>
            <div className="toolbar" style={{ marginTop: 10 }}><button className="secondary" onClick={() => setSel(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
