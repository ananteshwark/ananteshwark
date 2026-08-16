import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { usePersistedState, clearPersisted } from '../usePersistedState'

const STATUSES = ['', 'QUEUED', 'EXTRACTING', 'EXTRACTED', 'PENDING_VALIDATION', 'VALIDATED', 'DUPLICATE', 'FAILED']
const K = 'cms_filters_ingestion'

export default function IngestionLog() {
  const { canValidate } = useAuth()
  const [searchParams] = useSearchParams()
  const [status, setStatus] = usePersistedState(`${K}_status`, '')
  const [q, setQ] = usePersistedState(`${K}_q`, '')
  const [page, setPage] = useState(0)
  // A ?status= link (e.g. from the dashboard) overrides the persisted filter.
  useEffect(() => { const s = searchParams.get('status'); if (s) setStatus(s) }, [searchParams])
  const [data, setData] = useState({ total: 0, items: [] })
  const [usage, setUsage] = useState(null)
  const [error, setError] = useState(null)
  const PAGE = 50

  const load = useCallback(() => {
    const params = new URLSearchParams({ limit: PAGE, offset: page * PAGE })
    if (status) params.set('status', status)
    if (q) params.set('q', q)
    api.get(`/ingestion?${params}`).then(setData).catch((e) => setError(e.message))
    api.get('/ingestion/token-usage').then(setUsage).catch(() => {})
  }, [status, q, page])

  useEffect(() => { setPage(0) }, [status, q])

  useEffect(() => {
    load()
    const timer = setInterval(load, 10000)
    return () => clearInterval(timer)
  }, [load])

  const maxPage = Math.max(0, Math.ceil(data.total / PAGE) - 1)

  async function retry(id, secondary = false) {
    try {
      await api.post(`/ingestion/${id}/retry${secondary ? '?secondary=true' : ''}`)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      <h2>Ingestion Log</h2>
      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => <option key={s} value={s}>{s || 'All statuses'}</option>)}
        </select>
        <input placeholder="Search filename…" value={q} onChange={(e) => setQ(e.target.value)} />
        {(status || q) && (
          <button className="secondary" onClick={() => { setStatus(''); setQ(''); clearPersisted(`${K}_status`, `${K}_q`) }}>Clear filters</button>
        )}
        <span className="hint">{data.total} file(s) · auto-refreshes</span>
        {usage && usage.files_processed > 0 && (
          <span className="hint" style={{ marginLeft: 'auto' }}>
            {usage.total_tokens.toLocaleString()} tokens across {usage.files_processed} processed file(s)
            ({usage.input_tokens.toLocaleString()} in / {usage.output_tokens.toLocaleString()} out)
          </span>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      <table className="grid">
        <thead>
          <tr>
            <th>File</th><th>Source</th><th>Subfolder</th><th>Status</th><th>Confidence</th><th>Completeness</th><th>Tokens</th><th>Detected</th><th>Processed</th>
            <th>Contract</th><th>Error / notes</th><th></th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((f) => (
            <tr key={f.id}>
              <td title={f.path}>{f.filename}<div className="hint">{(f.size_bytes / 1024).toFixed(0)} KB · {f.sha256.slice(0, 10)}…</div></td>
              <td><span className="badge">{f.source === 'GDRIVE' ? 'Google Drive' : 'Local'}</span></td>
              <td>{f.subfolder}</td>
              <td><span className={`badge ${f.status}`}>{f.status}</span></td>
              <td>
                {f.min_confidence != null ? (
                  <span className={`badge ${f.low_confidence ? 'warn' : 'VALIDATED'}`}
                    title={f.low_confidence ? 'Low confidence — consider retrying (optionally with a more accurate model)' : ''}>
                    {(f.min_confidence * 100).toFixed(0)}%
                  </span>
                ) : '—'}
              </td>
              <td>
                {f.completeness != null ? (
                  <span title={`${f.completeness}% of key fields filled`}>
                    <div className="progressbar"><div style={{ width: `${f.completeness}%` }} /></div>
                    <span className="hint"> {f.completeness}%</span>
                  </span>
                ) : '—'}
              </td>
              <td>
                {f.total_tokens != null ? (
                  <span title={`${f.input_tokens ?? '?'} in / ${f.output_tokens ?? '?'} out`}>
                    {f.total_tokens.toLocaleString()}
                  </span>
                ) : '—'}
              </td>
              <td>{new Date(f.detected_at).toLocaleString()}</td>
              <td>{f.processed_at ? new Date(f.processed_at).toLocaleString() : '—'}</td>
              <td>{f.contract_id ? <Link to={`/contracts/${f.contract_id}`}>#{f.contract_id}</Link> : '—'}</td>
              <td>
                {f.error}
                {f.duplicate_of_id && <div className="hint">Original ingestion: #{f.duplicate_of_id}</div>}
              </td>
              <td>
                <div className="toolbar" style={{ margin: 0 }}>
                  {canValidate && (f.status === 'FAILED' || f.low_confidence) && (
                    <button onClick={() => retry(f.id)}
                      title={f.low_confidence ? 'Re-extract this low-confidence file (uses the currently configured model — switch to a more accurate one in Admin Settings for better results)' : 'Retry extraction'}>
                      Retry
                    </button>
                  )}
                  {canValidate && data.secondary_enabled && (f.status === 'FAILED' || (f.completeness != null && f.completeness < 50)) && (
                    <button className="secondary" onClick={() => retry(f.id, true)}
                      title="Re-extract with the second AI extractor configured in Admin Settings">
                      Retry with 2nd AI
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <button className="secondary" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</button>
        <span className="hint">Page {page + 1} of {maxPage + 1}</span>
        <button className="secondary" disabled={page >= maxPage} onClick={() => setPage((p) => p + 1)}>Next →</button>
      </div>
    </div>
  )
}
