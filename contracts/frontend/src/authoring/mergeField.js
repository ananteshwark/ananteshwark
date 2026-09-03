import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import MergeChip from './MergeChip'

// An atomic inline node bound to a register field. It renders the field's live
// value (not free-text), so field→document binding is unambiguous and editing a
// value happens via the right-pane form — clicking a chip focuses that field.
export const MergeField = Node.create({
  name: 'mergeField',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addStorage() {
    return {
      onFieldClick: null,   // set by the workspace to focus a field on chip click
      onFieldEdit: null,    // set by the workspace to write an inline edit back to the field
    }
  },

  addAttributes() {
    return {
      field: { default: '' },
      value: { default: '' },
      raw: { default: '' },      // the unformatted field value, seeded into the inline editor
      changed: { default: 0 },   // bumped when the value changes, to flash a highlight
      conflict: { default: 0 },  // bumped when an inline edit was ambiguous and needs reconciling
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-merge-field]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-merge-field': HTMLAttributes.field }), `{{${HTMLAttributes.field}}}`]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MergeChip)
  },
})

// Format a register field value the way it should read inside the document.
export function resolveMergeValue(field, fields) {
  const v = fields ? fields[field] : null
  if (v === null || v === undefined || v === '') return ''
  if (field === 'contract_value') {
    const cur = (fields && fields.currency) || ''
    const num = Number(v)
    return Number.isNaN(num) ? String(v) : `${cur} ${num.toLocaleString('en-IN')}`.trim()
  }
  return String(v)
}

// Push current field values into every merge chip, flashing the ones that moved.
// A successful sync also clears any pending conflict flag, since the field and
// the document now agree. Marked with meta 'mergeSync' so the autosave onUpdate
// handler ignores it.
export function syncMergeFields(editor, fields) {
  if (!editor || editor.isDestroyed) return
  const { state, view } = editor
  let tr = state.tr
  let changed = false
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'mergeField') {
      const next = resolveMergeValue(node.attrs.field, fields)
      const rawVal = fields && fields[node.attrs.field] != null ? String(fields[node.attrs.field]) : ''
      if (next !== node.attrs.value || rawVal !== node.attrs.raw || node.attrs.conflict) {
        tr = tr.setNodeMarkup(pos, undefined, {
          ...node.attrs, value: next, raw: rawVal,
          changed: next !== node.attrs.value ? Date.now() : node.attrs.changed, conflict: 0,
        })
        changed = true
      }
    }
  })
  if (changed) {
    tr.setMeta('mergeSync', true)
    tr.setMeta('addToHistory', false)
    view.dispatch(tr)
  }
}

// Flag every chip bound to `field` as conflicting (an inline edit was ambiguous).
export function flagFieldConflict(editor, field) {
  if (!editor || editor.isDestroyed) return
  const { state, view } = editor
  let tr = state.tr
  let changed = false
  state.doc.descendants((node, pos) => {
    if (node.type.name === 'mergeField' && node.attrs.field === field) {
      tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, conflict: Date.now() })
      changed = true
    }
  })
  if (changed) {
    tr.setMeta('mergeSync', true)
    tr.setMeta('addToHistory', false)
    view.dispatch(tr)
  }
}
