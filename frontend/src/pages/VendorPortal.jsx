import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { confirmDialog } from '../confirm'

// Flatten an authoring document to plain blocks (merge chips → their value text)
// so the vendor can edit it inline without the MergeField extension. The server
// diffs this same flattened form, so unchanged blocks read as equal.
function flattenDoc(doc) {
  if (!doc || !doc.content) return { type: 'doc', content: [{ type: 'paragraph' }] }
  const content = doc.content.map((block) => {
    const inline = (block.content || []).map((n) =>
      n.type === 'mergeField' ? { type: 'text', text: n.attrs?.value || '' } : n
    ).filter((n) => n.type !== 'text' || n.text)
    const out = { ...block, content: inline }
    if (block.type === 'heading') out.attrs = block.attrs || { level: 2 }
    return out
  })
  return { type: 'doc', content }
}

// Public, token-only vendor view. Uses raw fetch (no auth header, no api helper
// which would redirect to /login on 401).
async function vget(token, path = '') {
  const res = await fetch(`/api/vendor/${token}${path}`)
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Link error')
  return res.json()
}
async function vpost(token, path, body) {
  const res = await fetch(`/api/vendor/${token}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Request failed')
  return res.json()
}

function renderDoc(doc) {
  if (!doc || !doc.content) return null
  return doc.content.map((block, i) => {
    const text = (block.content || []).map((n) => n.type === 'text' ? n.text : (n.attrs?.value || `[${n.attrs?.field || ''}]`)).join('')
    if (block.type === 'heading') return <h3 key={i} style={{ marginBottom: 4 }}>{text}</h3>
    return <p key={i}>{text}</p>
  })
}

export default function VendorPortal() {
  const { token } = useParams()
  const [state, setState] = useState('loading')  // loading | otp | ready | error
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState(null)
  const [otp, setOtp] = useState('')
  const [changes, setChanges] = useState([])
  const [message, setMessage] = useState(null)
  const [mode, setMode] = useState('view')   // 'view' | 'inline'
  const [comment, setComment] = useState('')

  const inlineEditor = useEditor({ extensions: [StarterKit], content: { type: 'doc', content: [{ type: 'paragraph' }] } })

  const load = useCallback(() => {
    vget(token).then((d) => {
      if (d.otp_required) { setState('otp'); return }
      setDraft(d); setState('ready')
      vget(token, '/changes').then(setChanges).catch(() => {})
    }).catch((e) => { setError(e.message); setState('error') })
  }, [token])
  useEffect(load, [load])

  async function verify() {
    try { await vpost(token, '/verify-otp', { code: otp }); load() } catch (e) { setError(e.message) }
  }
  async function submitAll() {
    try { const r = await vpost(token, '/submit'); setMessage(r.message) } catch (e) { setError(e.message) }
  }
  async function submitComment() {
    if (!comment.trim()) return
    try {
      await vpost(token, '/changes', { change_type: 'COMMENT', rationale: comment.trim() })
      setComment(''); setMessage('Comment submitted.')
      vget(token, '/changes').then(setChanges).catch(() => {})
    } catch (e) { setError(e.message) }
  }
  async function acceptVersion() {
    if (!await confirmDialog('Accept this version of the contract? It will be sent for signature as-is.')) return
    try {
      const r = await vpost(token, '/accept')
      setMessage(r.message)
      setDraft((d) => ({ ...d, vendor_accepted: true }))
    } catch (e) { setError(e.message) }
  }
  function startInline() {
    setMode('inline')
    if (inlineEditor && draft) inlineEditor.commands.setContent(flattenDoc(draft.document), false)
  }
  async function submitInline() {
    try {
      const r = await vpost(token, '/suggest-inline', { document: inlineEditor.getJSON() })
      setMessage(r.created > 0 ? `${r.created} change(s) captured from your edits.` : 'No changes detected.')
      setMode('view')
      vget(token, '/changes').then(setChanges).catch(() => {})
    } catch (e) { setError(e.message) }
  }

  if (state === 'loading') return <div className="login-wrap"><p>Loading…</p></div>
  if (state === 'error') return <div className="login-wrap"><div className="login-card"><h2>Link unavailable</h2><div className="error">{error}</div></div></div>
  if (state === 'otp') return (
    <div className="login-wrap"><div className="login-card">
      <h2>Verify it's you</h2>
      <p className="hint">Enter the code we emailed you to open this document.</p>
      <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code" />
      {error && <div className="error">{error}</div>}
      <div style={{ marginTop: 12 }}><button style={{ width: '100%' }} onClick={verify}>Continue</button></div>
    </div></div>
  )

  const canReplace = draft.access === 'SUGGEST'
  const canComment = draft.access === 'SUGGEST' || draft.access === 'COMMENT'
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
      <div className="toolbar">
        <h2 style={{ margin: 0 }}>{draft.title}</h2>
        <span className="badge">{draft.contract_type}</span>
        <span className="hint">You are reviewing as {draft.recipient_name || draft.recipient_email} · access: {draft.access}</span>
      </div>
      {draft.cover_message && <div className="card" style={{ background: '#f3f8ff' }}>{draft.cover_message}</div>}
      <div className="toolbar">
        {draft.due_at && <span className="hint">Response requested by {new Date(draft.due_at).toLocaleDateString()}.</span>}
        <span className="spacer" />
        {draft.allow_download && (
          <a className="btn secondary" href={`/api/vendor/${token}/document.pdf`} target="_blank" rel="noreferrer">Download PDF</a>
        )}
        {draft.access !== 'VIEW' && (
          draft.vendor_accepted
            ? <span className="badge VALIDATED">✔ You accepted this version</span>
            : <button onClick={acceptVersion} title="Accept the contract as shown and send it for signature">Accept this version</button>
        )}
      </div>
      {message && <div className="success">{message}</div>}
      {error && <div className="error">{error}</div>}

      <div className="split">
        <div className="pane card" style={{ position: 'relative' }}>
          {draft.watermark && <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.06, fontSize: 48, display: 'grid', placeItems: 'center', transform: 'rotate(-20deg)' }}>CONFIDENTIAL DRAFT</div>}
          {canReplace ? (
            <div className="toolbar" style={{ margin: '0 0 8px' }}>
              <span className="hint">{mode === 'inline'
                ? 'Edit the text directly — your changes are captured as tracked edits.'
                : 'Click “Edit inline” to make changes directly in the document.'}</span>
              <span className="spacer" />
              {mode === 'view'
                ? <button className="secondary" onClick={startInline}>Edit inline</button>
                : <>
                    <button onClick={submitInline}>Submit inline edits</button>
                    <button className="secondary" onClick={() => setMode('view')}>Cancel</button>
                  </>}
            </div>
          ) : (
            <div className="toolbar" style={{ margin: '0 0 8px' }}>
              <span className="hint">{canComment ? 'Read-only — you can leave comments on the right.' : 'Read-only view.'}</span>
            </div>
          )}
          {mode === 'inline' && canReplace
            ? <div className="doc-surface"><EditorContent editor={inlineEditor} /></div>
            : renderDoc(draft.document)}
        </div>
        {canComment && (
          <div className="pane" style={{ flex: '0 0 340px' }}>
            <div className="card">
              <h3>Add a comment</h3>
              <p className="hint" style={{ marginTop: 0 }}>
                {canReplace ? 'Leave a note, or use “Edit inline” for tracked edits.' : 'Leave a note for the contract team.'}
              </p>
              <textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="Your comment…" />
              <div style={{ marginTop: 8 }}>
                <button onClick={submitComment} disabled={!comment.trim()}>Submit comment</button>
              </div>
            </div>
            <div className="card">
              <h3>Your responses ({changes.length})</h3>
              {changes.map((c) => (
                <div key={c.id} className="snippet">
                  <strong>{c.change_type}</strong> {c.clause_type ? `· ${c.clause_type}` : ''}
                  <span className={`badge ${c.disposition === 'ACCEPTED' ? 'VALIDATED' : c.disposition === 'REJECTED' ? 'REJECTED' : 'PENDING_VALIDATION'}`} style={{ marginLeft: 6 }}>{c.disposition}</span>
                  {c.change_type === 'COMMENT' && c.rationale && <div className="hint">“{c.rationale}”</div>}
                  {c.disposition_reason && <div className="hint">Response: {c.disposition_reason}</div>}
                </div>
              ))}
              {changes.length === 0 && <p className="hint">Nothing submitted yet.</p>}
              {changes.length > 0 && <div style={{ marginTop: 10 }}><button onClick={submitAll}>Return draft with my responses</button></div>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
