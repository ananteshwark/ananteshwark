import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { confirmDialog, promptDialog } from '../confirm'
import { usePersistedState, clearPersisted } from '../usePersistedState'

const K = 'cms_filters_validation'

export default function ValidationQueue() {
  const { canValidate, user } = useAuth()
  const [rows, setRows] = useState([])
  const [departments, setDepartments] = useState([])
  // Filters are persisted so they're retained across navigation until cleared.
  const [sort, setSort] = usePersistedState(`${K}_sort`, 'detected_at')
  const [order, setOrder] = usePersistedState(`${K}_order`, 'desc')
  const [deptId, setDeptId] = usePersistedState(`${K}_dept`, '')
  const [vendor, setVendor] = usePersistedState(`${K}_vendor`, '')
  const [entity, setEntity] = usePersistedState(`${K}_entity`, '')
  const [entities, setEntities] = useState([])
  const [assigneeFilter, setAssigneeFilter] = usePersistedState(`${K}_assignee`, '')  // '' | 'me' | 'unassigned'
  const [selected, setSelected] = useState([])
  const [bulkDept, setBulkDept] = useState('')
  const [tags, setTags] = useState([])
  const [bulkTag, setBulkTag] = useState('')
  const [types, setTypes] = useState([])
  const [bulkType, setBulkType] = useState('')
  const [assignees, setAssignees] = useState([])
  const [bulkAssignee, setBulkAssignee] = useState('')
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    api.get('/departments').then(setDepartments).catch(() => {})
    api.get('/tags').then(setTags).catch(() => {})
    api.get('/contracts/types').then((r) => setTypes(r.types)).catch(() => {})
    api.get('/contracts/signing-entities').then((r) => setEntities(r.entities)).catch(() => {})
    api.get('/auth/assignable-users').then(setAssignees).catch(() => {})
  }, [])

  const load = useCallback(() => {
    const params = new URLSearchParams({ sort, order })
    if (deptId) params.set('department_id', deptId)
    if (vendor) params.set('vendor', vendor)
    if (entity) params.set('signing_entity', entity)
    if (assigneeFilter === 'me' && user) params.set('assignee_id', user.id)
    else if (assigneeFilter === 'unassigned') params.set('assignee_id', 0)
    api.get(`/contracts/validation-queue?${params}`).then((r) => {
      setRows(r)
      setSelected((sel) => sel.filter((id) => r.some((c) => c.sr_no === id)))
    }).catch((e) => setError(e.message))
  }, [sort, order, deptId, vendor, entity, assigneeFilter, user])

  async function assignOne(sr_no, userId) {
    setError(null)
    try {
      await api.put(`/contracts/${sr_no}/assignee`, { user_id: userId })
      load()
    } catch (e) { setError(e.message) }
  }

  useEffect(load, [load])

  function toggle(sr) {
    setSelected((s) => (s.includes(sr) ? s.filter((x) => x !== sr) : [...s, sr]))
  }
  const allSelected = rows.length > 0 && selected.length === rows.length
  function toggleAll() {
    setSelected(allSelected ? [] : rows.map((c) => c.sr_no))
  }

  async function runBulk(action, extra = {}) {
    setError(null); setMessage(null)
    try {
      const res = await api.post('/contracts/bulk', { sr_nos: selected, action, ...extra })
      let msg = `${res.updated_count} contract(s) updated`
      if (res.skipped.length) msg += `; ${res.skipped.length} skipped (${res.skipped.slice(0, 3).map((s) => `#${s.sr_no}: ${s.reason}`).join('; ')}${res.skipped.length > 3 ? '…' : ''})`
      setMessage(msg)
      setSelected([])
      load()
    } catch (e) { setError(e.message) }
  }

  return (
    <div>
      <h2>Validation Queue</h2>
      <div className="toolbar">
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="detected_at">Sort: date</option>
          <option value="department">Sort: department</option>
          <option value="vendor">Sort: vendor</option>
          <option value="confidence">Sort: confidence</option>
        </select>
        <select value={order} onChange={(e) => setOrder(e.target.value)}>
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </select>
        <select value={deptId} onChange={(e) => setDeptId(e.target.value)}>
          <option value="">All departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <input placeholder="Filter vendor…" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        <select value={entity} onChange={(e) => setEntity(e.target.value)}>
          <option value="">All signing entities</option>
          {entities.map((en) => <option key={en}>{en}</option>)}
        </select>
        <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
          <option value="">All assignees</option>
          <option value="me">Assigned to me</option>
          <option value="unassigned">Unassigned</option>
        </select>
        {(deptId || vendor || entity || assigneeFilter || sort !== 'detected_at' || order !== 'desc') && (
          <button className="secondary" onClick={() => {
            setSort('detected_at'); setOrder('desc'); setDeptId(''); setVendor(''); setEntity(''); setAssigneeFilter('')
            clearPersisted(`${K}_sort`, `${K}_order`, `${K}_dept`, `${K}_vendor`, `${K}_entity`, `${K}_assignee`)
          }}>Clear filters</button>
        )}
        <span className="hint">{rows.length} pending</span>
      </div>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      {canValidate && selected.length > 0 && (
        <div className="card" style={{ padding: '10px 14px' }}>
          <div className="toolbar" style={{ margin: 0 }}>
            <strong>{selected.length} selected</strong>
            <span className="spacer" />
            <select value={bulkDept} onChange={(e) => setBulkDept(e.target.value)}>
              <option value="">Assign department…</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <button disabled={!bulkDept} onClick={() => runBulk('assign_department', { department_id: Number(bulkDept) })}>Assign</button>
            {tags.length > 0 && (
              <>
                <select value={bulkTag} onChange={(e) => setBulkTag(e.target.value)}>
                  <option value="">Tag…</option>
                  {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <button className="secondary" disabled={!bulkTag} onClick={() => runBulk('add_tags', { tag_ids: [Number(bulkTag)] })}>Add tag</button>
                <button className="secondary" disabled={!bulkTag} onClick={() => runBulk('remove_tags', { tag_ids: [Number(bulkTag)] })}>Remove tag</button>
              </>
            )}
            {types.length > 0 && (
              <>
                <select value={bulkType} onChange={(e) => setBulkType(e.target.value)}>
                  <option value="">Set type…</option>
                  {types.map((t) => <option key={t}>{t}</option>)}
                </select>
                <button className="secondary" disabled={!bulkType} onClick={() => runBulk('set_type', { contract_type: bulkType })}>Set type</button>
              </>
            )}
            {assignees.length > 0 && (
              <>
                <select value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)}>
                  <option value="">Assign to…</option>
                  <option value="none">— Unassign —</option>
                  {assignees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
                <button className="secondary" disabled={!bulkAssignee} onClick={() => runBulk('assign_user', { user_id: bulkAssignee === 'none' ? null : Number(bulkAssignee) })}>Assign</button>
              </>
            )}
            <button className="secondary" onClick={async () => {
              if (await confirmDialog(`Re-run AI extraction on ${selected.length} selected contract(s)? The current pending extraction is superseded by the fresh result.`,
                { title: 'Re-extract', confirmLabel: 'Re-extract' })) runBulk('re_extract')
            }}>Re-extract</button>
            <button onClick={() => runBulk('validate')}>Validate complete</button>
            <button className="danger" onClick={async () => {
              const reason = await promptDialog('Reason for rejecting the selected contracts?',
                { title: 'Reject contracts', confirmLabel: 'Reject', danger: true, required: true, placeholder: 'e.g. not a contract' })
              if (reason && reason.trim()) runBulk('reject', { reason: reason.trim() })
            }}>Reject</button>
          </div>
          <p className="hint" style={{ margin: '6px 0 0' }}>
            “Validate complete” validates only rows with all mandatory fields; the rest are reported as skipped.
          </p>
        </div>
      )}

      <table className="grid">
        <thead>
          <tr>
            {canValidate && <th><input type="checkbox" style={{ width: 'auto' }} checked={allSelected} onChange={toggleAll} /></th>}
            <th>#</th><th>Signing entity</th><th>Vendor</th><th>Service</th><th>Type</th>
            <th>Value</th><th>Assignee</th><th>Start</th><th>End</th>
            <th>Min confidence</th><th>Completeness</th><th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.sr_no}>
              {canValidate && (
                <td><input type="checkbox" style={{ width: 'auto' }} checked={selected.includes(c.sr_no)} onChange={() => toggle(c.sr_no)} /></td>
              )}
              <td>{c.sr_no}</td>
              <td>{c.signing_entity || '—'}</td>
              <td>{c.vendor_name}</td>
              <td>{c.contract_service}</td>
              <td>{c.contract_type || '—'}</td>
              <td>{c.contract_value != null ? `${c.currency || ''} ${c.contract_value.toLocaleString('en-IN')}` : '—'}</td>
              <td>
                {canValidate ? (
                  <select value={c.assignee_id || ''} onChange={(e) => assignOne(c.sr_no, e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— Unassigned —</option>
                    {assignees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                ) : (c.assignee_name || '—')}
              </td>
              <td>{c.start_date}</td>
              <td>{c.end_date}</td>
              <td>
                <span className={c.min_confidence < 0.8 ? 'badge warn' : 'badge VALIDATED'}>
                  {(c.min_confidence * 100).toFixed(0)}%
                </span>
              </td>
              <td>
                <div className="progressbar"><div style={{ width: `${c.completeness}%` }} /></div>
                <span className="hint"> {c.completeness}%</span>
              </td>
              <td><Link className="btn" to={`/validation/${c.sr_no}`}>Validate</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
