import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

// Phase I: what the AI produced, whether a human kept it, how the golden sets
// score, and which prompt/model each feature runs on.

const OUTCOME_BADGE = { accepted: 'VALIDATED', edited: 'warn', rejected: 'REJECTED' }

function Stat({ label, value, tone }) {
  return (
    <div className="stat">
      <div className="num" style={tone === 'bad' ? { color: 'var(--danger, #b5361f)' } : undefined}>{value}</div>
      <div className="label">{label}</div>
    </div>
  )
}

export default function AiGovernance() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('runs')
  const [runs, setRuns] = useState([])
  const [stats, setStats] = useState(null)
  const [evals, setEvals] = useState(null)
  const [registry, setRegistry] = useState(null)
  const [feature, setFeature] = useState('')
  const [unjudged, setUnjudged] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    const p = new URLSearchParams({ limit: '100' })
    if (feature) p.set('feature', feature)
    if (unjudged) p.set('unjudged', 'true')
    api.get(`/ai/runs?${p}`).then((r) => setRuns(r.runs)).catch((e) => setError(e.message))
    api.get('/ai/stats').then(setStats).catch(() => {})
  }, [feature, unjudged])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (isAdmin) api.get('/ai/registry').then((r) => setRegistry(r.features)).catch(() => {})
  }, [isAdmin])

  async function judge(id, outcome) {
    try { await api.post(`/ai/runs/${id}/outcome`, { outcome }); load() }
    catch (e) { setError(e.message) }
  }
  async function runEvals() {
    setRunning(true); setError(null)
    try { setEvals(await api.post('/ai/evals/run')) }
    catch (e) { setError(e.message) }
    finally { setRunning(false) }
  }

  const features = [...new Set(runs.map((r) => r.feature))].sort()

  return (
    <div>
      <h2>AI governance</h2>
      <p className="hint">
        Every AI output is recorded with the model and prompt version that produced it.
        Marking whether you kept it is what turns this into an audit trail — and it is the
        only honest measure of whether the AI is helping.
      </p>
      {error && <div className="error">{error}</div>}

      {stats && (
        <div className="statgrid">
          <Stat label="Runs recorded" value={stats.total_runs} />
          <Stat label="Judged by a human" value={stats.judged} />
          <Stat label="Acceptance rate"
            value={stats.acceptance_rate != null ? `${Math.round(stats.acceptance_rate * 100)}%` : '—'}
            tone={stats.acceptance_rate != null && stats.acceptance_rate < 0.5 ? 'bad' : undefined} />
        </div>
      )}

      <div className="tabs" style={{ margin: '10px 0' }}>
        <button className={`secondary${tab === 'runs' ? ' active' : ''}`} onClick={() => setTab('runs')}>Audit trail</button>
        <button className={`secondary${tab === 'evals' ? ' active' : ''}`} onClick={() => setTab('evals')}>Evals</button>
        {isAdmin && <button className={`secondary${tab === 'registry' ? ' active' : ''}`} onClick={() => setTab('registry')}>Prompts &amp; models</button>}
      </div>

      {tab === 'runs' && (
        <>
          <div className="card">
            <div className="toolbar" style={{ margin: 0, flexWrap: 'wrap' }}>
              <select value={feature} onChange={(e) => setFeature(e.target.value)}>
                <option value="">All features</option>
                {features.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <label style={{ margin: 0, display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 400 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={unjudged}
                  onChange={(e) => setUnjudged(e.target.checked)} /> needs a verdict
              </label>
            </div>
          </div>
          <table className="grid">
            <thead><tr>
              <th>When</th><th>Feature</th><th>Source</th><th>Output</th>
              <th>Model</th><th>Verdict</th>
            </tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="hint" style={{ whiteSpace: 'nowrap' }}>
                    {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                  </td>
                  <td>
                    {r.feature}
                    {!r.ai_used && <span className="badge ARCHIVED" style={{ marginLeft: 4 }} title="Produced by the deterministic fallback, not a model">rule</span>}
                    {r.verified === false && <span className="badge REJECTED" style={{ marginLeft: 4 }}>unverified</span>}
                  </td>
                  <td>{r.entity_type === 'contract' && r.entity_id
                    ? <Link to={`/contracts/${r.entity_id}`}>#{r.entity_id}</Link>
                    : <span className="hint">—</span>}</td>
                  <td className="hint" style={{ maxWidth: 380 }}>{(r.output || '').slice(0, 160)}</td>
                  <td className="hint" style={{ whiteSpace: 'nowrap' }}>
                    {r.model || '—'}<br />{r.prompt_version || ''}
                    {r.latency_ms != null && <> · {r.latency_ms}ms</>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.outcome
                      ? <span className={`badge ${OUTCOME_BADGE[r.outcome] || ''}`}>{r.outcome}</span>
                      : (
                        <div className="toolbar" style={{ margin: 0 }}>
                          <button className="secondary" onClick={() => judge(r.id, 'accepted')} title="Kept as-is">✓</button>
                          <button className="secondary" onClick={() => judge(r.id, 'edited')} title="Kept but edited">✎</button>
                          <button className="danger" onClick={() => judge(r.id, 'rejected')} title="Discarded">✗</button>
                        </div>
                      )}
                  </td>
                </tr>
              ))}
              {runs.length === 0 && <tr><td colSpan="6" className="hint">No AI runs recorded yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}

      {tab === 'evals' && (
        <div className="card">
          <div className="toolbar" style={{ marginTop: 0 }}>
            <h3 style={{ margin: 0 }}>Golden sets</h3>
            <span className="spacer" />
            <button disabled={running} onClick={runEvals}>{running ? 'Running…' : 'Run evals'}</button>
          </div>
          <p className="hint">
            Deterministic checks that need no model, so they can gate a release. The retrieval
            suite guards the defect that motivated Phase&nbsp;G: a paraphrase must outscore
            unrelated text.
          </p>
          {evals && (
            <>
              <div className={evals.ok ? 'success' : 'error'}>
                {evals.ok ? '✓ All suites passing' : '✗ Regressions detected'} — {evals.passed}/{evals.total} checks ({Math.round(evals.score * 100)}%)
              </div>
              <table className="grid" style={{ marginTop: 10 }}>
                <thead><tr><th>Suite</th><th>Passed</th><th>Score</th><th>Failures</th></tr></thead>
                <tbody>
                  {evals.suites.map((s) => (
                    <tr key={s.name}>
                      <td>{s.name}</td>
                      <td>{s.passed}/{s.total}</td>
                      <td>
                        <span className={`badge ${s.failed === 0 ? 'VALIDATED' : 'REJECTED'}`}>
                          {Math.round(s.score * 100)}%
                        </span>
                      </td>
                      <td className="hint">
                        {s.failures.length === 0 ? '—' : (
                          <ul style={{ margin: 0, paddingLeft: 16 }}>
                            {s.failures.map((f, i) => <li key={i}>{f}</li>)}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {tab === 'registry' && registry && (
        <div className="card">
          <h3>Prompts &amp; model routing</h3>
          <p className="hint">
            Each feature runs on its own prompt version and can be routed to its own model.
            Overrides are set in Admin Settings as <code>prompt_&lt;feature&gt;</code> and
            <code> model_&lt;feature&gt;</code>, and the effective version is stamped on every run above.
          </p>
          <table className="grid">
            <thead><tr><th>Feature</th><th>Version</th><th>Model</th><th>Prompt</th></tr></thead>
            <tbody>
              {registry.map((f) => (
                <tr key={f.feature}>
                  <td>
                    {f.feature}
                    {f.cheap_ok && <span className="badge" style={{ marginLeft: 4 }} title="A cheaper model is usually sufficient here">cheap ok</span>}
                  </td>
                  <td>
                    {f.version}
                    {f.customized && <span className="badge warn" style={{ marginLeft: 4 }}>custom</span>}
                  </td>
                  <td className="hint">{f.model || '—'}{f.model_override && <span className="badge warn" style={{ marginLeft: 4 }}>routed</span>}</td>
                  <td className="hint" style={{ maxWidth: 420 }}>
                    <details>
                      <summary>{(f.prompt || '').slice(0, 70)}…</summary>
                      <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{f.prompt}</pre>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
