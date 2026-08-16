// Keep level-2 section headings numbered "1. …", "2. …" in document order as
// clauses are added, removed or reordered in the editor. Mirrors the server-side
// _renumber_sections so the numbering stays consistent after autosave.
export function renumberSections(editor) {
  if (!editor || editor.isDestroyed) return
  const { state, view } = editor
  const edits = []
  let n = 0
  state.doc.forEach((node, offset) => {
    if (node.type.name === 'heading' && node.attrs?.level === 2) {
      n += 1
      const first = node.firstChild
      if (first && first.isText && typeof first.text === 'string') {
        const bare = first.text.replace(/^\s*\d+\.\s*/, '')
        const want = `${n}. ${bare}`
        if (first.text !== want) {
          const from = offset + 1               // start of the heading's first text node
          edits.push({ from, to: from + first.nodeSize, text: want })
        }
      }
    }
  })
  if (!edits.length) return
  let tr = state.tr
  // Apply highest position first so earlier offsets remain valid.
  for (const e of edits.reverse()) tr = tr.replaceWith(e.from, e.to, state.schema.text(e.text))
  tr.setMeta('renumber', true)
  tr.setMeta('addToHistory', false)
  view.dispatch(tr)
}
