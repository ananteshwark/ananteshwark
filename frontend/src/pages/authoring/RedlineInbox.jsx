import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../../api'

export default function RedlineInbox() {
  const [rows, setRows] = useState([])
  const [error, setError] = useState(null)
  useEffect(() => { api.get('/authoring/inbox').then(setRows).catch((e) => setError(e.message)) }, [])
  return (
    <div>
      <h2>Redline Review inbox</h2>
      <p className="hint">Drafts a vendor has returned, or with changes awaiting your decision.</p>
      {error && <div className="error">{error}</div>}
      <table className="grid">
        <thead><tr><th>Draft</th><th>Vendor</th><th>Status</th><th>Pending changes</th><th /></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.draft_id}>
              <td>#{r.draft_id} — {r.title}</td>
              <td>{r.vendor_name || '—'}</td>
              <td><span className="badge">{r.status}</span></td>
              <td>{r.pending_changes > 0 ? <span className="badge warn">{r.pending_changes}</span> : 0}</td>
              <td><Link className="btn" to={`/authoring/drafts/${r.draft_id}/redline`}>Review</Link></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan="5" className="hint">Nothing awaiting review.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
