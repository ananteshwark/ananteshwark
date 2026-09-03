import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { confirmDialog } from '../../confirm'

// A compact stepper showing where a draft sits in the authoring workflow.
function StageBar({ stages, index }) {
  return (
    <div className="stage-bar" title={stages[index]}>
      {stages.map((s, i) => (
        <span key={i} className={`stage-dot${i < index ? ' done' : i === index ? ' current' : ''}`} title={s} />
      ))}
      <span className="hint" style={{ marginLeft: 6 }}>{stages[index]}</span>
    </div>
  )
}

export default function DraftingQueue() {
  const navigate = useNavigate()
  const { isSuperAdmin } = useAuth()
  const [rows, setRows] = useState([])
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [mine, setMine] = useState(false)
  const [showDone, setShowDone] = useState(false)

  const load = () => api.get(`/authoring/drafts?include_finalized=${showDone}${mine ? '&mine=true' : ''}`)
    .then(setRows).catch((e) => setError(e.message))
  useEffect(() => { load() }, [mine, showDone])  // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(
    () => rows.filter((d) => showDone || d.contract_id == null),
    [rows, showDone],
  )

  function download(id, kind, title) {
    api.download(`/authoring/drafts/${id}/export.${kind}`, `${title || 'contract'}.${kind}`)
      .catch((e) => setError(e.message))
  }

  async function deleteDraft(d) {
    if (!await confirmDialog(`Delete draft "${d.title || `#${d.id}`}"? It moves to Data Retention where it can be restored.`)) return
    setError(null); setMessage(null)
    try {
      const r = await api.del(`/authoring/drafts/${d.id}`)
      // Deleting a converted draft sends its request back to the triage queue.
      // Say so — otherwise the request quietly reappearing looks like a bug.
      const reopened = r?.requests_reopened || []
      if (reopened.length) {
        setMessage(`Draft deleted. Contract request ${reopened.map((id) => `#${id}`).join(', ')} `
          + `${reopened.length > 1 ? 'are' : 'is'} back in the queue for triage.`)
      }
      load()
    } catch (e) { setError(e.message) }
  }

  return (
    <div>
      <h2>Drafting Queue</h2>
      <p className="hint">Every in-progress draft. Open one to keep working — drafts autosave, so you can leave and return anytime.</p>
      <div className="toolbar">
        <button onClick={() => navigate('/authoring/new')}>+ Start a new draft</button>
        <span className="spacer" />
        <label style={{ margin: 0, display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 400 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only mine
        </label>
        <label style={{ margin: 0, display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 400 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Include finalized
        </label>
      </div>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
      <table className="grid">
        <thead>
          <tr><th>Title</th><th>Type</th><th>Counterparty</th><th>Stage</th><th>Updated</th><th></th></tr>
        </thead>
        <tbody>
          {visible.map((d) => (
            <tr key={d.id}>
              <td><Link to={`/authoring/drafts/${d.id}`}>{d.title || `Draft #${d.id}`}</Link>
                {d.origin === 'renewal' && <span className="badge" style={{ marginLeft: 6 }}>renewal</span>}
                {d.contract_id && <span className="badge VALIDATED" style={{ marginLeft: 6 }}>#{d.contract_id}</span>}
              </td>
              <td>{d.contract_type || '—'}</td>
              <td>{d.vendor_name || '—'}</td>
              <td><StageBar stages={d.stages || []} index={d.stage_index || 0} /></td>
              <td className="hint">{d.updated_at ? new Date(d.updated_at).toLocaleString() : '—'}</td>
              <td>
                <div className="toolbar" style={{ margin: 0 }}>
                  <Link className="btn secondary" to={`/authoring/drafts/${d.id}`}>Open</Link>
                  <button className="secondary" title="Download Word" onClick={() => download(d.id, 'docx', d.title)}>DOCX</button>
                  <button className="secondary" title="Download PDF" onClick={() => download(d.id, 'pdf', d.title)}>PDF</button>
                  {isSuperAdmin && <button className="danger" title="Delete draft (super admin only)" onClick={() => deleteDraft(d)}>Delete</button>}
                </div>
              </td>
            </tr>
          ))}
          {visible.length === 0 && <tr><td colSpan="6" className="hint">No drafts in the queue. Start one above.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
