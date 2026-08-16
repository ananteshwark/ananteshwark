import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import BarChart from '../components/BarChart'
import { Skeleton, TextSkeleton } from '../components/Skeleton'

const inr = (v) => v.toLocaleString('en-IN')

function ContractSearch() {
  const [vendor, setVendor] = useState('')
  const [month, setMonth] = useState('')
  const [results, setResults] = useState(null)
  const [vendors, setVendors] = useState([])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function search(e) {
    e?.preventDefault()
    if (!vendor && !month) return
    setBusy(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (vendor) params.set('q', vendor)
      if (month) params.set('expiry_month', month)
      const res = await api.get(`/contracts?${params}`)
      setResults(res)
      setVendors(vendor ? await api.get(`/vendors?q=${encodeURIComponent(vendor)}`) : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h3>Search contracts</h3>
      <form className="toolbar" onSubmit={search}>
        <input placeholder="Vendor name…" value={vendor} onChange={(e) => setVendor(e.target.value)} style={{ minWidth: 220 }} />
        <label style={{ margin: 0, whiteSpace: 'nowrap' }}>Expiring in month:</label>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button disabled={busy || (!vendor && !month)}>Search</button>
        {results && (
          <button type="button" className="secondary" onClick={() => { setResults(null); setVendors([]); setVendor(''); setMonth('') }}>
            Clear
          </button>
        )}
      </form>
      {error && <div className="error">{error}</div>}
      {results && (
        <>
          {vendors.length > 0 && (
            <p>
              Matching vendors:{' '}
              {vendors.slice(0, 8).map((v, i) => (
                <span key={v.id}>{i > 0 && ' · '}<Link to={`/vendors/${v.id}`}>{v.name}</Link></span>
              ))}
            </p>
          )}
          <p className="hint">{results.total} contract(s) found{month ? ` expiring in ${month}` : ''}</p>
          <table className="grid">
            <thead>
              <tr><th>#</th><th>Vendor</th><th>Service</th><th>Department</th><th>End date</th><th>Value</th><th>Status</th></tr>
            </thead>
            <tbody>
              {results.items.map((c) => (
                <tr key={c.sr_no}>
                  <td><Link to={`/contracts/${c.sr_no}`}>{c.sr_no}</Link></td>
                  <td>{c.vendor_name}</td>
                  <td>{c.contract_service}</td>
                  <td>{c.department_name || '—'}</td>
                  <td>{c.end_date || '—'}</td>
                  <td>{c.contract_value != null ? `${c.currency} ${c.contract_value.toLocaleString('en-IN')}` : '—'}</td>
                  <td><span className={`badge ${c.status}`}>{c.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}

function toQuery(params) {
  const p = new URLSearchParams()
  Object.entries(params || {}).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, v) })
  return p.toString()
}

function SavedViews() {
  const [views, setViews] = useState([])
  useEffect(() => { api.get('/saved-filters').then(setViews).catch(() => {}) }, [])
  if (views.length === 0) return null
  return (
    <div className="card">
      <h3>Saved views</h3>
      <div className="toolbar" style={{ margin: 0 }}>
        {views.map((v) => (
          <Link key={v.id} className="btn secondary" to={`/contracts?${toQuery(v.params)}`}>{v.name}</Link>
        ))}
      </div>
    </div>
  )
}

function MyTasks() {
  const [tasks, setTasks] = useState([])
  useEffect(() => { api.get('/tasks?mine=true&status=open').then((r) => setTasks(r.tasks)).catch(() => {}) }, [])
  if (tasks.length === 0) return null
  const today = new Date().toISOString().slice(0, 10)
  return (
    <div className="card">
      <h3>My open tasks <span className="badge warn">{tasks.length}</span></h3>
      <table className="grid">
        <thead><tr><th>Task</th><th>Due</th><th>Priority</th></tr></thead>
        <tbody>
          {tasks.slice(0, 6).map((t) => (
            <tr key={t.id}>
              <td>{t.title}</td>
              <td>{t.due_date ? (t.due_date < today ? <span className="badge REJECTED">{t.due_date}</span> : t.due_date) : '—'}</td>
              <td>{t.priority === 'high' ? <span className="badge warn">high</span> : t.priority}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link className="btn secondary" to="/tasks" style={{ marginTop: 8 }}>All tasks →</Link>
    </div>
  )
}

function Workload() {
  const [wl, setWl] = useState(null)
  useEffect(() => { api.get('/dashboard/workload').then(setWl).catch(() => {}) }, [])
  if (!wl || wl.total_pending === 0) return null
  return (
    <div className="card">
      <h3>Validator workload</h3>
      <p className="hint">
        {wl.total_pending} pending validation{wl.unassigned_pending ? ` · ${wl.unassigned_pending} unassigned` : ''}.
        “Stale” = waiting more than 7 days.
      </p>
      <table className="grid">
        <thead><tr><th>Assignee</th><th>Pending</th><th>Stale (&gt;7d)</th><th>With end date</th></tr></thead>
        <tbody>
          {wl.rows.map((r) => (
            <tr key={r.assignee_id ?? 'unassigned'}>
              <td>{r.unassigned ? <em>Unassigned</em> : r.assignee_name}</td>
              <td>{r.pending}</td>
              <td>{r.stale > 0 ? <span className="badge warn">{r.stale}</span> : r.stale}</td>
              <td>{r.with_end_date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function UpcomingMilestones() {
  const [ms, setMs] = useState([])
  useEffect(() => { api.get('/dashboard/upcoming-milestones').then(setMs).catch(() => {}) }, [])
  if (ms.length === 0) return null
  return (
    <div className="card">
      <h3>Upcoming obligations &amp; milestones</h3>
      <table className="grid">
        <thead><tr><th>Contract</th><th>Vendor</th><th>Milestone</th><th>Due</th></tr></thead>
        <tbody>
          {ms.map((m) => (
            <tr key={m.id}>
              <td><Link to={`/contracts/${m.contract_id}`}>#{m.contract_id}</Link></td>
              <td>{m.vendor || '—'}</td>
              <td>{m.title}</td>
              <td>{m.due_date} {m.overdue && <span className="badge REJECTED">overdue</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// F3: obligations, playbook risk and spend — four phases of work that were
// previously invisible from the landing page.
function PortfolioPanel({ data }) {
  const ob = data.obligations
  const risk = data.risk
  const spend = data.spend
  if (!ob && !risk && !spend) return null
  const money = (n) => Number(n || 0).toLocaleString('en-IN')

  return (
    <div className="split">
      {ob && (
        <div className="pane card">
          <h3>Obligations</h3>
          <div className="statgrid">
            <div className="stat">
              <div className="num"><Link to="/obligations?status=PENDING">{ob.open}</Link></div>
              <div className="label">Open</div>
            </div>
            <div className="stat">
              <div className="num" style={ob.overdue ? { color: 'var(--danger, #b5361f)' } : undefined}>
                <Link to="/obligations?overdue=true">{ob.overdue}</Link>
              </div>
              <div className="label">Overdue</div>
            </div>
            <div className="stat">
              <div className="num">{ob.due_30}</div>
              <div className="label">Due in 30 days</div>
            </div>
          </div>
          {(ob.by_type || []).length > 0 && (
            <p className="hint" style={{ marginTop: 8 }}>
              {ob.by_type.map((t) => `${t.type} ${t.count}`).join(' · ')}
            </p>
          )}
        </div>
      )}

      {risk && (
        <div className="pane card">
          <h3>Playbook risk</h3>
          <div className="statgrid">
            <div className="stat">
              <div className="num"><Link to="/contracts?risk_level=high">{risk.high}</Link></div>
              <div className="label">High risk</div>
            </div>
            <div className="stat">
              <div className="num"><Link to="/contracts?risk_level=medium">{risk.medium}</Link></div>
              <div className="label">Medium</div>
            </div>
            <div className="stat">
              <div className="num"><Link to="/contracts?risk_level=low">{risk.low}</Link></div>
              <div className="label">Low</div>
            </div>
            <div className="stat">
              <div className="num"><Link to="/contracts?legal_hold=true">{risk.legal_hold}</Link></div>
              <div className="label">On legal hold</div>
            </div>
          </div>
          {risk.unscored > 0 && (
            <p className="hint" style={{ marginTop: 8 }}>
              {risk.unscored} contract(s) not yet scored — run a batch score from a contract page.
            </p>
          )}
          {spend && (
            <p className="hint" style={{ marginTop: 8 }}>
              Spend under management: <strong>{spend.base_currency} {money(spend.under_management)}</strong>
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [window, setWindow] = useState('30')
  const [includePending, setIncludePending] = useState(
    () => localStorage.getItem('cms_dash_include_pending') === 'true')

  useEffect(() => {
    setData(null)
    api.get(`/dashboard${includePending ? '?include_pending=true' : ''}`).then(setData).catch((e) => setError(e.message))
  }, [includePending])

  function togglePending(v) {
    setIncludePending(v)
    localStorage.setItem('cms_dash_include_pending', v ? 'true' : 'false')
  }

  if (error) return <div className="error">{error}</div>
  if (!data) {
    return (
      <div>
        <h2>Dashboard</h2>
        <div className="statgrid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div className="stat" key={i}>
              <Skeleton width="48px" height={28} style={{ marginBottom: 8 }} />
              <Skeleton width="80%" height={12} />
            </div>
          ))}
        </div>
        <div className="split">
          <div className="pane card"><Skeleton width="60%" height={16} style={{ marginBottom: 14 }} /><TextSkeleton lines={5} /></div>
          <div className="pane card"><Skeleton width="60%" height={16} style={{ marginBottom: 14 }} /><TextSkeleton lines={5} /></div>
        </div>
      </div>
    )
  }

  const expiring = data.expiring[window]
  return (
    <div>
      <div className="toolbar" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <span className="spacer" />
        <label className="toolbar" style={{ margin: 0, gap: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={includePending}
            onChange={(e) => togglePending(e.target.checked)} />
          Include Pending Validation
        </label>
      </div>
      {includePending && <p className="hint">Figures include contracts still pending validation.</p>}
      <SavedViews />
      <PortfolioPanel data={data} />
      <MyTasks />
      <Workload />
      <UpcomingMilestones />
      <ContractSearch />
      <div className="statgrid">
        <div className="stat">
          <div className="num"><Link to="/contracts?status=PENDING_VALIDATION">{data.pending_validation}</Link></div>
          <div className="label">Contracts pending validation</div>
        </div>
        <div className="stat">
          <div className="num"><Link to="/contracts?status=VALIDATED">{data.total_validated}</Link></div>
          <div className="label">Active validated contracts</div>
        </div>
        <div className="stat">
          <div className="num"><Link to="/contracts?status=VALIDATED&expiring_days=30">{data.expiring['30'].count}</Link></div>
          <div className="label">Expiring in 30 days</div>
        </div>
        <div className="stat">
          <div className="num"><Link to="/contracts?status=VALIDATED&expiring_days=60">{data.expiring['60'].count}</Link></div>
          <div className="label">Expiring in 60 days</div>
        </div>
        <div className="stat">
          <div className="num"><Link to="/contracts?status=VALIDATED&expiring_days=90">{data.expiring['90'].count}</Link></div>
          <div className="label">Expiring in 90 days</div>
        </div>
        <div className="stat">
          <div className="num"><Link to="/ingestion?status=FAILED">{data.failed_extractions.length}</Link></div>
          <div className="label">Failed extractions</div>
        </div>
      </div>

      <div className="split">
        <div className="pane card">
          <h3>Expirations over the next 12 months</h3>
          <BarChart
            data={(data.expiry_by_month || []).map((m) => ({
              label: new Date(`${m.month}-01`).toLocaleString('default', { month: 'short', year: '2-digit' }),
              value: m.count,
            }))}
          />
        </div>
        <div className="pane card">
          <h3>Active contracts by department</h3>
          <BarChart
            data={(data.departments || []).map((d) => ({ label: d.name, value: d.contract_count }))}
          />
        </div>
      </div>

      <div className="card">
        <h3>Active contract value by department</h3>
        <p className="hint">Validated contracts whose end date has not passed.</p>
        <BarChart
          data={(data.departments || []).map((d) => ({ label: d.name, value: d.total_value }))}
          format={inr}
        />
      </div>

      <div className="split">
        <div className="pane card">
          <h3>Active contracts by signing entity</h3>
          <BarChart
            data={(data.entities || []).map((e) => ({ label: e.name, value: e.contract_count }))}
          />
        </div>
        <div className="pane card">
          <h3>Active contract value by signing entity</h3>
          <BarChart
            data={(data.entities || []).map((e) => ({ label: e.name, value: e.total_value }))}
            format={inr}
          />
        </div>
      </div>

      <div className="card">
        <h3>Active contracts &amp; value by signing entity</h3>
        <p className="hint">Validated contracts whose end date has not passed.</p>
        <table className="grid">
          <thead><tr><th>Signing entity</th><th>Contracts</th><th>Total value</th></tr></thead>
          <tbody>
            {(data.entities || []).map((e) => (
              <tr key={e.name}>
                <td>{e.name}</td>
                <td>
                  {e.name === '(unspecified)'
                    ? e.contract_count
                    : <Link to={`/contracts?status=VALIDATED&signing_entity=${encodeURIComponent(e.name)}`}>{e.contract_count}</Link>}
                </td>
                <td>{e.total_value.toLocaleString('en-IN')}</td>
              </tr>
            ))}
            {(data.entities || []).length === 0 && (
              <tr><td colSpan="3" className="hint">No active contracts yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Upcoming expirations by department</h3>
        <div className="toolbar">
          <select value={window} onChange={(e) => setWindow(e.target.value)}>
            <option value="30">Next 30 days</option>
            <option value="60">Next 60 days</option>
            <option value="90">Next 90 days</option>
          </select>
        </div>
        {Object.keys(expiring.by_department).length === 0 && <p className="hint">Nothing expiring in this window.</p>}
        {Object.entries(expiring.by_department).map(([dept, contracts]) => (
          <div key={dept} style={{ marginBottom: 14 }}>
            <strong>{dept}</strong> ({contracts.length})
            <table className="grid">
              <thead>
                <tr><th>#</th><th>Vendor</th><th>Service</th><th>End date</th></tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.sr_no}>
                    <td><Link to={`/contracts/${c.sr_no}`}>#{c.sr_no}</Link></td>
                    <td>{c.vendor_name}</td>
                    <td>{c.contract_service}</td>
                    <td>{c.end_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>Active contracts &amp; value by department</h3>
        <table className="grid">
          <thead><tr><th>Department</th><th>Contracts</th><th>Total value</th></tr></thead>
          <tbody>
            {data.departments.map((d) => (
              <tr key={d.name}>
                <td>{d.name}</td>
                <td>{d.id ? <Link to={`/contracts?status=VALIDATED&department_id=${d.id}`}>{d.contract_count}</Link> : d.contract_count}</td>
                <td>{d.total_value.toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Recent ingestion activity</h3>
        <table className="grid">
          <thead><tr><th>File</th><th>Status</th><th>Detected</th></tr></thead>
          <tbody>
            {data.recent_ingestion.map((f) => (
              <tr key={f.id}>
                <td>{f.filename}</td>
                <td><span className={`badge ${f.status}`}>{f.status}</span></td>
                <td>{new Date(f.detected_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
