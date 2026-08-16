import { useEffect, useState } from 'react'
import { api } from '../api'

// Renders admin-defined custom fields (G7) for a contract type, bound to a
// values object. Used in the validation/edit form. `contractType` scopes which
// fields apply; `values` is the custom_fields map, `onChange(next)` gets the
// updated map.
export default function CustomFields({ contractType, values, onChange }) {
  const [defs, setDefs] = useState([])
  useEffect(() => {
    const q = contractType ? `?contract_type=${encodeURIComponent(contractType)}` : ''
    api.get(`/custom-fields${q}`).then(setDefs).catch(() => setDefs([]))
  }, [contractType])

  if (defs.length === 0) return null
  const v = values || {}
  const set = (key, val) => onChange({ ...v, [key]: val })

  return (
    <div style={{ marginTop: 8 }}>
      <label style={{ fontWeight: 600 }}>Custom fields</label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {defs.map((f) => (
          <div key={f.key}>
            <label>{f.label}{f.required && ' *'}</label>
            {f.field_type === 'select' ? (
              <select value={v[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value || null)}>
                <option value="">— select —</option>
                {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.field_type === 'bool' ? (
              <select value={v[f.key] === true ? 'yes' : v[f.key] === false ? 'no' : ''}
                onChange={(e) => set(f.key, e.target.value === '' ? null : e.target.value === 'yes')}>
                <option value="">— not set —</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            ) : (
              <input type={f.field_type === 'number' ? 'number' : f.field_type === 'date' ? 'date' : 'text'}
                value={v[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value === '' ? null : e.target.value)} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
