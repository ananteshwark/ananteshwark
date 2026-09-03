import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import MultiSelect from '../components/MultiSelect'
import { TableSkeleton } from '../components/Skeleton'
import { confirmDialog } from '../confirm'
import { StartContractModal } from '../components/StartContractOptions'
import { clearPersisted } from '../usePersistedState'

const STORAGE_KEY = 'cms_filters_contracts'

export default function Contracts() {
  const { canValidate, canAuthor, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // Initial values come from the URL first (so shared links / Back work); when
  // the URL carries no filters, fall back to the last-used view saved in
  // localStorage so filters are retained across navigation until cleared.
  const urlEmpty = [...searchParams.keys()].length === 0
  const persisted = (() => {
    if (!urlEmpty) return {}
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
  })()
  const init = (k) => searchParams.get(k) || (persisted[k] != null ? String(persisted[k]) : '')
  const initArr = (k) => {
    const fromUrl = searchParams.getAll(k)
    const v = fromUrl.length ? fromUrl
      : (Array.isArray(persisted[k]) ? persisted[k].map(String)
        : (persisted[k] == null || persisted[k] === '' ? [] : [String(persisted[k])]))
    return v.filter((x) => x !== '' && x != null)  // never carry empty entries into state
  }
  const [data, setData] = useState({ total: 0, items: [] })
  const [departments, setDepartments] = useState([])
  const [types, setTypes] = useState([])
  const [tags, setTags] = useState([])
  const [entities, setEntities] = useState([])
  // Filters are multi-select (arrays). Status defaults to the validated view
  // unless the URL sets it, or explicitly marks "all" (status_all=1).
  const [status, setStatus] = useState(
    searchParams.get('status_all') === '1' ? []
      : (initArr('status').length ? initArr('status')
        : (urlEmpty && 'status' in persisted
          ? (Array.isArray(persisted.status) ? persisted.status.map(String) : [])
          : ['VALIDATED'])))
  const [deptId, setDeptId] = useState(initArr('department_id'))
  const [ctype, setCtype] = useState(initArr('contract_type'))
  const [tagId, setTagId] = useState(initArr('tag_id'))
  const [entity, setEntity] = useState(initArr('signing_entity'))
  const [lifecycle, setLifecycle] = useState(initArr('lifecycle_status'))
  const [phi, setPhi] = useState(init('phi_shared'))   // '' | 'true' | 'false'
  const [riskLevel, setRiskLevel] = useState(initArr('risk_level'))
  const [hold, setHold] = useState(init('legal_hold'))  // '' | 'true' | 'false'
  const [q, setQ] = useState(init('q'))
  const [inText, setInText] = useState(searchParams.get('in_text') === 'true')
  const [expiringDays, setExpiringDays] = useState(init('expiring_days'))
  const [sort, setSort] = useState(init('sort') || 'sr_no')
  const [order, setOrder] = useState(init('order') || 'desc')
  const [page, setPage] = useState(Number(init('page')) || 0)
  const [savedFilters, setSavedFilters] = useState([])
  const [error, setError] = useState(null)
  const [starting, setStarting] = useState(null)   // { title, context } for the four-option chooser
  const [loading, setLoading] = useState(true)
  const PAGE = 50

  const loadSaved = () => api.get('/saved-filters').then(setSavedFilters).catch(() => {})

  useEffect(() => {
    api.get('/departments').then(setDepartments).catch(() => {})
    api.get('/contracts/types').then((r) => setTypes(r.types)).catch(() => {})
    api.get('/tags').then(setTags).catch(() => {})
    api.get('/contracts/signing-entities').then((r) => setEntities(r.entities)).catch(() => {})
    loadSaved()
  }, [])
  // Reset to page 1 when a filter/sort changes — but not on the initial mount,
  // so a page restored from the URL (e.g. via the browser Back button) survives.
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return }
    setPage(0)
  }, [status, deptId, ctype, tagId, entity, lifecycle, phi, riskLevel, hold, q, inText, expiringDays, sort, order])

  // Columns: [label, sortKey]. A null sortKey means the column isn't sortable.
  const COLUMNS = [
    ['#', 'sr_no'], ['Counterparty', 'vendor'], ['Service', 'service'], ['Type', 'type'],
    ['Business Unit', 'location'], ['Tags', null], ['Department', 'department'], ['PO', 'po'],
    ['Start', 'start'], ['End', 'end'], ['Value', 'value'], ['Status', 'status'],
    ['Lifecycle', 'lifecycle'], ['Risk', null], ['', null],
  ]
  function toggleSort(key) {
    if (!key) return
    if (sort === key) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    else { setSort(key); setOrder('asc') }
  }

  // Coerce a saved value (may be a legacy scalar or an array) to a string array.
  const toArr = (v) => (Array.isArray(v) ? v.map(String) : (v == null || v === '' ? [] : [String(v)]))

  // The filter state as a plain object — the shape persisted in saved views AND
  // in localStorage. Captures EVERY filter/sort so a saved view restores exactly.
  function currentParams() {
    return {
      status, department_id: deptId, contract_type: ctype, tag_id: tagId,
      signing_entity: entity, lifecycle_status: lifecycle, phi_shared: phi || '',
      risk_level: riskLevel, legal_hold: hold || '',
      q: q || '', in_text: inText || false,
      expiring_days: expiringDays || '', sort, order,
    }
  }

  function applyParams(p) {
    setStatus(toArr(p.status))
    setDeptId(toArr(p.department_id))
    setCtype(toArr(p.contract_type))
    setTagId(toArr(p.tag_id))
    setEntity(toArr(p.signing_entity))
    setLifecycle(toArr(p.lifecycle_status))
    setPhi(p.phi_shared != null ? String(p.phi_shared) : '')
    setRiskLevel(toArr(p.risk_level))
    setHold(p.legal_hold != null ? String(p.legal_hold) : '')
    setQ(p.q || '')
    setInText(!!p.in_text)
    setExpiringDays(p.expiring_days != null ? String(p.expiring_days) : '')
    if (p.sort) setSort(p.sort)
    if (p.order) setOrder(p.order)
  }

  // Reset every filter to its default and forget the persisted view.
  function clearFilters() {
    setStatus(['VALIDATED']); setDeptId([]); setCtype([]); setTagId([]); setEntity([])
    setLifecycle([]); setPhi(''); setRiskLevel([]); setHold('')
    setQ(''); setInText(false); setExpiringDays('')
    setSort('sr_no'); setOrder('desc'); setPage(0)
    clearPersisted(STORAGE_KEY)
  }

  function buildParams() {
    const p = new URLSearchParams()
    // Skip empty entries — an empty department_id/tag_id would fail int parsing
    // on the backend (these can sneak in from a persisted/saved view).
    const addAll = (key, arr) => (arr || []).forEach((v) => {
      if (v !== '' && v != null) p.append(key, v)
    })
    addAll('status', status)
    addAll('department_id', deptId)
    addAll('contract_type', ctype)
    addAll('tag_id', tagId)
    addAll('signing_entity', entity)
    addAll('lifecycle_status', lifecycle)
    addAll('risk_level', riskLevel)
    if (phi) p.set('phi_shared', phi)
    if (hold) p.set('legal_hold', hold)
    if (q) p.set('q', q)
    if (inText) p.set('in_text', 'true')
    if (expiringDays) p.set('expiring_days', expiringDays)
    return p
  }

  async function saveCurrentView() {
    const name = prompt('Save this filter view as:')
    if (!name || !name.trim()) return
    try {
      await api.post('/saved-filters', { name: name.trim(), params: currentParams() })
      loadSaved()
    } catch (e) { setError(e.message) }
  }

  async function deleteSavedView(id) {
    try {
      await api.del(`/saved-filters/${id}`)
      loadSaved()
    } catch (e) { setError(e.message) }
  }

  // Renewing is still usually a duplicate, so that option arrives pre-selected —
  // but an author who wants to start from the current template, or from the
  // counterparty's paper, no longer has to work around the button.
  function renew(c) {
    setStarting({
      title: `Renew contract #${c.sr_no}`,
      context: { sourceContract: c, linkAs: 'renewal', contractType: c.contract_type || '' },
    })
  }

  async function openDraft(d) {
    setStarting(null)
    if (d.reused && !await confirmDialog('A renewal draft for this contract is already in the queue. Open it?')) return
    navigate(`/authoring/drafts/${d.id}`)
  }

  async function deleteContract(srNo) {
    if (!await confirmDialog(`Delete contract #${srNo}? It moves to Data Retention where it can be restored or purged.`)) return
    setError(null)
    try {
      await api.del(`/contracts/${srNo}`)
      const params = buildParams()
      params.set('sort', sort); params.set('order', order)
      params.set('limit', PAGE); params.set('offset', page * PAGE)
      setData(await api.get(`/contracts?${params}`))
    } catch (e) { setError(e.message) }
  }

  const hasActiveFilter = !!(phi || status.length || deptId.length || ctype.length || tagId.length
    || entity.length || lifecycle.length || q || inText || expiringDays)

  useEffect(() => {
    const t = setTimeout(() => {
      const params = buildParams()
      params.set('sort', sort); params.set('order', order)
      params.set('limit', PAGE); params.set('offset', page * PAGE)
      setLoading(true)
      api.get(`/contracts?${params}`).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [status, deptId, ctype, tagId, entity, lifecycle, phi, riskLevel, hold, q, inText, expiringDays, page, sort, order])

  // Mirror the active filters/sort/page into the URL (replacing history, not
  // stacking entries) so leaving the page and returning via Back restores them.
  useEffect(() => {
    const p = buildParams()
    if (status.length === 0) p.set('status_all', '1')  // mark explicit "All statuses" so Back doesn't re-default
    if (sort !== 'sr_no') p.set('sort', sort)
    if (order !== 'desc') p.set('order', order)
    if (page) p.set('page', String(page))
    setSearchParams(p, { replace: true })
    // Persist the full filter set so it's retained on the next visit until cleared.
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(currentParams())) } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, deptId, ctype, tagId, entity, lifecycle, phi, riskLevel, hold, q, inText, expiringDays, sort, order, page])

  const maxPage = Math.max(0, Math.ceil(data.total / PAGE) - 1)

  return (
    <div>
      <h2>Contracts</h2>
      <div className="toolbar">
        <span className="hint" style={{ fontWeight: 600 }}>Saved views:</span>
        {savedFilters.length === 0 && <span className="hint">none yet</span>}
        {savedFilters.map((f) => (
          <span key={f.id} className="saved-view">
            <button className="secondary" style={{ borderRadius: '10px 0 0 10px' }} onClick={() => applyParams(f.params)}>{f.name}</button>
            <button className="secondary" style={{ borderRadius: '0 10px 10px 0', padding: '7px 8px' }} title="Delete saved view" onClick={() => deleteSavedView(f.id)}>×</button>
          </span>
        ))}
        <span className="spacer" />
        <button className="secondary" disabled={!hasActiveFilter} onClick={clearFilters}>Clear filters</button>
        <button className="secondary" disabled={!hasActiveFilter} onClick={saveCurrentView}>Save current view</button>
      </div>
      <div className="toolbar">
        <MultiSelect allLabel="All statuses" value={status} onChange={setStatus}
          options={['PENDING_VALIDATION', 'VALIDATED', 'REJECTED', 'ARCHIVED']} />
        <MultiSelect allLabel="All lifecycles" value={lifecycle} onChange={setLifecycle}
          options={['ACTIVE', 'EXPIRED', 'RENEWED', 'TERMINATED']} />
        <MultiSelect allLabel="All departments" value={deptId} onChange={setDeptId}
          options={departments.map((d) => ({ value: String(d.id), label: d.name }))} />
        <MultiSelect allLabel="All types" value={ctype} onChange={setCtype} options={types} />
        <MultiSelect allLabel="All signing entities" value={entity} onChange={setEntity} options={entities} />
        <MultiSelect allLabel="All tags" value={tagId} onChange={setTagId}
          options={tags.map((t) => ({ value: String(t.id), label: t.name }))} />
        <select value={phi} onChange={(e) => setPhi(e.target.value)} title="Filter by PHI shared">
          <option value="">PHI: any</option>
          <option value="true">PHI: Yes</option>
          <option value="false">PHI: No</option>
        </select>
        <MultiSelect allLabel="Any risk" value={riskLevel} onChange={setRiskLevel}
          options={[{ value: 'high', label: 'High risk' }, { value: 'medium', label: 'Medium risk' }, { value: 'low', label: 'Low risk' }]} />
        <select value={hold} onChange={(e) => setHold(e.target.value)} title="Filter by legal hold">
          <option value="">Hold: any</option>
          <option value="true">On legal hold</option>
          <option value="false">Not held</option>
        </select>
        <input placeholder="Search vendor / PO / service…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label style={{ margin: 0, display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 400, whiteSpace: 'nowrap' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={inText} onChange={(e) => setInText(e.target.checked)} /> in document text
        </label>
        {expiringDays && (
          <span className="tag-chip" style={{ cursor: 'pointer' }} title="Clear expiry filter"
            onClick={() => setExpiringDays('')}>
            Expiring ≤ {expiringDays} days ✕
          </span>
        )}
        <span className="hint">{data.total} contract(s)</span>
        <span className="spacer" />
        <button className="secondary" title="Export current view (respects filters + sort) as Excel" onClick={() => {
          const p = buildParams(); p.set('sort', sort); p.set('order', order)
          api.download(`/contracts/export?${p}`, 'contracts_export.xlsx')
        }}>Export XLSX</button>
        <button className="secondary" title="Export current view as CSV" onClick={() => {
          const p = buildParams(); p.set('sort', sort); p.set('order', order); p.set('fmt', 'csv')
          api.download(`/contracts/export?${p}`, 'contracts_export.csv')
        }}>CSV</button>
        <button className="secondary" title="Download expirations as an iCalendar file" onClick={() => {
          api.download(`/contracts/calendar.ics?${buildParams()}`, 'contract_expirations.ics')
        }}>Calendar</button>
        {canValidate && <Link className="btn secondary" to="/contracts/import">Import</Link>}
        {canValidate && (
          <button onClick={() => setStarting({ title: 'New contract', context: {} })}>+ New contract</button>
        )}
        {/* Recording an already-signed contract is not authoring, so it keeps its own form. */}
        {canValidate && <Link className="btn secondary" to="/contracts/new" title="Record an already-signed contract straight into the register">Record signed contract</Link>}
      </div>
      {error && <div className="error">{error}</div>}
      <table className="grid">
        <thead>
          <tr>
            {COLUMNS.map(([label, key], i) => (
              <th key={i}
                  onClick={() => toggleSort(key)}
                  className={key ? 'sortable' : undefined}
                  title={key ? 'Click to sort' : undefined}
                  aria-sort={key && sort === key ? (order === 'asc' ? 'ascending' : 'descending') : (key ? 'none' : undefined)}
                  style={key ? { cursor: 'pointer', whiteSpace: 'nowrap' } : undefined}>
                {label}{key && sort === key ? (order === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        {loading && data.items.length === 0 && <TableSkeleton rows={10} cols={14} />}
        <tbody>
          {data.items.map((c) => (
            <tr key={c.sr_no}>
              <td><Link to={`/contracts/${c.sr_no}`}>{c.sr_no}</Link></td>
              <td>{c.vendor_name}</td>
              <td>{c.contract_service}</td>
              <td>{c.contract_type || '—'}</td>
              <td>{c.location || '—'}</td>
              <td>
                {(c.tags && c.tags.length)
                  ? c.tags.map((t) => (
                      <span key={t.id} className="tag-chip" style={t.color ? { borderColor: t.color, color: t.color } : undefined}>{t.name}</span>
                    ))
                  : '—'}
              </td>
              <td>{c.department_name || '—'}</td>
              <td>{c.po_number || '—'}</td>
              <td>{c.start_date}</td>
              <td>{c.end_date}</td>
              <td>{c.contract_value != null ? c.contract_value.toLocaleString('en-IN') : '—'}</td>
              <td><span className={`badge ${c.status}`}>{c.status}</span></td>
              <td><span className={`badge ${c.lifecycle_status}`}>{c.lifecycle_status}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {c.risk_level
                  ? <span className={`badge ${c.risk_level === 'high' ? 'REJECTED' : c.risk_level === 'medium' ? 'warn' : 'VALIDATED'}`}
                          title={`Playbook risk score ${c.risk_score}`}>{c.risk_level}</span>
                  : <span className="hint">—</span>}
                {c.legal_hold && <span className="badge REJECTED" title="Under legal hold" style={{ marginLeft: 4 }}>🔒</span>}
              </td>
              <td>
                <div className="toolbar" style={{ margin: 0 }}>
                  <Link className="btn secondary" to={`/contracts/${c.sr_no}`}>View details</Link>
                  {canAuthor && <button className="secondary" onClick={() => renew(c)} title="Open a renewal copy in the editor with the term rolled forward">Renew</button>}
                  {isSuperAdmin && <button className="danger" onClick={() => deleteContract(c.sr_no)} title="Delete this contract (super admin only)">Delete</button>}
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

      {starting && (
        <StartContractModal
          title={starting.title}
          context={starting.context}
          onClose={() => setStarting(null)}
          onCreated={openDraft}
        />
      )}
    </div>
  )
}
