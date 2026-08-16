import { useEffect, useRef, useState } from 'react'

/**
 * Lightweight multi-select dropdown (checkbox list in a popover).
 *
 * Props:
 *  - options: array of { value, label } (or plain strings)
 *  - value:   array of selected values
 *  - onChange(nextArray)
 *  - allLabel: text shown when nothing is selected (e.g. "All statuses")
 */
export default function MultiSelect({ options, value, onChange, allLabel = 'All' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const opts = (options || []).map((o) => (typeof o === 'object' ? o : { value: o, label: o }))
  const selected = value || []

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  function toggle(v) {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  }

  const label = selected.length === 0
    ? allLabel
    : selected.length === 1
      ? (opts.find((o) => String(o.value) === String(selected[0]))?.label ?? selected[0])
      : `${allLabel.replace(/^All\s*/i, '')} · ${selected.length} selected`

  return (
    <div className="multiselect" ref={ref}>
      <button type="button" className="secondary multiselect-btn" onClick={() => setOpen((o) => !o)}
              title={selected.length ? `${selected.length} selected` : allLabel}>
        <span className="multiselect-label">{label}</span>
        <span aria-hidden style={{ marginLeft: 6, opacity: 0.7 }}>▾</span>
      </button>
      {open && (
        <div className="multiselect-menu">
          <div className="multiselect-actions">
            <button type="button" className="secondary" style={{ padding: '2px 8px' }}
                    onClick={() => onChange([])} disabled={selected.length === 0}>Clear</button>
            <span className="hint">{selected.length} of {opts.length}</span>
          </div>
          <div className="multiselect-list">
            {opts.map((o) => (
              <label key={String(o.value)} className="multiselect-item">
                <input type="checkbox" checked={selected.map(String).includes(String(o.value))}
                       onChange={() => toggle(o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
            {opts.length === 0 && <p className="hint" style={{ padding: 6 }}>No options.</p>}
          </div>
        </div>
      )}
    </div>
  )
}
