import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import BarChart from '../components/BarChart'

const inr = (v) => `₹${Number(v).toLocaleString('en-IN')}`

const STAGE_LABEL = {
  DRAFT: 'Drafting', INTERNAL_REVIEW: 'Internal review', SHARED_WITH_VENDOR: 'With vendor',
  NEGOTIATION: 'Negotiation', INTERNAL_APPROVED: 'Approved', OUT_FOR_SIGNATURE: 'Out for signature',
}
const d = (v) => (v == null ? '—' : `${v}d`)

function Tile({ label, s }) {
  return (
    <div className="stat">
      <div className="num">{s && s.avg_days != null ? `${s.avg_days}d` : '—'}</div>
      <div className="label">{label}{s && s.count ? ` · n=${s.count}` : ''}
        {s && s.median_days != null && <span className="hint"> · med {d(s.median_days)} · p90 {d(s.p90_days)}</span>}
      </div>
    </div>
  )
}

function CycleTime({ cycle }) {
  const stages = Object.entries(cycle.stage_durations || {})
  return (
    <div className="card">
      <h3>Cycle time &amp; bottlenecks</h3>
      <p className="hint">Average turnaround across the funnel (median / p90 where available). Time-in-stage builds up
        as drafts move through stages after this release.</p>
      <div className="statgrid">
        <Tile label="Validation turnaround" s={cycle.validation} />
        <Tile label="Approval decision" s={cycle.approvals?.overall} />
        <Tile label="Signature (sent → signed)" s={cycle.signature} />
        <Tile label="Authoring → execution" s={cycle.authoring_to_execution} />
      </div>

      {cycle.in_flight?.length > 0 && (
        <>
          <h4 style={{ margin: '14px 0 4px' }}>In-flight drafts by stage (aging)</h4>
          <table className="grid">
            <thead><tr><th>Stage</th><th>Open</th><th>Avg age</th><th>Oldest</th></tr></thead>
            <tbody>
              {cycle.in_flight.map((r) => (
                <tr key={r.stage}>
                  <td>{STAGE_LABEL[r.stage] || r.stage}</td>
                  <td>{r.count}</td>
                  <td>{d(r.avg_age_days)}</td>
                  <td>{r.max_age_days > 14 ? <span className="badge warn">{d(r.max_age_days)}</span> : d(r.max_age_days)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {stages.length > 0 && (
        <>
          <h4 style={{ margin: '14px 0 4px' }}>Average time in stage</h4>
          <BarChart data={stages.map(([s, v]) => ({ label: STAGE_LABEL[s] || s, value: v.avg_days || 0 }))} format={(v) => `${v}d`} />
        </>
      )}
    </div>
  )
}

function SpendSummary({ summary }) {
  if (!summary || summary.by_currency.length === 0) return null
  const fmt = (cur, n) => `${cur} ${Number(n).toLocaleString('en-IN')}`
  return (
    <div className="card">
      <h3>Spend under management <span className="hint">— {summary.active_contracts} active contract(s)</span></h3>
      {summary.base_currency && summary.spend_under_management_base != null && (
        <p className="hint">Normalized total: <strong>{summary.base_currency} {Number(summary.spend_under_management_base).toLocaleString('en-IN')}</strong> (using admin FX rates)</p>
      )}
      <table className="grid">
        <thead><tr><th>Currency</th><th>Under management</th><th>Paid</th><th>Invoiced</th><th>Scheduled</th><th>Outstanding</th><th>Savings</th></tr></thead>
        <tbody>
          {summary.by_currency.map((b) => (
            <tr key={b.currency}>
              <td><strong>{b.currency}</strong></td>
              <td>{fmt(b.currency, b.spend_under_management)}</td>
              <td>{fmt(b.currency, b.paid)}</td>
              <td>{fmt(b.currency, b.invoiced)}</td>
              <td>{fmt(b.currency, b.scheduled)}</td>
              <td>{fmt(b.currency, b.outstanding)}</td>
              <td className={b.savings > 0 ? 'stat-good' : undefined}>{fmt(b.currency, b.savings)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Reports() {
  const [departments, setDepartments] = useState([])
  const [spend, setSpend] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [conc, setConc] = useState(null)
  const [days, setDays] = useState(90)
  const [deptId, setDeptId] = useState('')
  const [q, setQ] = useState('')
  const [search, setSearch] = useState(null)
  const [cycle, setCycle] = useState(null)
  const [spendSummary, setSpendSummary] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    api.get('/departments').then(setDepartments).catch(() => {})
    api.get('/reports/vendor-spend').then(setSpend).catch((e) => setError(e.message))
    api.get('/reports/value-analytics').then(setAnalytics).catch(() => {})
    api.get('/reports/vendor-concentration').then(setConc).catch(() => {})
    api.get('/reports/cycle-time').then(setCycle).catch(() => {})
    api.get('/payments/summary').then(setSpendSummary).catch(() => {})
  }, [])

  async function doSearch(e) {
    e.preventDefault()
    try {
      setSearch(await api.get(`/search?q=${encodeURIComponent(q)}`))
    } catch (err) { setError(err.message) }
  }

  return (
    <div>
      <h2>Reports &amp; Search</h2>
      {error && <div className="error">{error}</div>}

      {cycle && <CycleTime cycle={cycle} />}
      {spendSummary && <SpendSummary summary={spendSummary} />}

      <div className="card">
        <h3>Global search</h3>
        <form className="toolbar" onSubmit={doSearch}>
          <input placeholder="Vendors, PO numbers, departments, services…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button>Search</button>
        </form>
        {search && (
          <>
            <h4>Vendors ({search.vendors.length})</h4>
            <ul>{search.vendors.map((v) => <li key={v.id}><Link to={`/vendors/${v.id}`}>{v.name}</Link></li>)}</ul>
            <h4>Contracts ({search.contracts.length})</h4>
            <table className="grid">
              <tbody>
                {search.contracts.map((c) => (
                  <tr key={c.sr_no}>
                    <td><Link to={`/contracts/${c.sr_no}`}>#{c.sr_no}</Link></td>
                    <td>{c.vendor_name}</td><td>{c.po_number}</td><td>{c.contract_service}</td><td>{c.end_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(search.text_matches || []).length > 0 && (
              <>
                <h4>In document text ({search.text_matches.length})</h4>
                {search.text_matches.map((c) => (
                  <div key={c.sr_no} style={{ marginBottom: 8 }}>
                    <Link to={`/contracts/${c.sr_no}`}>#{c.sr_no} — {c.vendor_name || 'contract'}</Link>
                    {c.snippet && <div className="snippet">{c.snippet}</div>}
                  </div>
                ))}
              </>
            )}
            {(search.drafts || []).length > 0 && (
              <>
                <h4>Drafts ({search.drafts.length})</h4>
                <ul>{search.drafts.map((d) => (
                  <li key={d.id}>
                    <Link to={`/authoring/drafts/${d.id}`}>{d.title || `Draft #${d.id}`}</Link>
                    <span className="hint"> · {d.contract_type || '—'} · {d.status}</span>
                  </li>
                ))}</ul>
              </>
            )}
            {(search.clauses || []).length > 0 && (
              <>
                <h4>Clauses ({search.clauses.length})</h4>
                {search.clauses.map((cl) => (
                  <div key={cl.id} style={{ marginBottom: 8 }}>
                    <Link to="/authoring/clauses"><strong>{cl.clause_type}</strong></Link>
                    <span className="hint"> · {cl.label}</span>
                    {cl.playbook_tier && <span className="badge" style={{ marginLeft: 4 }}>{cl.playbook_tier}</span>}
                    <div className="snippet">{cl.snippet}</div>
                  </div>
                ))}
              </>
            )}
            {(search.obligations || []).length > 0 && (
              <>
                <h4>Obligations ({search.obligations.length})</h4>
                <ul>{search.obligations.map((o) => (
                  <li key={o.id}>
                    <Link to={`/contracts/${o.contract_id}`}>{o.title}</Link>
                    <span className="hint"> · #{o.contract_id} · {o.obligation_type || '—'} · due {o.due_date || '—'}</span>
                  </li>
                ))}</ul>
              </>
            )}
          </>
        )}
      </div>

      {analytics && (
        <div className="card">
          <h3>Contract value analytics</h3>
          <div className="statgrid">
            <div className="stat"><div className="num">{inr(analytics.total_value)}</div><div className="label">Total active contract value</div></div>
            <div className="stat"><div className="num">{analytics.total_count}</div><div className="label">Active validated contracts</div></div>
          </div>
          <div className="split">
            <div className="pane">
              <h4>Value by department</h4>
              <BarChart data={analytics.by_department.map((d) => ({ label: d.label, value: d.value }))} format={inr} />
            </div>
            <div className="pane">
              <h4>Value by contract type</h4>
              <BarChart data={analytics.by_type.map((d) => ({ label: d.label, value: d.value }))} format={inr} />
            </div>
          </div>
          <h4 style={{ marginTop: 12 }}>Expiring value over the next 12 months</h4>
          <BarChart
            data={analytics.expiring_value_by_month.map((m) => ({
              label: new Date(`${m.month}-01`).toLocaleString('default', { month: 'short', year: '2-digit' }),
              value: m.value,
            }))}
            format={inr}
          />
          <h4 style={{ marginTop: 12 }}>Top vendors by value</h4>
          <table className="grid">
            <thead><tr><th>Vendor</th><th>Contracts</th><th>Total value</th></tr></thead>
            <tbody>
              {analytics.top_vendors.map((v) => (
                <tr key={v.vendor_id}>
                  <td><Link to={`/vendors/${v.vendor_id}`}>{v.label}</Link></td>
                  <td>{v.count}</td>
                  <td>{inr(v.value)}</td>
                </tr>
              ))}
              {analytics.top_vendors.length === 0 && <tr><td colSpan={3} className="hint">No valued contracts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {conc && conc.vendor_count > 0 && (
        <div className="card">
          <h3>Vendor concentration / dependency risk</h3>
          <div className="statgrid">
            <div className="stat"><div className="num">{(conc.hhi * 10000).toFixed(0)}</div><div className="label">HHI {conc.hhi > 0.25 ? '(highly concentrated)' : conc.hhi > 0.15 ? '(moderate)' : '(diversified)'}</div></div>
            <div className="stat"><div className="num">{(conc.top_share * 100).toFixed(1)}%</div><div className="label">Largest vendor share</div></div>
            <div className="stat"><div className="num">{conc.vendors_for_80pct}</div><div className="label">Vendors making 80% of spend</div></div>
          </div>
          <table className="grid">
            <thead><tr><th>Vendor</th><th>Value</th><th>Share</th><th>Cumulative</th><th></th></tr></thead>
            <tbody>
              {conc.vendors.slice(0, 15).map((v) => (
                <tr key={v.vendor_id}>
                  <td><Link to={`/vendors/${v.vendor_id}`}>{v.vendor}</Link></td>
                  <td>{inr(v.value)}</td>
                  <td>{(v.share * 100).toFixed(1)}%</td>
                  <td>{(v.cumulative_share * 100).toFixed(1)}%</td>
                  <td>{v.over_threshold && <span className="badge warn">over {(conc.threshold * 100).toFixed(0)}%</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>Exports (15-column register format)</h3>
        <div className="toolbar">
          <button onClick={() => api.download('/reports/register', 'contract_register.xlsx')}>Full contract register</button>
        </div>
        <div className="toolbar">
          <select value={days} onChange={(e) => setDays(e.target.value)}>
            <option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option>
          </select>
          <button onClick={() => api.download(`/reports/expiry?days=${days}`, `expiry_report_${days}d.xlsx`)}>Expiry report</button>
        </div>
        <div className="toolbar">
          <select value={deptId} onChange={(e) => setDeptId(e.target.value)}>
            <option value="">— department —</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button disabled={!deptId} onClick={() => api.download(`/reports/department/${deptId}`, 'department_report.xlsx')}>
            Department-wise report
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Vendor-wise spend</h3>
        <table className="grid">
          <thead><tr><th>Vendor</th><th>Contracts</th><th>Total value</th></tr></thead>
          <tbody>
            {spend.map((r) => (
              <tr key={r.vendor_id}>
                <td><Link to={`/vendors/${r.vendor_id}`}>{r.vendor}</Link></td>
                <td>{r.contract_count}</td>
                <td>{r.total_value.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
