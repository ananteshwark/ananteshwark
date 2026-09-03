import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

async function upload(file, dryRun) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`/api/contracts/import?dry_run=${dryRun}`, {
    method: 'POST', headers: api.uploadHeaders(), credentials: 'same-origin', body: fd,
  })
  if (!res.ok) {
    let detail = res.statusText
    try { detail = (await res.json()).detail } catch { /* */ }
    throw new Error(detail)
  }
  return res.json()
}

export default function Import() {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  async function run(dryRun) {
    if (!file) return
    setBusy(true); setError(null); setMessage(null)
    try {
      const res = await upload(file, dryRun)
      if (dryRun) {
        setPreview(res)
      } else {
        setMessage(`Imported ${res.created} contract(s): ${res.validated} validated, ${res.pending} pending validation.`)
        setPreview(null)
        setTimeout(() => navigate('/contracts'), 1200)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h2>Import contracts</h2>
      <p className="hint">
        Upload an Excel (.xlsx) or CSV file in the 15-column register format (the
        same layout as the register export). Vendors and departments are matched
        by name and created if new. Rows with all mandatory fields are imported as
        validated; incomplete rows go to the validation queue.
      </p>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <div className="card" style={{ maxWidth: 720 }}>
        <label>Register file (.xlsx or .csv)</label>
        <input type="file" accept=".xlsx,.csv" onChange={(e) => { setFile(e.target.files[0] || null); setPreview(null) }} />
        <div className="toolbar" style={{ marginTop: 12 }}>
          <button disabled={!file || busy} onClick={() => run(true)}>Preview (dry run)</button>
          <button disabled={!preview || busy} onClick={() => run(false)}>Confirm import</button>
        </div>
      </div>

      {preview && (
        <div className="card" style={{ maxWidth: 720 }}>
          <h3>Preview</h3>
          <div className="statgrid">
            <div className="stat"><div className="num">{preview.total_rows}</div><div className="label">Rows read</div></div>
            <div className="stat"><div className="num">{preview.created}</div><div className="label">Will be created</div></div>
            <div className="stat"><div className="num">{preview.validated}</div><div className="label">→ Validated</div></div>
            <div className="stat"><div className="num">{preview.pending}</div><div className="label">→ Pending validation</div></div>
            <div className="stat"><div className="num">{preview.row_errors.length}</div><div className="label">Rows with errors</div></div>
          </div>
          {preview.created_vendors.length > 0 && (
            <p className="hint">New vendors: {preview.created_vendors.join(', ')}</p>
          )}
          {preview.created_departments.length > 0 && (
            <p className="hint">New departments: {preview.created_departments.join(', ')}</p>
          )}
          {preview.row_errors.length > 0 && (
            <table className="grid">
              <thead><tr><th>Row</th><th>Errors</th></tr></thead>
              <tbody>
                {preview.row_errors.map((e) => (
                  <tr key={e.row}><td>{e.row}</td><td>{e.errors.join('; ')}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="hint">Rows with errors are skipped. Click “Confirm import” to create the rest.</p>
        </div>
      )}
    </div>
  )
}
