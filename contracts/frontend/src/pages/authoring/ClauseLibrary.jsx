import { useEffect, useState } from 'react'
import { api } from '../../api'
import { useAuth } from '../../auth'
import { confirmDialog } from '../../confirm'

const RISK = ['', 'VENDOR_FAVOURABLE', 'BALANCED', 'COMPANY_FAVOURABLE']
const STATUS = ['', 'DRAFT', 'APPROVED', 'DEPRECATED']
const TIERS = ['standard', 'fallback', 'walkaway']
const TIER_LABEL = { standard: 'Standard', fallback: 'Fallback', walkaway: 'Walk-away' }
const TIER_BADGE = { standard: 'VALIDATED', fallback: 'warn', walkaway: 'REJECTED' }

function TierBadge({ tier }) {
  if (!tier) return null
  return <span className={`badge ${TIER_BADGE[tier] || ''}`} style={{ marginLeft: 4 }} title={`Playbook: ${TIER_LABEL[tier]}`}>{TIER_LABEL[tier]}</span>
}

export default function ClauseLibrary() {
  const { isAdmin, isLegal, canAuthor } = useAuth()
  const [ai, setAi] = useState(null)
  const [taxonomy, setTaxonomy] = useState([])
  const [stats, setStats] = useState([])
  const [rows, setRows] = useState([])
  const [type, setType] = useState('')
  const [risk, setRisk] = useState('')
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [mostUsed, setMostUsed] = useState(false)
  const [curatedMode, setCuratedMode] = useState(false)
  const [playbook, setPlaybook] = useState(null)
  const [selected, setSelected] = useState(null)
  const [polishDraft, setPolishDraft] = useState('')
  const [clusters, setClusters] = useState(null)
  const [challenged, setChallenged] = useState([])
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const loadStats = () => api.get('/clauses/stats').then(setStats).catch(() => {})
  useEffect(() => {
    api.get('/clauses/taxonomy').then((r) => setTaxonomy(r.types)).catch(() => {})
    api.get('/clauses/ai-status').then(setAi).catch(() => {})
    api.get('/authoring/insights/most-challenged').then((r) => setChallenged(r.slice(0, 8))).catch(() => {})
    loadStats()
  }, [])

  useEffect(() => {
    if (curatedMode) {
      const p = new URLSearchParams()
      if (type) p.set('clause_type', type)
      api.get(`/clauses/curated?${p}`).then(setRows).catch((e) => setError(e.message))
      return
    }
    const p = new URLSearchParams()
    if (type) p.set('clause_type', type)
    if (risk) p.set('risk_posture', risk)
    if (status) p.set('status', status)
    if (q) p.set('q', q)
    if (mostUsed) p.set('most_used', 'true')
    const t = setTimeout(() => api.get(`/clauses?${p}`).then(setRows).catch((e) => setError(e.message)), 200)
    return () => clearTimeout(t)
  }, [type, risk, status, q, mostUsed, curatedMode])

  function reload() {
    const p = new URLSearchParams()
    if (type) p.set('clause_type', type)
    if (curatedMode) { api.get(`/clauses/curated?${p}`).then(setRows).catch(() => {}); return }
    if (risk) p.set('risk_posture', risk)
    if (status) p.set('status', status)
    if (q) p.set('q', q)
    if (mostUsed) p.set('most_used', 'true')
    api.get(`/clauses?${p}`).then(setRows).catch(() => {})
  }

  async function open(v) {
    const d = await api.get(`/clauses/${v.id}`).catch(() => null)
    setSelected(d); setPolishDraft(d?.polished_text || '')
  }

  async function act(fn) {
    try { await fn(); setMessage('Updated'); loadStats(); reload(); if (selected) open(selected) }
    catch (e) { setError(e.message) }
  }

  async function loadPlaybook() {
    setError(null)
    try {
      const p = new URLSearchParams()
      if (type) p.set('clause_type', type)
      setPlaybook(await api.get(`/clauses/playbook?${p}`))
    } catch (e) { setError(e.message); setPlaybook(null) }
  }
  async function setTier(id, tier) {
    try { await api.post(`/clauses/versions/${id}/playbook-tier`, { tier }); setMessage('Playbook updated'); loadStats(); reload(); if (selected && selected.id === id) open(selected) }
    catch (e) { setError(e.message) }
  }

  async function findDuplicates() {
    setError(null); setClusters([])
    try {
      const p = new URLSearchParams()
      if (type) p.set('clause_type', type)
      setClusters(await api.get(`/clauses/clusters?${p}`))
    } catch (e) { setError(e.message); setClusters(null) }
  }
  async function mergeInto(keepId, mergeId) {
    try { await api.post('/clauses/versions/merge', { keep_id: keepId, merge_id: mergeId }); setMessage('Merged'); loadStats(); reload(); findDuplicates() }
    catch (e) { setError(e.message) }
  }

  async function curate() {
    setError(null)
    setMessage(`Curating top 5 clause versions${type ? ` for ${type}` : ' across the library'}${ai && ai.enabled ? ` and polishing with ${ai.model}` : ' (deterministic polish)'}…`)
    try {
      const r = await api.post('/clauses/curate', { clause_type: type || null })
      setMessage(`Kept top ${5} per clause: ${r.curated} curated, ${r.polished} polished, ${r.retired || 0} retired.`)
      loadStats(); reload()
    } catch (e) { setError(e.message) }
  }

  async function runLearn(reset) {
    setError(null)
    setMessage(`Learning clauses from existing contracts${ai && ai.enabled ? ` with ${ai.model}` : ''}…`)
    try {
      const r = await api.post(`/clauses/learn${reset ? '?reset=true' : ''}`)
      const aiNote = r.ai ? ` (AI-segmented ${r.ai_used}/${r.processed})` : ' (rule-based)'
      setMessage(`Learned ${r.clauses} clause(s) from ${r.processed} contract(s)${aiNote}.`)
      loadStats()
    } catch (e) { setError(e.message) }
  }

  return (
    <div>
      <h2>Clause Library</h2>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <div className="card">
        <div className="toolbar" style={{ margin: 0 }}>
          <strong>Learned from validated + authored contracts</strong>
          <span className="hint">{stats.reduce((a, s) => a + s.versions, 0)} versions across {stats.length} clause types</span>
          {ai && <span className={`badge ${ai.enabled ? 'VALIDATED' : 'ARCHIVED'}`} title={`Provider: ${ai.provider} · model: ${ai.model || '—'}`}>AI {ai.enabled ? `on (${ai.model})` : 'off'}</span>}
          {isLegal && <button className="secondary" onClick={() => setStatus(status === 'DRAFT' ? '' : 'DRAFT')} title="Clause versions awaiting Legal review">
            {status === 'DRAFT' ? 'Show all' : 'Needs review (Legal)'}
          </button>}
          <button className={`secondary${curatedMode ? ' active' : ''}`} onClick={() => setCuratedMode((c) => !c)}
                  title="Show the curated top-5 versions with AI-polished text">
            {curatedMode ? 'Show all versions' : 'Curated top 5'}
          </button>
          <button className="secondary" onClick={loadPlaybook}
                  title="View the negotiation playbook: standard / fallback / walk-away positions per clause type">
            Playbook{type ? ` · ${type}` : ''}
          </button>
          <span className="spacer" />
          {canAuthor && <button className="secondary" onClick={async () => { if (await confirmDialog('Keep only the 5 most-used versions per clause type and retire the rest? Retired versions are hidden but their history is preserved.')) curate() }}
                                title="Keep the 5 most-used versions per clause type (retire the rest) and AI-polish them">
            Compact to 5 &amp; polish{type ? ` ${type}` : ' all'}
          </button>}
          {canAuthor && <button className="secondary" onClick={findDuplicates}
                                title="Find near-duplicate versions (embedding similarity) to merge">
            Near-duplicates
          </button>}
          {isAdmin && <button className="secondary" onClick={() => runLearn(false)}>Learn new</button>}
          {isAdmin && <button className="secondary" onClick={() => runLearn(true)}>Re-learn all</button>}
        </div>
      </div>

      {challenged.length > 0 && (
        <div className="card">
          <h3>Most challenged clauses <span className="hint">— across all vendor negotiations</span></h3>
          <table className="grid">
            <thead><tr><th>Clause type</th><th>Challenged</th><th>Accepted</th><th>Rejected</th></tr></thead>
            <tbody>
              {challenged.map((c) => (
                <tr key={c.clause_type}>
                  <td><span style={{ cursor: 'pointer', color: '#14508a' }} onClick={() => setType(c.clause_type)}>{c.clause_type}</span></td>
                  <td>{c.challenged}</td><td>{c.accepted}</td><td>{c.rejected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="split">
        <div className="pane" style={{ flex: '0 0 260px' }}>
          <div className="card">
            <h3>Clause types</h3>
            <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
              <div className={`clause-type${type === '' ? ' active' : ''}`} onClick={() => setType('')}>All types</div>
              {taxonomy.map((t) => {
                const s = stats.find((x) => x.clause_type === t)
                return (
                  <div key={t} className={`clause-type${type === t ? ' active' : ''}`} onClick={() => setType(t)}>
                    {t} <span className="hint">{s ? `${s.versions}·${s.usage}` : '0'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <div className="pane">
          <div className="toolbar">
            <input placeholder="Search clause text…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={risk} onChange={(e) => setRisk(e.target.value)}>
              {RISK.map((r) => <option key={r} value={r}>{r || 'Any risk'}</option>)}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS.map((s) => <option key={s} value={s}>{s || 'Any status'}</option>)}
            </select>
            <label style={{ margin: 0, display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 400 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={mostUsed} onChange={(e) => setMostUsed(e.target.checked)} /> most used
            </label>
          </div>
          {curatedMode && <p className="hint">Showing the 5 most-used versions per clause type with AI-polished, editable wording. Open one to edit its polished text.</p>}
          <table className="grid clause-list">
            <thead><tr>
              {curatedMode && <th style={{ width: 32 }}>#</th>}
              <th>Type</th><th>Ver</th><th>Risk</th><th>Status</th><th>Used</th><th /></tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.id}>
                  {curatedMode && <td><span className="badge">{v.curated_rank}</span></td>}
                  <td>
                    {v.clause_type}
                    {v.is_curated && !curatedMode && <span className="badge VALIDATED" style={{ marginLeft: 4 }} title={`Curated #${v.curated_rank}`}>curated</span>}
                    <TierBadge tier={v.playbook_tier} />
                    <div className="hint clause-preview" title={v.text}>
                      {(curatedMode && v.polished_text ? v.polished_text : v.text || '').slice(0, 200)}
                      {((curatedMode && v.polished_text ? v.polished_text : v.text || '').length > 200) ? '…' : ''}
                    </div>
                  </td>
                  <td>{v.label}</td>
                  <td><span className={`riskbadge ${v.risk_posture}`}>{v.risk_posture.replace('_', ' ').toLowerCase()}</span></td>
                  <td><span className={`badge ${v.status === 'APPROVED' ? 'VALIDATED' : v.status === 'DEPRECATED' ? 'REJECTED' : 'PENDING_VALIDATION'}`}>{v.status}</span></td>
                  <td>{v.usage_count}</td>
                  <td><button className="secondary" onClick={() => open(v)}>View</button></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={curatedMode ? 7 : 6} className="hint">{curatedMode ? 'No curated versions yet — click “Curate & polish”.' : 'No clauses — run “Learn new”.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {clusters !== null && (
        <div className="modal-backdrop" onClick={() => setClusters(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Near-duplicate clause versions <span className="hint">— embedding similarity</span></h3>
            {clusters.length === 0 && <p className="hint">No near-duplicate groups found{type ? ` in ${type}` : ''}.</p>}
            {clusters.map((c, i) => (
              <div key={i} className="card" style={{ background: '#f7fafc' }}>
                <strong>{c.clause_type}</strong> <span className="hint">— keep the most-used, merge the rest</span>
                <table className="grid" style={{ marginTop: 6 }}>
                  <tbody>
                    {c.members.map((m) => (
                      <tr key={m.id}>
                        <td>{m.id === c.representative_id ? <span className="badge VALIDATED">keep</span> : ''}</td>
                        <td>{m.label} <span className="hint">used {m.usage_count}</span><div className="hint">{m.text}</div></td>
                        <td>{m.id !== c.representative_id && canAuthor &&
                          <button className="secondary" onClick={() => mergeInto(c.representative_id, m.id)}>Merge into keep</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <div className="toolbar" style={{ marginTop: 10 }}><button className="secondary" onClick={() => setClusters(null)}>Close</button></div>
          </div>
        </div>
      )}

      {playbook !== null && (
        <div className="modal-backdrop" onClick={() => setPlaybook(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860 }}>
            <h3>Negotiation playbook{type ? ` · ${type}` : ''}</h3>
            <p className="hint">Legal's designated positions per clause type. Standard is the preferred wording; fall back in order; never go past walk-away. Set tiers by opening a clause version and choosing its playbook tier.</p>
            {playbook.length === 0 && <p className="hint">No playbook tiers set yet{type ? ` for ${type}` : ''}. Open a clause version (Legal) and set its tier.</p>}
            {playbook.map((g) => (
              <div key={g.clause_type} className="card" style={{ background: 'var(--surface-2, #f7fafc)' }}>
                <strong>{g.clause_type}</strong>
                {TIERS.map((t) => (
                  g.tiers[t].length > 0 && (
                    <div key={t} style={{ marginTop: 6 }}>
                      <TierBadge tier={t} />
                      {g.tiers[t].map((v) => (
                        <div key={v.id} className="snippet" style={{ whiteSpace: 'pre-wrap', margin: '4px 0', fontSize: 13 }}>
                          <div className="toolbar" style={{ margin: 0 }}>
                            <span className="hint">{v.label} · used {v.usage_count}×</span>
                            <span className="spacer" />
                            <button className="linklike" onClick={() => { setPlaybook(null); open(v) }}>Open</button>
                          </div>
                          {(v.polished_text || v.text || '').slice(0, 400)}
                        </div>
                      ))}
                    </div>
                  )
                ))}
              </div>
            ))}
            <div className="toolbar" style={{ marginTop: 10 }}><button className="secondary" onClick={() => setPlaybook(null)}>Close</button></div>
          </div>
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{selected.clause_type} · {selected.label}</h3>
            <div className="toolbar" style={{ margin: '0 0 8px' }}>
              <span className={`riskbadge ${selected.risk_posture}`}>{selected.risk_posture.replace('_', ' ').toLowerCase()}</span>
              <span className={`badge ${selected.status === 'APPROVED' ? 'VALIDATED' : 'PENDING_VALIDATION'}`}>{selected.status}</span>
              <span className="hint">used {selected.usage_count}× · {selected.used_by_vendors} vendor(s) · {selected.used_by_departments} dept(s)</span>
              <span className="spacer" />
              <select defaultValue={selected.risk_posture} onChange={(e) => act(() => api.put(`/clauses/versions/${selected.id}`, { risk_posture: e.target.value }))}>
                {RISK.slice(1).map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button className="secondary" onClick={() => act(() => api.post(`/clauses/versions/${selected.id}/summarize`))}>Summarize (AI)</button>
              {isLegal && <button className="secondary" onClick={() => act(() => api.post(`/clauses/versions/${selected.id}/approve`))}>Approve</button>}
              {isLegal && <button className="secondary" onClick={() => act(() => api.post(`/clauses/versions/${selected.id}/deprecate`))}>Deprecate</button>}
            </div>
            <div className="toolbar" style={{ margin: '0 0 8px', alignItems: 'center' }}>
              <span className="hint">Playbook tier:</span>
              <TierBadge tier={selected.playbook_tier} />
              {isLegal ? (
                <select value={selected.playbook_tier || ''} onChange={(e) => setTier(selected.id, e.target.value || null)}
                        title="Designate this version's negotiation position">
                  <option value="">— not in playbook —</option>
                  {TIERS.map((t) => <option key={t} value={t}>{TIER_LABEL[t]}</option>)}
                </select>
              ) : (!selected.playbook_tier && <span className="hint">not set</span>)}
              <span className="hint">Standard = preferred wording · Fallback = acceptable · Walk-away = last acceptable position.</span>
            </div>
            {selected.summary && <p className="hint">Difference summary: {selected.summary}</p>}
            <h4 style={{ marginBottom: 4 }}>Clause text <span className="hint">— what gets inserted into a draft</span></h4>
            <div className="snippet" style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>{selected.text}</div>
            {selected.original_text && (
              <details style={{ marginTop: 6 }}>
                <summary className="hint" style={{ cursor: 'pointer' }}>
                  Wording before it was polished — kept so this can be undone
                </summary>
                <div className="snippet" style={{ whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto', marginTop: 4 }}>
                  {selected.original_text}
                </div>
                {canAuthor && (
                  <button className="secondary" style={{ marginTop: 6 }}
                    onClick={() => act(() => api.post(`/clauses/versions/${selected.id}/revert-polish`))}>
                    Restore this wording
                  </button>
                )}
              </details>
            )}
            <div className="toolbar" style={{ margin: '10px 0 4px' }}>
              <h4 style={{ margin: 0 }}>Polished text <span className="hint">— AI-enhanced, editable</span></h4>
              <span className="spacer" />
              {canAuthor && <button className="secondary" onClick={async () => {
                try { const d = await api.post(`/clauses/versions/${selected.id}/polish`); setSelected(d); setPolishDraft(d.polished_text || ''); setMessage('Polished') }
                catch (e) { setError(e.message) }
              }}>Polish (AI)</button>}
              {canAuthor && <button onClick={() => act(() => api.put(`/clauses/versions/${selected.id}`, { polished_text: polishDraft }))} disabled={polishDraft === (selected.polished_text || '')}>Save polished</button>}
            </div>
            <p className="hint" style={{ margin: '0 0 4px' }}>
              Saving replaces the clause text above — this wording is what the library serves from then on.
            </p>
            <textarea rows={6} value={polishDraft} onChange={(e) => setPolishDraft(e.target.value)}
                      placeholder="No polished version yet — click “Polish (AI)” or type one." disabled={!canAuthor}
                      style={{ fontFamily: 'inherit', width: '100%' }} />
            {selected.siblings && selected.siblings.length > 0 && (
              <>
                <h4>Other versions</h4>
                <table className="grid">
                  <thead><tr><th>Label</th><th>Risk</th><th>Status</th><th>Used</th><th /></tr></thead>
                  <tbody>
                    {selected.siblings.map((s) => (
                      <tr key={s.id}>
                        <td>{s.label}</td><td>{s.risk_posture}</td><td>{s.status}</td><td>{s.usage_count}</td>
                        <td><button className="secondary" onClick={() => act(() => api.post('/clauses/versions/merge', { keep_id: selected.id, merge_id: s.id }))}>Merge into this</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <div className="toolbar" style={{ marginTop: 10 }}><button className="secondary" onClick={() => setSelected(null)}>Close</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
