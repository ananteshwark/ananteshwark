import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { api } from '../../api'

// Flatten a draft document to plain paragraphs (merge-field chips → their value)
// so a reviewer can edit it in a plain editor; the server derives tracked changes
// from the block-level diff, exactly like the vendor suggesting flow.
function flattenDoc(doc) {
  if (!doc || !doc.content) return { type: 'doc', content: [{ type: 'paragraph' }] }
  const content = doc.content.map((block) => {
    const inline = (block.content || []).map((n) =>
      n.type === 'mergeField' ? { type: 'text', text: n.attrs?.value || n.attrs?.field || '' } : n
    ).filter((n) => n.type !== 'text' || n.text)
    const out = { ...block, content: inline }
    if (block.type === 'heading') out.attrs = block.attrs || { level: 2 }
    return out
  })
  return { type: 'doc', content }
}

export default function ReviewEdit() {
  const { id } = useParams()
  const [draft, setDraft] = useState(null)
  const [changes, setChanges] = useState([])
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState(false)

  const editor = useEditor({
    extensions: [StarterKit, Table.configure({ resizable: true }), TableRow, TableHeader, TableCell],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  })

  const loadChanges = useCallback(() => {
    api.get(`/authoring/drafts/${id}/changes`).then(setChanges).catch(() => {})
  }, [id])

  useEffect(() => {
    api.get(`/authoring/drafts/${id}`).then((d) => {
      setDraft(d)
      if (editor) editor.commands.setContent(flattenDoc(d.document), false)
    }).catch((e) => setError(e.message))
    loadChanges()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, editor])

  async function submit() {
    if (!editor) return
    setBusy(true); setError(null); setMessage(null)
    try {
      const r = await api.post(`/authoring/drafts/${id}/reviewer-suggest-inline`, { document: editor.getJSON() })
      setMessage(r.created > 0
        ? `${r.created} suggestion(s) sent to the author for accept/reject.`
        : 'No changes detected versus the current draft.')
      loadChanges()
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  if (error && !draft) return <div className="error">{error}</div>
  if (!draft) return <p className="hint">Loading…</p>

  const myPending = changes.filter((c) => c.disposition === 'PENDING')

  return (
    <div>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>Suggest edits — {draft.title}</h2>
        <span className="badge warn">suggesting mode</span>
        <span className="spacer" />
        <Link className="btn secondary" to="/reviews">← Back to Reviews</Link>
        <button disabled={busy} onClick={submit}>Submit suggestions</button>
      </div>
      <p className="hint">
        Edit the document freely — your changes are captured as tracked suggestions (not applied directly).
        The author reviews each one and accepts (merges it in) or rejects, just like vendor redlines.
      </p>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <div className="split">
        <div className="pane" style={{ flex: 2 }}>
          <div className="doc-surface"><EditorContent editor={editor} /></div>
        </div>
        <div className="pane card" style={{ flex: 1 }}>
          <h3>Your suggestions ({changes.length})</h3>
          {changes.length === 0 && <p className="hint">None yet — edit the document and Submit.</p>}
          {myPending.length > 0 && <p className="hint">{myPending.length} awaiting the author’s decision.</p>}
          {changes.map((c) => (
            <div key={c.id} className="review-card" style={{ padding: '8px 10px' }}>
              <div className="toolbar" style={{ margin: 0 }}>
                <span className="badge">{c.change_type}</span>
                {c.clause_type && <span className="hint">{c.clause_type}</span>}
                <span className="spacer" />
                <span className={`badge ${c.disposition === 'ACCEPTED' ? 'VALIDATED' : c.disposition === 'REJECTED' ? 'REJECTED' : 'warn'}`}>
                  {c.disposition.toLowerCase()}
                </span>
              </div>
              {c.original_text && <div className="sug-old" style={{ marginTop: 6 }}>{c.original_text}</div>}
              {c.proposed_text && <div className="sug-new" style={{ marginTop: 4 }}>{c.proposed_text}</div>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
