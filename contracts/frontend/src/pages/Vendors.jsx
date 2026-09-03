import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'
import { confirmDialog } from '../confirm'
import { usePersistedState, clearPersisted } from '../usePersistedState'

const K = 'cms_filters_vendors'

// Sortable columns: label + a value accessor + whether it sorts numerically.
const VENDOR_COLUMNS = [
  { key: 'name', label: 'Vendor', get: (v) => (v.name || '').toLowerCase() },
  { key: 'aliases', label: 'Aliases', get: (v) => (v.aliases || []).join(', ').toLowerCase() },
  { key: 'addresses', label: 'Addresses', get: (v) => (v.addresses || []).join('; ').toLowerCase() },
  { key: 'contracts', label: 'Contracts', get: (v) => v.contract_count ?? 0, num: true },
]

export default function Vendors() {
  const { canValidate } = useAuth()
  const [rows, setRows] = useState([])
  const [sort, setSort] = usePersistedState(`${K}_sort`, 'name')
  const [order, setOrder] = usePersistedState(`${K}_order`, 'asc')
  const [q, setQ] = usePersistedState(`${K}_q`, '')
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', aliases: '', addresses: '' })
  const [selected, setSelected] = useState([])          // vendor ids checked for merge
  const [mergeTarget, setMergeTarget] = useState(null)  // survivor id while merge modal open
  const [merges, setMerges] = useState(null)            // recent merges panel (null = hidden)
  const [offset, setOffset] = useState(0)               // server-side pagination cursor
  const [total, setTotal] = useState(0)
  const PAGE_SIZE = 50

  const load = useCallback(() => {
    const params = new URLSearchParams({
      paginate: 'true', sort, order, limit: String(PAGE_SIZE), offset: String(offset),
    })
    if (q) params.set('q', q)
    api.get(`/vendors?${params.toString()}`).then((res) => {
      setRows(res.items || [])
      setTotal(res.total || 0)
    }).catch((e) => setError(e.message))
  }, [q, sort, order, offset])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  // Any change to the search/sort resets to the first page.
  useEffect(() => { setOffset(0) }, [q, sort, order])

  function toggle(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  }

  async function create() {
    try {
      await api.post('/vendors', {
        name: form.name,
        aliases: form.aliases.split(',').map((s) => s.trim()).filter(Boolean),
        addresses: form.addresses.split('\n').map((s) => s.trim()).filter(Boolean),
        contacts: [],
      })
      setCreating(false)
      setForm({ name: '', aliases: '', addresses: '' })
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function doMerge() {
    setError(null)
    const sources = selected.filter((id) => id !== mergeTarget)
    try {
      const res = await api.post(`/vendors/${mergeTarget}/merge`, { source_ids: sources })
      setMessage(`Merged ${res.absorbed.length} vendor(s) into ${res.target.name}; ${res.contracts_moved} contract(s) moved. This can be undone from “Recent merges”.`)
      setSelected([])
      setMergeTarget(null)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  async function openMerges() {
    setError(null)
    try {
      setMerges(await api.get('/vendors/merges?active_only=true'))
    } catch (e) { setError(e.message) }
  }

  async function undoMerge(batch) {
    if (!await confirmDialog('Undo this merge? The absorbed vendors are restored and their contracts re-pointed back.')) return
    setError(null)
    try {
      const res = await api.post(`/vendors/merges/${batch.batch_id}/undo`)
      setMessage(`Restored ${res.count} vendor(s): ${res.restored.join(', ')}`)
      setMerges(await api.get('/vendors/merges?active_only=true'))
      load()
    } catch (e) { setError(e.message) }
  }

  function toggleSort(key) {
    if (sort === key) setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    else { setSort(key); setOrder('asc') }
  }

  const sortedRows = useMemo(() => {
    const col = VENDOR_COLUMNS.find((c) => c.key === sort) || VENDOR_COLUMNS[0]
    const dir = order === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const av = col.get(a); const bv = col.get(b)
      if (av < bv) return -dir
      if (av > bv) return dir
      return (a.name || '').localeCompare(b.name || '')  // stable tiebreak by name
    })
  }, [rows, sort, order])

  const selectedVendors = rows.filter((v) => selected.includes(v.id))

  return (
    <div>
      <h2>Vendor Master</h2>
      <div className="toolbar">
        <input placeholder="Search vendors (fuzzy)…" value={q} onChange={(e) => setQ(e.target.value)} />
        {(q || sort !== 'name' || order !== 'asc') && (
          <button className="secondary" onClick={() => {
            setQ(''); setSort('name'); setOrder('asc')
            clearPersisted(`${K}_q`, `${K}_sort`, `${K}_order`)
          }}>Clear filters</button>
        )}
        <span className="spacer" />
        {canValidate && selected.length >= 2 && (
          <button onClick={() => setMergeTarget(selected[0])}>Merge {selected.length} vendors…</button>
        )}
        {canValidate && <button className="secondary" onClick={openMerges}>Recent merges</button>}
        {canValidate && <button onClick={() => setCreating(true)}>+ New vendor</button>}
      </div>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
      <table className="grid">
        <thead>
          <tr>
            {canValidate && <th></th>}
            {VENDOR_COLUMNS.map((c) => (
              <th key={c.key} className="sortable" style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                  title="Click to sort" onClick={() => toggleSort(c.key)}
                  aria-sort={sort === c.key ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
                {c.label}{sort === c.key ? (order === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((v) => (
            <tr key={v.id}>
              {canValidate && (
                <td><input type="checkbox" style={{ width: 'auto' }} checked={selected.includes(v.id)} onChange={() => toggle(v.id)} /></td>
              )}
              <td><Link to={`/vendors/${v.id}`}>{v.name}</Link></td>
              <td>{v.aliases.join(', ') || '—'}</td>
              <td>{(v.addresses || []).join('; ') || '—'}</td>
              <td>{v.contract_count ?? 0}</td>
              <td><Link to={`/vendors/${v.id}`}>History →</Link></td>
            </tr>
          ))}
        </tbody>
      </table>

      {total > 0 && (
        <div className="toolbar" style={{ marginTop: 10, alignItems: 'center' }}>
          <span className="hint">
            {rows.length === 0 ? '0' : `${offset + 1}–${offset + rows.length}`} of {total}
          </span>
          <span className="spacer" />
          <button className="secondary" disabled={offset === 0}
                  onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}>← Prev</button>
          <button className="secondary" disabled={offset + rows.length >= total}
                  onClick={() => setOffset((o) => o + PAGE_SIZE)}>Next →</button>
        </div>
      )}

      {creating && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 480 }}>
            <h3>New vendor</h3>
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <label>Aliases (comma-separated)</label>
            <input value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
            <label>Addresses (one per line)</label>
            <textarea rows={2} value={form.addresses} onChange={(e) => setForm({ ...form, addresses: e.target.value })} />
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button disabled={!form.name} onClick={create}>Create</button>
              <button className="secondary" onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {merges && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 640 }}>
            <h3>Recent merges</h3>
            <p className="hint">Undoing a merge restores the absorbed vendors and re-points their contracts back.</p>
            {merges.length === 0 && <p>No reversible merges.</p>}
            {merges.length > 0 && (
              <table className="grid">
                <thead><tr><th>When</th><th>Survivor</th><th>Absorbed</th><th>Contracts</th><th>By</th><th></th></tr></thead>
                <tbody>
                  {merges.map((m) => (
                    <tr key={m.batch_id}>
                      <td>{new Date(m.merged_at).toLocaleString()}</td>
                      <td><Link to={`/vendors/${m.target_id}`}>{m.target_name}</Link></td>
                      <td>{m.sources.map((s) => s.name).join(', ')}</td>
                      <td>{m.contracts_moved}</td>
                      <td>{m.merged_by || 'system'}</td>
                      <td><button className="danger" onClick={() => undoMerge(m)}>Undo</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="secondary" onClick={() => setMerges(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {mergeTarget && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 520 }}>
            <h3>Merge vendors</h3>
            <p className="hint">
              Choose the vendor to <b>keep</b>. The others are folded into it: their
              contracts are re-pointed, their names become aliases, and they are
              archived. This cannot be undone automatically.
            </p>
            <label>Keep (survivor)</label>
            <select value={mergeTarget} onChange={(e) => setMergeTarget(Number(e.target.value))}>
              {selectedVendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({v.contract_count ?? 0} contracts)</option>
              ))}
            </select>
            <p style={{ marginTop: 10 }}>
              Folding in:{' '}
              {selectedVendors.filter((v) => v.id !== mergeTarget).map((v) => v.name).join(', ')}
            </p>
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button onClick={doMerge}>Merge</button>
              <button className="secondary" onClick={() => setMergeTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
