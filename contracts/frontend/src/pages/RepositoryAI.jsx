import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

// Repository-scale AI (G6): semantic search + "chat with contracts". Both run
// offline (deterministic embeddings + fallback answers) and light up further
// when a model is configured in Admin Settings.

function Citations({ items }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{ marginTop: 8 }}>
      <div className="hint">Sources</div>
      {items.map((c) => (
        <div key={c.sr_no} className="thread-msg">
          <Link to={`/contracts/${c.sr_no}`}><strong>#{c.sr_no}</strong> {c.vendor_name || 'Contract'}</Link>
          {c.summary && <div className="hint">{c.summary}</div>}
        </div>
      ))}
    </div>
  )
}

export default function RepositoryAI() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('search')
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  // Search
  const [q, setQ] = useState('')
  const [results, setResults] = useState(null)
  const [searching, setSearching] = useState(false)

  // Ask
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState(null)
  const [asking, setAsking] = useState(false)

  // Index health + compare
  const [index, setIndex] = useState(null)
  const [compareIds, setCompareIds] = useState('')
  const [compareAttrs, setCompareAttrs] = useState('counterparty, value, end, liability cap')
  const [comparison, setComparison] = useState(null)

  const loadIndex = () => api.get('/repo-ai/index-status').then(setIndex).catch(() => {})
  useEffect(() => { loadIndex() }, [])

  async function runCompare() {
    const ids = compareIds.split(',').map((s) => parseInt(s.trim(), 10)).filter(Boolean)
    if (ids.length === 0) return
    setError(null)
    try {
      setComparison(await api.post('/repo-ai/compare', {
        sr_nos: ids,
        attributes: compareAttrs.split(',').map((s) => s.trim()).filter(Boolean),
      }))
    } catch (e) { setError(e.message) }
  }

  async function runSearch() {
    if (!q.trim()) return
    setSearching(true); setError(null)
    try { setResults(await api.get(`/repo-ai/search?q=${encodeURIComponent(q.trim())}&limit=15`)) }
    catch (e) { setError(e.message) }
    finally { setSearching(false) }
  }
  async function runAsk() {
    if (!question.trim()) return
    setAsking(true); setError(null); setAnswer(null)
    try { setAnswer(await api.post('/repo-ai/ask', { question: question.trim() })) }
    catch (e) { setError(e.message) }
    finally { setAsking(false) }
  }
  async function reindex() {
    setError(null); setMessage('Indexing…')
    try {
      const r = await api.post('/repo-ai/reindex')
      setMessage(`Indexed ${r.indexed} contract(s). ${r.remaining} remaining${r.remaining ? ' — run again to continue.' : '.'}`)
    } catch (e) { setError(e.message); setMessage(null) }
  }

  return (
    <div>
      <div className="toolbar" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Repository AI</h2>
        <span className="spacer" />
        {isAdmin && <button className="secondary" onClick={reindex} title="Build abstracts + search index for validated contracts">Re-index repository</button>}
      </div>
      <p className="hint">Search the whole repository by meaning, or ask a question and get an answer with citations. Works offline; richer with a model configured in Admin Settings.</p>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      {index && index.stale > 0 && (
        <div className="error" style={{ background: 'var(--warn-bg, #fff6e5)', color: 'inherit' }}>
          {index.stale} of {index.total} contract(s) are not in the current search index
          ({index.provider}). They can’t be found until you re-index.
          {isAdmin && <> <button className="secondary" style={{ marginLeft: 8 }} onClick={async () => { await reindex(); loadIndex() }}>Re-index now</button></>}
        </div>
      )}

      <div className="tabs" style={{ margin: '10px 0' }}>
        <button className={`secondary${tab === 'search' ? ' active' : ''}`} onClick={() => setTab('search')}>Semantic search</button>
        <button className={`secondary${tab === 'ask' ? ' active' : ''}`} onClick={() => setTab('ask')}>Ask contracts</button>
        <button className={`secondary${tab === 'compare' ? ' active' : ''}`} onClick={() => setTab('compare')}>Compare</button>
      </div>

      {tab === 'search' && (
        <div className="card">
          <div className="toolbar" style={{ margin: 0 }}>
            <input placeholder="e.g. medical imaging with an uptime SLA" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') runSearch() }} style={{ flex: 1 }} />
            <button disabled={searching || !q.trim()} onClick={runSearch}>{searching ? 'Searching…' : 'Search'}</button>
          </div>
          {results && (
            <table className="grid" style={{ marginTop: 10 }}>
              <thead><tr><th>#</th><th>Counterparty</th><th>Type</th><th>Why it matched</th><th>Score</th></tr></thead>
              <tbody>
                {results.results.map((r) => (
                  <tr key={r.sr_no}>
                    <td><Link to={`/contracts/${r.sr_no}`}>#{r.sr_no}</Link></td>
                    <td>{r.vendor_name || '—'}</td>
                    <td>{r.contract_type || '—'}</td>
                    <td className="hint">{r.summary || r.contract_service || '—'}{r.keyword_hit && <span className="badge VALIDATED" style={{ marginLeft: 4 }}>keyword</span>}</td>
                    <td>{Math.round(r.score * 100)}%</td>
                  </tr>
                ))}
                {results.results.length === 0 && <tr><td colSpan="5" className="hint">No matches. {results.indexed_count === 0 ? 'Nothing indexed yet — re-index the repository.' : ''}</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'ask' && (
        <div className="card">
          <div className="toolbar" style={{ margin: 0 }}>
            <input placeholder="Ask across all contracts… e.g. which vendors have a 60-day notice period?" value={question}
              onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') runAsk() }} style={{ flex: 1 }} />
            <button disabled={asking || !question.trim()} onClick={runAsk}>{asking ? 'Thinking…' : 'Ask'}</button>
          </div>
          {answer && (
            <div style={{ marginTop: 10 }}>
              {!answer.ai && <span className="badge ARCHIVED" title="No model configured — showing the most relevant contracts">offline</span>}
              {answer.ai && (answer.verified
                ? <span className="badge VALIDATED" title="Every citation was checked against the retrieved sources">✓ citations verified</span>
                : <span className="badge REJECTED" title="Some citations could not be verified against the sources">⚠ unverified citations</span>)}
              <div className="snippet" style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{answer.answer}</div>
              {answer.citation_report && (answer.citation_report.problems || []).length > 0 && (
                <div className="error" style={{ marginTop: 8 }}>
                  <strong>Unverified claims</strong>
                  <ul style={{ margin: '6px 0 0' }}>
                    {answer.citation_report.problems.map((p, i) => (
                      <li key={i}>[#{p.contract_id}] {p.reason} <span className="hint">“{p.sentence}”</span></li>
                    ))}
                  </ul>
                </div>
              )}
              <Citations items={answer.citations} />
            </div>
          )}
        </div>
      )}

      {tab === 'compare' && (
        <div className="card">
          <p className="hint">Compare contracts side by side. Structured fields come from the register; free-text attributes (e.g. “liability cap”) are located in each document.</p>
          <div className="toolbar" style={{ margin: 0, flexWrap: 'wrap' }}>
            <input placeholder="Contract numbers, e.g. 12, 34, 56" value={compareIds}
              onChange={(e) => setCompareIds(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
            <input placeholder="Attributes, comma-separated" value={compareAttrs}
              onChange={(e) => setCompareAttrs(e.target.value)} style={{ flex: 2, minWidth: 220 }} />
            <button disabled={!compareIds.trim()} onClick={runCompare}>Compare</button>
          </div>
          {comparison && (
            <div style={{ overflowX: 'auto', marginTop: 12 }}>
              <table className="grid">
                <thead><tr><th>Contract</th>{comparison.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {comparison.rows.map((r) => (
                    <tr key={r.sr_no}>
                      <td><Link to={`/contracts/${r.sr_no}`}>#{r.sr_no}</Link><div className="hint">{r.vendor_name}</div></td>
                      {comparison.columns.map((c) => (
                        <td key={c.key} className="hint">{r.cells[c.key] || '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
