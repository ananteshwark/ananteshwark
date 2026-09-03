import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../auth'

const FIELDS = ['vendor_name', 'signing_entity', 'po_number', 'contract_service', 'start_date', 'end_date', 'contract_value']

export default function DuplicateReview() {
  const { canValidate } = useAuth()
  const [rows, setRows] = useState([])
  const [filter, setFilter] = useState('PENDING')
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    api.get(`/duplicates?resolution=${filter}`).then(setRows).catch((e) => setError(e.message))
  }, [filter])

  useEffect(load, [load])

  async function resolve(id, resolution) {
    try {
      await api.post(`/duplicates/${id}/resolve`, { resolution })
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div>
      <h2>Duplicate Review</h2>
      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="PENDING">Pending</option>
          <option value="CONFIRMED_DUPLICATE">Confirmed duplicates</option>
          <option value="RENEWAL">Renewals</option>
          <option value="NOT_DUPLICATE">Not duplicates</option>
          <option value="ALL">All</option>
        </select>
        <span className="hint">{rows.length} candidate(s)</span>
      </div>
      {error && <div className="error">{error}</div>}
      {rows.length === 0 && <p className="hint">Nothing to review.</p>}
      {rows.map((d) => (
        <div className="card" key={d.id}>
          <p>
            <Link to={`/contracts/${d.contract_id}`}>#{d.contract_id}</Link> vs{' '}
            <Link to={`/contracts/${d.matched_contract_id}`}>#{d.matched_contract_id}</Link>
            {' — '}{d.reason} <span className="badge warn">score {d.score.toFixed(0)}</span>
            {' '}<span className={`badge ${d.resolution === 'PENDING' ? 'warn' : 'VALIDATED'}`}>{d.resolution}</span>
          </p>
          <div className="compare">
            <div className="head">Field</div>
            <div className="head">New #{d.contract_id}</div>
            <div className="head">Existing #{d.matched_contract_id}</div>
            {FIELDS.map((f) => {
              const a = d.contract?.[f] ?? '—'
              const b = d.matched_contract?.[f] ?? '—'
              const diff = String(a) !== String(b)
              return [
                <div key={f + 'l'}>{f}</div>,
                <div key={f + 'a'} className={diff ? 'diff' : ''}>{String(a)}</div>,
                <div key={f + 'b'} className={diff ? 'diff' : ''}>{String(b)}</div>,
              ]
            })}
          </div>
          {d.resolution === 'PENDING' && canValidate && (
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="danger" onClick={() => resolve(d.id, 'CONFIRMED_DUPLICATE')}>
                Confirm duplicate (link + archive)
              </button>
              <button onClick={() => resolve(d.id, 'RENEWAL')}>Renewal / amendment</button>
              <button className="secondary" onClick={() => resolve(d.id, 'NOT_DUPLICATE')}>Not a duplicate</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
