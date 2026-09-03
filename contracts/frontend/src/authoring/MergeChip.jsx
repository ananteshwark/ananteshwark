import { useEffect, useRef, useState } from 'react'
import { NodeViewWrapper } from '@tiptap/react'

// Renders one bound register value as an inline chip with reverse two-way
// binding: double-click to edit the value in place, which writes back to the
// register field (and re-syncs every other chip bound to the same field).
// Flashes when its value changes; a single click focuses the field in the form.
// An ambiguous edit (one that can't be mapped cleanly back to the field) leaves
// the chip flagged as "conflict" until it is reconciled in the form.
export default function MergeChip({ node, editor }) {
  const { field, value, raw, changed, conflict } = node.attrs
  const [hot, setHot] = useState(false)
  const [conflicted, setConflicted] = useState(false)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!changed) return
    setHot(true)
    const t = setTimeout(() => setHot(false), 1300)
    return () => clearTimeout(t)
  }, [changed])

  useEffect(() => { if (conflict) setConflicted(true) }, [conflict])
  // A fresh value (successful reconcile) clears the conflict marker.
  useEffect(() => { setConflicted(false) }, [value])

  useEffect(() => { if (editing && inputRef.current) { inputRef.current.focus(); inputRef.current.select() } }, [editing])

  const editable = editor?.options?.editable !== false && !!editor?.storage?.mergeField?.onFieldEdit

  const onClick = () => {
    if (editing) return
    const cb = editor?.storage?.mergeField?.onFieldClick
    if (cb) cb(field)
  }
  const startEdit = () => {
    if (!editable) return
    setText(raw != null && raw !== '' ? String(raw) : (value || ''))
    setEditing(true)
  }
  const commit = () => {
    setEditing(false)
    const cb = editor?.storage?.mergeField?.onFieldEdit
    if (cb) cb(field, text)
  }
  const onKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    else if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
    e.stopPropagation()
  }

  if (editing) {
    return (
      <NodeViewWrapper as="span" className="merge-chip editing">
        <input
          ref={inputRef} className="merge-chip-input" value={text}
          onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
          onBlur={commit} onClick={(e) => e.stopPropagation()}
          style={{ width: `${Math.max(6, text.length + 1)}ch` }}
        />
      </NodeViewWrapper>
    )
  }

  const cls = ['merge-chip']
  if (hot) cls.push('hot')
  if (!value) cls.push('empty')
  if (conflicted) cls.push('conflict')

  const title = conflicted
    ? `{{${field}}} — this inline edit was ambiguous; set the value in the form to reconcile`
    : editable
      ? `{{${field}}} — click to edit the field · double-click to edit here`
      : `{{${field}}} — click to edit in the form`

  return (
    <NodeViewWrapper as="span" className={cls.join(' ')} title={title} onClick={onClick} onDoubleClick={startEdit}>
      {conflicted && <span className="merge-chip-warn" aria-hidden>⚠ </span>}
      {value || `[${field}]`}
    </NodeViewWrapper>
  )
}
