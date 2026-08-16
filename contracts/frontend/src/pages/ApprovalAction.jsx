import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api'

// H4: the page an approver lands on from the notification email. Sealed and
// standalone — no sidebar, no sign-in, and the token exposes exactly one draft
// and one approval stage.
export default function ApprovalAction() {
  const { token } = useParams()
  const [params] = useSearchParams()
  const [info, setInfo] = useState(null)
  const [note, setNote] = useState('')
  const [done, setDone] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get(`/approval-action/${token}`).then(setInfo).catch((e) => setError(e.message))
  }, [token])

  async function decide(kind) {
    setBusy(true); setError(null)
    try {
      const r = await api.post(`/approval-action/${token}/${kind}`, { note: note.trim() || null })
      setDone(r.decision)
    } catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  // ?d=approve / ?d=reject only preselects the intent — the person still confirms.
  const intent = params.get('d')

  return (
    <div className="login-wrap">
      <div className="login-card" style={{ maxWidth: 520 }}>
        <h2>Approval request</h2>

        {error && <div className="error">{error}</div>}

        {done && (
          <div className="success">
            Recorded — you {done === 'APPROVED' ? 'approved' : 'rejected'} this request.
            You can close this page.
          </div>
        )}

        {!done && info && (
          <>
            <table className="grid" style={{ marginBottom: 12 }}>
              <tbody>
                <tr><td>Draft</td><td><strong>#{info.draft_id}</strong> {info.draft_title}</td></tr>
                <tr><td>Type</td><td>{info.contract_type || '—'}</td></tr>
                <tr><td>Stage</td><td>{info.stage}</td></tr>
                <tr><td>Approver</td><td>{info.approver_email}</td></tr>
              </tbody>
            </table>

            <label>Note (optional)</label>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Anything the author should know" />

            <div className="toolbar" style={{ marginTop: 14 }}>
              <button disabled={busy} onClick={() => decide('approve')}
                style={intent === 'approve' ? undefined : { }}>
                ✓ Approve
              </button>
              <button className="danger" disabled={busy} onClick={() => decide('reject')}>
                ✗ Reject
              </button>
            </div>
            <p className="hint" style={{ marginTop: 12 }}>
              This link works once and covers only this approval.
            </p>
          </>
        )}

        {!done && !info && !error && <p className="hint">Loading…</p>}
      </div>
    </div>
  )
}
