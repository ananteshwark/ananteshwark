import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import CustomFields from './CustomFields'

// ---- Live date <-> tenure math (mirrors backend app/services/dates.py) ----
// End dates are inclusive: 1 year from 2025-01-01 ends 2025-12-31 (start + n - 1 day).
function _parseISO(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '')
  return m ? { y: +m[1], mo: +m[2], d: +m[3] } : null
}
function _iso({ y, mo, d }) {
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function _daysInMonth(y, mo) { return new Date(Date.UTC(y, mo, 0)).getUTCDate() }
function _addDays(dt, n) {
  const j = new Date(Date.UTC(dt.y, dt.mo - 1, dt.d) + n * 86400000)
  return { y: j.getUTCFullYear(), mo: j.getUTCMonth() + 1, d: j.getUTCDate() }
}
function _addMonths(dt, months) {
  const total = dt.y * 12 + (dt.mo - 1) + months
  const y = Math.floor(total / 12)
  const mo = (total % 12) + 1
  return { y, mo, d: Math.min(dt.d, _daysInMonth(y, mo)) }
}
function _tenureToMonths(numStr, unit) {
  const n = parseFloat(numStr)
  if (!n || n <= 0) return null
  return unit === 'Years' ? Math.round(n * 12) : Math.round(n)
}
export function monthsFromTenure(s) {
  const m = /(\d+(?:\.\d+)?)\s*(year|month)/i.exec(s || '')
  if (!m) return null
  return _tenureToMonths(m[1], /year/i.test(m[2]) ? 'Years' : 'Months')
}
function _formatMonths(total) {
  if (!total || total <= 0) return null
  if (total % 12 === 0) { const y = total / 12; return `${y} Year${y !== 1 ? 's' : ''}` }
  return `${total} Month${total !== 1 ? 's' : ''}`
}
// End date from start + N months (inclusive), as an ISO string.
export function endFromStartMonths(startISO, months) {
  const s = _parseISO(startISO)
  if (!s || !months) return null
  return _iso(_addDays(_addMonths(s, months), -1))
}
// Whole-month/year tenure label from two dates (inclusive end).
function tenureFromDates(startISO, endISO) {
  const s = _parseISO(startISO), e = _parseISO(endISO)
  if (!s || !e) return null
  const ep = _addDays(e, 1)  // inclusive end
  if (Date.UTC(ep.y, ep.mo - 1, ep.d) <= Date.UTC(s.y, s.mo - 1, s.d)) return null
  let y = ep.y - s.y, mo = ep.mo - s.mo, d = ep.d - s.d
  if (d < 0) {
    mo -= 1
    let by = ep.y, bm = ep.mo - 1
    if (bm < 1) { bm = 12; by -= 1 }
    d += _daysInMonth(by, bm)
  }
  if (mo < 0) { y -= 1; mo += 12 }
  return _formatMonths(y * 12 + mo + (d >= 15 ? 1 : 0))
}

const CONFIDENCE_KEY = {
  signing_entity: 'signing_entity',
  vendor_name_raw: 'vendor',
  vendor_address: 'vendor_address',
  start_date: 'start_date',
  end_date: 'end_date',
  contract_tenure: 'contract_tenure',
  po_number: 'po_number',
  contract_value: 'contract_value',
  currency: 'currency',
  iks_signing_authority: 'iks_signing_authority',
  vendor_signing_authority: 'vendor_signing_authority',
  contract_service: 'contract_service',
  service_summary: 'service_summary',
  payment_term: 'payment_term',
  notice_period: 'notice_period',
  location: 'location',
}

// Fields that block validation. Fetched from the server so the form cannot
// disagree with the rule that actually rejects the save; this is the fallback
// used until that request lands (and if it fails).
const DEFAULT_MANDATORY = [
  'signing_entity', 'vendor_name_raw', 'start_date', 'end_date',
  'department_id', 'contract_service', 'po_number',
]

export function useMandatoryFields() {
  const [fields, setFields] = useState(DEFAULT_MANDATORY)
  useEffect(() => {
    api.get('/contracts/mandatory-fields')
      .then((r) => setFields((r.mandatory || []).map((m) => m.form_field || m.field)))
      .catch(() => {})
  }, [])
  return fields
}

export function fieldClass(contract, field, threshold = 0.8, mandatory = []) {
  const classes = []
  const key = CONFIDENCE_KEY[field]
  const conf = contract.confidence?.[key]
  if (typeof conf === 'number' && conf < threshold) classes.push('field-low-confidence')
  if ((contract.derived_fields || []).includes(field)) classes.push('field-derived')
  if ((contract.learned_fields || []).includes(field)) classes.push('field-derived')
  if (mandatory.includes(field)) classes.push('field-mandatory')
  return classes.join(' ')
}

// The asterisk alone read as decoration; required fields now carry it in the
// accent colour with a title, so what will block a save is visible at a glance.
export function RequiredMark() {
  return <span className="req-mark" title="Required before this contract can be validated"> *</span>
}

function Field({ contract, field, label, children, threshold, mandatory = [] }) {
  const key = CONFIDENCE_KEY[field]
  const conf = contract.confidence?.[key]
  const derived = (contract.derived_fields || []).includes(field)
  const learned = (contract.learned_fields || []).includes(field)
  const required = mandatory.includes(field)
  return (
    <div className={fieldClass(contract, field, threshold, mandatory)}>
      <label>
        {label}{required && <RequiredMark />}
        {typeof conf === 'number' && conf < threshold && (
          <span className="hint warn"> · low confidence ({(conf * 100).toFixed(0)}%)</span>
        )}
        {derived && (
          <span className="hint derived">
            {' · '}{field === 'start_date' || field === 'end_date' ? 'auto-derived from tenure' : 'auto-adjusted'} — please review
          </span>
        )}
        {learned && (
          <span className="hint derived"> · filled from vendor history — please review</span>
        )}
      </label>
      {children}
    </div>
  )
}

export function VendorPicker({ value, rawName, onPick, onCreate }) {
  const [query, setQuery] = useState(rawName || '')
  const [options, setOptions] = useState([])
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState(null)
  const box = useRef(null)

  useEffect(() => {
    if (!value) return
    api.get('/vendors').then((vendors) => {
      const v = vendors.find((x) => x.id === value)
      if (v) { setPicked(v); setQuery(v.name) }
    }).catch(() => {})
  }, [value])

  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => {
      api.get(`/vendors?q=${encodeURIComponent(query)}`).then(setOptions).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [query, open])

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <input
        value={query}
        placeholder="Search vendor master…"
        onFocus={() => setOpen(true)}
        onChange={(e) => { setQuery(e.target.value); setPicked(null); setOpen(true) }}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {picked && <div className="hint">Attached to vendor #{picked.id} ({picked.name})</div>}
      {!picked && <div className="hint warn">Not attached — pick an existing vendor or create a new one</div>}
      {open && (
        <div style={{
          position: 'absolute', zIndex: 20, background: '#fff', border: '1px solid #c6d0da',
          borderRadius: 6, width: '100%', maxHeight: 220, overflow: 'auto', boxShadow: '0 6px 18px rgba(0,0,0,.12)',
        }}>
          {options.map((v) => (
            <div key={v.id} style={{ padding: '7px 10px', cursor: 'pointer' }}
              onMouseDown={() => { setPicked(v); setQuery(v.name); onPick(v); setOpen(false) }}>
              {v.name} <span className="hint">({v.contract_count ?? 0} contracts)</span>
            </div>
          ))}
          {query && (
            <div style={{ padding: '7px 10px', cursor: 'pointer', borderTop: '1px solid #e6ebf0', color: '#1259a7' }}
              onMouseDown={() => { onCreate(query); setPicked({ id: 'new', name: query }); setOpen(false) }}>
              + Create new vendor “{query}”
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ContractForm({
  contract, form, setForm, departments, types = [], threshold = 0.8,
  signingEntities = [], currencies = [], businessUnits = [], onSuggestDepartment,
  mandatory = DEFAULT_MANDATORY,
}) {
  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value === '' ? null : e.target.value })
  const [deptSuggesting, setDeptSuggesting] = useState(false)
  const [deptSuggestion, setDeptSuggestion] = useState(null)  // { department_name, confidence, basis } | 'none'

  async function suggestDepartment() {
    if (!onSuggestDepartment) return
    setDeptSuggesting(true)
    setDeptSuggestion(null)
    try {
      const r = await onSuggestDepartment()
      if (r && r.department_id) {
        setForm((f) => ({ ...f, department_id: Number(r.department_id) }))
        setDeptSuggestion(r)
      } else {
        setDeptSuggestion('none')
      }
    } catch { setDeptSuggestion('none') }
    finally { setDeptSuggesting(false) }
  }

  // Ensure the current currency/BU value is always selectable even if it isn't
  // in the admin-managed list (e.g. an older extracted value).
  const currencyOptions = [...new Set([...(currencies || []), form.currency].filter(Boolean))]

  const lineItems = form.line_items || []
  const setLineItem = (idx, field, numeric) => (e) => {
    const raw = e.target.value
    const value = raw === '' ? null : (numeric ? Number(raw) : raw)
    const items = lineItems.map((li, i) => (i === idx ? { ...li, [field]: value } : li))
    setForm({ ...form, line_items: items })
  }
  const addLineItem = () =>
    setForm({ ...form, line_items: [...lineItems, { item: '', unit: '', quantity: null, unit_rate: null, amount: null }] })
  const removeLineItem = (idx) =>
    setForm({ ...form, line_items: lineItems.filter((_, i) => i !== idx) })

  // Contract tenure is expressed only in Months or Years (a number + unit).
  const tenureMatch = /(\d+(?:\.\d+)?)\s*(year|month)/i.exec(form.contract_tenure || '')
  const tenureNum = tenureMatch ? tenureMatch[1] : ''
  const tenureUnit = tenureMatch && /year/i.test(tenureMatch[2]) ? 'Years' : 'Months'

  // Live recalculation: editing a date recomputes tenure (or fills the end date
  // from the tenure); editing the tenure recomputes the end date. Dates win when
  // both a date and the tenure are present.
  const onStartChange = (e) => {
    const start = e.target.value || null
    setForm((f) => {
      const next = { ...f, start_date: start }
      if (start && f.end_date) {
        const t = tenureFromDates(start, f.end_date); if (t) next.contract_tenure = t
      } else if (start && f.contract_tenure) {
        const end = endFromStartMonths(start, monthsFromTenure(f.contract_tenure)); if (end) next.end_date = end
      }
      return next
    })
  }
  const onEndChange = (e) => {
    const end = e.target.value || null
    setForm((f) => {
      const next = { ...f, end_date: end }
      if (end && f.start_date) {
        const t = tenureFromDates(f.start_date, end); if (t) next.contract_tenure = t
      }
      return next
    })
  }
  const setTenure = (num, unit) => {
    setForm((f) => {
      const next = { ...f, contract_tenure: num === '' || num == null ? null : `${num} ${unit}` }
      const months = _tenureToMonths(num, unit)
      if (months && f.start_date) {
        const end = endFromStartMonths(f.start_date, months); if (end) next.end_date = end
      }
      return next
    })
  }

  return (
    <div>
      <Field mandatory={mandatory} contract={contract} field="signing_entity" label="Signing Entity" threshold={threshold}>
        <select value={form.signing_entity || ''} onChange={set('signing_entity')}>
          <option value="">— Select internal entity —</option>
          {signingEntities.map((en) => <option key={en} value={en}>{en}</option>)}
          {form.signing_entity && !signingEntities.includes(form.signing_entity) && (
            <option value={form.signing_entity}>{form.signing_entity} (not predefined — pick a valid entity)</option>
          )}
        </select>
        <span className="hint">Pick a predefined entity. To change an entity’s display name for every contract, rename it in Admin Settings → Internal entities (editing it here just re-points this contract to the chosen entity).</span>
      </Field>

      <Field mandatory={mandatory} contract={contract} field="vendor_name_raw" label="Counterparty" threshold={threshold}>
        <VendorPicker
          value={form.vendor_id}
          rawName={contract.vendor_name}
          onPick={(v) => setForm({ ...form, vendor_id: v.id, new_vendor_name: null })}
          onCreate={(name) => setForm({ ...form, vendor_id: null, new_vendor_name: name })}
        />
      </Field>

      <Field mandatory={mandatory} contract={contract} field="vendor_address" label="Vendor Address" threshold={threshold}>
        <textarea rows={2} value={form.vendor_address || ''} onChange={set('vendor_address')} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Field mandatory={mandatory} contract={contract} field="start_date" label="Start Date" threshold={threshold}>
          <input type="date" value={form.start_date || ''} onChange={onStartChange} />
        </Field>
        <Field mandatory={mandatory} contract={contract} field="end_date" label="End Date" threshold={threshold}>
          <input type="date" value={form.end_date || ''} onChange={onEndChange} />
        </Field>
        <Field mandatory={mandatory} contract={contract} field="contract_tenure" label="Contract Tenure" threshold={threshold}>
          <div className="toolbar" style={{ margin: 0 }}>
            <input type="number" min="0" step="1" style={{ maxWidth: 90 }} value={tenureNum}
              onChange={(e) => setTenure(e.target.value, tenureUnit)} placeholder="e.g. 24" />
            <select value={tenureUnit} onChange={(e) => setTenure(tenureNum || '', e.target.value)}>
              <option>Months</option>
              <option>Years</option>
            </select>
          </div>
        </Field>
      </div>
      <p className="hint">Dates and tenure update each other live: set start + end and the tenure fills in; set start + tenure and the end date fills in.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className={`${(contract.learned_fields || []).includes('department_id') ? 'field-derived' : ''}${mandatory.includes('department_id') ? ' field-mandatory' : ''}`}>
          <label>Department{mandatory.includes('department_id') && <RequiredMark />}
            {(contract.learned_fields || []).includes('department_id') && (
              <span className="hint derived"> · filled from vendor history — please review</span>
            )}
          </label>
          <div className="toolbar" style={{ margin: 0 }}>
            <select style={{ flex: 1 }} value={form.department_id || ''} onChange={(e) => setForm({ ...form, department_id: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— select —</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {onSuggestDepartment && (
              <button type="button" className="secondary" disabled={deptSuggesting}
                title="Suggest a department from validated contracts" onClick={suggestDepartment}>
                {deptSuggesting ? '…' : '✨ Suggest'}
              </button>
            )}
          </div>
          {deptSuggestion === 'none' && <span className="hint">No confident suggestion yet — not enough similar validated contracts.</span>}
          {deptSuggestion && deptSuggestion !== 'none' && (
            <span className="hint derived">
              AI suggested <strong>{deptSuggestion.department_name}</strong> ({Math.round((deptSuggestion.confidence || 0) * 100)}% · {deptSuggestion.basis}) — review
            </span>
          )}
        </div>
        <Field mandatory={mandatory} contract={contract} field="po_number" label="PO Number" threshold={threshold}>
          <input value={form.po_number || ''} onChange={set('po_number')} />
        </Field>
      </div>

      <div className={(contract.learned_fields || []).includes('contract_type') ? 'field-derived' : ''}>
        <label>Contract Type
          {(contract.learned_fields || []).includes('contract_type')
            ? <span className="hint derived"> · filled from vendor history — please review</span>
            : <span className="hint"> (AI-suggested — review)</span>}
        </label>
        <input list="contract-type-options" value={form.contract_type || ''} onChange={set('contract_type')}
          placeholder="e.g. NDA, MSA, SOW…" />
        <datalist id="contract-type-options">
          {types.map((t) => <option key={t} value={t} />)}
        </datalist>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        <Field mandatory={mandatory} contract={contract} field="contract_value" label="Contract Value" threshold={threshold}>
          <input type="number" step="0.01" value={form.contract_value ?? ''} onChange={set('contract_value')} />
        </Field>
        <label>Negotiated savings
          <input type="number" step="0.01" value={form.savings_amount ?? ''} onChange={set('savings_amount')}
            placeholder="optional" />
        </label>
        <Field mandatory={mandatory} contract={contract} field="currency" label="Currency" threshold={threshold}>
          <select value={form.currency || 'INR'} onChange={set('currency')}>
            {!currencyOptions.includes('INR') && <option value="INR">INR</option>}
            {currencyOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field mandatory={mandatory} contract={contract} field="iks_signing_authority" label="IKS Signing Authority" threshold={threshold}>
          <input value={form.iks_signing_authority || ''} onChange={set('iks_signing_authority')} />
        </Field>
        <Field mandatory={mandatory} contract={contract} field="vendor_signing_authority" label="Vendor Signing Authority" threshold={threshold}>
          <input value={form.vendor_signing_authority || ''} onChange={set('vendor_signing_authority')} />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
        <Field mandatory={mandatory} contract={contract} field="contract_service" label="Contract Service" threshold={threshold}>
          <input value={form.contract_service || ''} onChange={set('contract_service')} />
        </Field>
        <Field mandatory={mandatory} contract={contract} field="location" label="Business Unit (BU)" threshold={threshold}>
          <input list="business-unit-options" value={form.location || ''} onChange={set('location')}
            placeholder="Select or type a business unit…" autoComplete="off" />
          <datalist id="business-unit-options">
            {businessUnits.map((b) => <option key={b} value={b} />)}
          </datalist>
        </Field>
      </div>

      <Field mandatory={mandatory} contract={contract} field="service_summary" label="Service Summary" threshold={threshold}>
        <textarea rows={3} value={form.service_summary || ''} onChange={set('service_summary')} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field mandatory={mandatory} contract={contract} field="payment_term" label="Payment Term" threshold={threshold}>
          <input value={form.payment_term || ''} onChange={set('payment_term')} placeholder="e.g. Net 30" />
        </Field>
        <Field mandatory={mandatory} contract={contract} field="notice_period" label="Notice Period" threshold={threshold}>
          <input value={form.notice_period || ''} onChange={set('notice_period')} placeholder="e.g. 30 days" />
        </Field>
      </div>

      <CustomFields contractType={form.contract_type} values={form.custom_fields}
        onChange={(next) => setForm({ ...form, custom_fields: next })} />

      <div style={{ marginTop: 12 }}>
        <label>Line items — unit rates</label>
        <table className="grid">
          <thead>
            <tr><th>Item</th><th>Unit</th><th>Qty</th><th>Unit rate</th><th>Amount</th><th /></tr>
          </thead>
          <tbody>
            {lineItems.map((li, idx) => (
              <tr key={idx}>
                <td><input value={li.item || ''} onChange={setLineItem(idx, 'item', false)} /></td>
                <td><input value={li.unit || ''} onChange={setLineItem(idx, 'unit', false)} placeholder="per licence" /></td>
                <td><input type="number" step="any" value={li.quantity ?? ''} onChange={setLineItem(idx, 'quantity', true)} /></td>
                <td><input type="number" step="any" value={li.unit_rate ?? ''} onChange={setLineItem(idx, 'unit_rate', true)} /></td>
                <td><input type="number" step="any" value={li.amount ?? ''} onChange={setLineItem(idx, 'amount', true)} /></td>
                <td><button type="button" className="danger" onClick={() => removeLineItem(idx)}>×</button></td>
              </tr>
            ))}
            {lineItems.length === 0 && (
              <tr><td colSpan={6} className="hint">No line items — add rows to record unit rates.</td></tr>
            )}
          </tbody>
        </table>
        <button type="button" className="secondary" style={{ marginTop: 6 }} onClick={addLineItem}>+ Add line item</button>
      </div>
    </div>
  )
}
