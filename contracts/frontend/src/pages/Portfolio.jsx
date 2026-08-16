import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

// Phase J: clause terms as data. "Every contract with uncapped liability" is a
// filter here, not a search that might match a clause saying the opposite.

const PRESETS = [
  { label: 'Uncapped liability', filters: [{ key: 'liability_capped', op: 'eq', value: false }] },
  { label: 'Auto-renewing', filters: [{ key: 'auto_renews', op: 'eq', value: true }] },
  { label: 'Notice ≥ 90 days', filters: [{ key: 'notice_days', op: 'gte', value: 90 }] },
  { label: 'We indemnify them', filters: [{ key: 'indemnity_direction', op: 'eq', value: 'us_to_vendor' }] },
  { label: 'Payment > 45 days', filters: [{ key: 'payment_days', op: 'gt', value: 45 }] },
]

function Stat({ label, value, sub, tone }) {
  return (
    <div className="stat">
      <div className="num" style={tone === 'bad' ? { color: 'var(--danger, #b5361f)' } : undefined}>{value}</div>
      <div className="label">{label}</div>
      {sub && <div className="hint">{sub}</div>}
    </div>
  )
}

function cellText(entry) {
  if (entry == null) return '—'
  const v = entry.value
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

export default function Portfolio() {
  const { canValidate } = useAuth()
  const [catalogue, setCatalogue] = useState(null)
  const [exposure, setExposure] = useState(null)
  const [trend, setTrend] = useState(null)
  const [results, setResults] = useState(null)
  const [filters, setFilters] = useState(PRESETS[0].filters)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)

  const loadHeadline = useCallback(() => {
    api.get('/portfolio/exposure').then(setExposure).catch((e) => setError(e.message))
    api.get('/portfolio/risk-trend?months=12').then(setTrend).catch(() => {})
  }, [])
  useEffect(() => {
    loadHeadline()
    api.get('/portfolio/attributes').then(setCatalogue).catch(() => {})
  }, [loadHeadline])

  async function run(f) {
    setFilters(f); setError(null)
    try { setResults(await api.post('/portfolio/query', { filters: f, limit: 200 })) }
    catch (e) { setError(e.message) }
  }

  // J3: bulk work is bounded per call, so drive it to completion with feedback.
  async function extractAll() {
    setBusy(true); setError(null); setProgress('Starting…')
    try {
      for (let i = 0; i < 50; i++) {
        const r = await api.post('/portfolio/bulk-ai', { operation: 'attributes', limit: 300 })
        setProgress(`Extracted ${r.processed} · ${r.remaining} remaining`)
        if (r.done) break
      }
      setProgress('Done')
      loadHeadline()
      if (results) run(filters)
    } catch (e) { setError(e.message); setProgress(null) }
    finally { setBusy(false) }
  }

  const money = (n) => Number(n || 0).toLocaleString('en-IN')
  const maxHigh = Math.max(1, ...((trend?.series || []).map((b) => b.high_pct)))

  return (
    <div>
      <div className="toolbar" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Portfolio intelligence</h2>
        <span className="spacer" />
        {canValidate && (
          <button className="secondary" disabled={busy} onClick={extractAll}
            title="Read structured clause values out of every contract">
            {busy ? 'Extracting…' : 'Extract clause terms'}
          </button>
        )}
      </div>
      <p className="hint">
        Contract terms held as data — liability caps, notice periods, renewal behaviour —
        so exposure is a filter rather than a reading exercise.
      </p>
      {error && <div className="error">{error}</div>}
      {progress && <div className="success">{progress}</div>}

      {exposure && (
        <>
          {exposure.with_attributes < exposure.total && (
            <div className="error" style={{ background: 'var(--warn-bg, #fff6e5)', color: 'inherit' }}>
              {exposure.total - exposure.with_attributes} of {exposure.total} contract(s) have no
              extracted terms yet — figures below cover only those that do.
            </div>
          )}
          <div className="statgrid">
            <Stat label="Uncapped liability" value={exposure.uncapped_liability.count}
              tone={exposure.uncapped_liability.count ? 'bad' : undefined}
              sub={`${exposure.base_currency} ${money(exposure.uncapped_liability.value_in_base)} exposed`} />
            <Stat label="Auto-renewing" value={exposure.auto_renewing} />
            <Stat label="Notice ≥ 90 days" value={exposure.long_notice_90d_plus} />
            <Stat label="We indemnify them" value={exposure.we_indemnify_them}
              tone={exposure.we_indemnify_them ? 'bad' : undefined} />
          </div>
        </>
      )}

      {trend && trend.series.length > 0 && (
        <div className="card">
          <h3>Risk trend <span className="hint">— share of high-risk contracts by month validated</span></h3>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 120, marginTop: 10 }}>
            {trend.series.map((b) => (
              <div key={b.month} style={{ flex: 1, textAlign: 'center' }} title={`${b.month}: ${b.high} high of ${b.total}`}>
                <div style={{
                  height: `${Math.round((b.high_pct / maxHigh) * 90)}px`,
                  background: b.high_pct >= 40 ? 'var(--danger, #b5361f)' : 'var(--accent, #14508a)',
                  borderRadius: '3px 3px 0 0', minHeight: 2,
                }} />
                <div className="hint" style={{ fontSize: 10, marginTop: 4 }}>{b.month.slice(5)}</div>
              </div>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>
            Now: {trend.current.high} high · {trend.current.medium} medium · {trend.current.low} low
          </p>
        </div>
      )}

      <div className="card">
        <h3>Ask the portfolio</h3>
        <div className="toolbar" style={{ margin: 0, flexWrap: 'wrap' }}>
          {PRESETS.map((p) => (
            <button key={p.label} className="secondary" onClick={() => run(p.filters)}>{p.label}</button>
          ))}
        </div>
        {catalogue && (
          <p className="hint" style={{ marginTop: 8 }}>
            Filterable terms: {catalogue.attributes.map((a) => a.label).join(' · ')}
          </p>
        )}
      </div>

      {results && (
        <>
          <div className="toolbar">
            <strong>{results.total} contract(s) match</strong>
            {results.unextracted > 0 && (
              <span className="hint">({results.unextracted} not yet extracted — may be missing)</span>
            )}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="grid">
              <thead><tr>
                <th>#</th><th>Counterparty</th><th>Type</th><th>Ends</th><th>Risk</th>
                {Object.keys(results.items[0]?.attributes || {}).map((k) => <th key={k}>{k.replace(/_/g, ' ')}</th>)}
              </tr></thead>
              <tbody>
                {results.items.map((r) => (
                  <tr key={r.sr_no}>
                    <td><Link to={`/contracts/${r.sr_no}`}>#{r.sr_no}</Link></td>
                    <td>{r.vendor_name || '—'}</td>
                    <td>{r.contract_type || '—'}</td>
                    <td>{r.end_date || '—'}</td>
                    <td>{r.risk_level
                      ? <span className={`badge ${r.risk_level === 'high' ? 'REJECTED' : r.risk_level === 'medium' ? 'warn' : 'VALIDATED'}`}>{r.risk_level}</span>
                      : '—'}</td>
                    {Object.entries(r.attributes).map(([k, entry]) => (
                      <td key={k} className="hint" title={entry?.evidence || ''}>{cellText(entry)}</td>
                    ))}
                  </tr>
                ))}
                {results.items.length === 0 && (
                  <tr><td colSpan="8" className="hint">Nothing matches — or terms have not been extracted yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>Hover a value to see the clause wording it came from.</p>
        </>
      )}
    </div>
  )
}
