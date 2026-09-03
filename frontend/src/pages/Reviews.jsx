import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import MentionInput from '../components/MentionInput'

// Google-Docs-style review inbox: every request you're tagged in, the section in
// context (highlighted), a reply thread, a reviewer suggestion you can edit, and
// author accept (merge) / reject / resolve. No register-field pane here.

// Flatten a ProseMirror doc to plain-text blocks for a read-only in-context view.
function flattenDoc(doc) {
  const blocks = []
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.type === 'paragraph' || n.type === 'heading') {
        let text = ''
        for (const c of n.content || []) {
          if (c.type === 'text') text += c.text || ''
          else if (c.type === 'mergeField') text += (c.attrs?.value || c.attrs?.field || '')
        }
        blocks.push({ heading: n.type === 'heading', text })
      } else if (n.content) walk(n.content)
    }
  }
  walk(doc?.content || [])
  return blocks
}

function Highlighted({ text, needle }) {
  if (!needle || !text.includes(needle)) return <>{text || ' '}</>
  const i = text.indexOf(needle)
  return (
    <>{text.slice(0, i)}<mark className="ctx-mark">{needle}</mark>{text.slice(i + needle.length)}</>
  )
}

function InContext({ draftId, excerpt }) {
  const [doc, setDoc] = useState(null)
  useEffect(() => {
    api.get(`/authoring/drafts/${draftId}`).then((d) => setDoc(d.document)).catch(() => setDoc(false))
  }, [draftId])
  if (doc === null) return <p className="hint">Loading document…</p>
  if (doc === false) return <p className="hint">Couldn’t load the document.</p>
  const blocks = flattenDoc(doc)
  return (
    <div className="ctx-doc">
      {blocks.map((b, i) => (
        b.heading
          ? <h4 key={i}><Highlighted text={b.text} needle={excerpt} /></h4>
          : <p key={i}><Highlighted text={b.text} needle={excerpt} /></p>
      ))}
    </div>
  )
}

function Thread({ r, onChange }) {
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  async function send() {
    if (!body.trim()) return
    setBusy(true)
    try {
      await api.post(`/authoring/review-requests/${r.id}/messages`, { body: body.trim() })
      setBody(''); onChange()
    } catch (e) { alert(e.message) } finally { setBusy(false) }
  }
  return (
    <div className="review-thread">
      {r.note && <div className="thread-msg"><b>{r.requested_by_name || 'Author'}:</b> {r.note}</div>}
      {r.reviewer_comment && <div className="thread-msg"><b>{r.reviewer_name}:</b> {r.reviewer_comment}</div>}
      {(r.messages || []).map((m) => (
        <div key={m.id} className="thread-msg">
          <b>{m.user_name || 'User'}:</b> {m.body}
          <span className="hint" style={{ marginLeft: 6 }}>{m.created_at ? new Date(m.created_at).toLocaleString() : ''}</span>
        </div>
      ))}
      {!r.draft_finalized && (
        <div className="toolbar" style={{ margin: '6px 0 0' }}>
          <MentionInput value={body} onChange={setBody} onSubmit={send}
            placeholder="Reply… type @ to mention someone" />
          <button className="secondary" disabled={busy || !body.trim()} onClick={send}>Reply</button>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ r }) {
  if (r.resolution === 'accepted') return <span className="badge VALIDATED">accepted</span>
  if (r.resolution === 'rejected') return <span className="badge REJECTED">rejected</span>
  if (r.resolution === 'resolved') return <span className="badge VALIDATED">resolved</span>
  if (r.status === 'reviewed') {
    return r.outcome === 'approved'
      ? <span className="badge VALIDATED">approved</span>
      : <span className="badge warn">changes suggested</span>
  }
  return <span className="badge warn">pending</span>
}

function ReviewerForm({ r, onDone }) {
  const [suggested, setSuggested] = useState(r.excerpt || '')
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(outcome) {
    setBusy(true)
    try {
      await api.post(`/authoring/review-requests/${r.id}/complete`, {
        outcome,
        comment: comment.trim() || null,
        suggested_text: outcome === 'changes_requested' ? (suggested.trim() || null) : null,
      })
      onDone()
    } catch (e) { alert(e.message); setBusy(false) }
  }
  return (
    <div className="review-respond">
      <label>
        {r.status === 'pending'
          ? 'Edit the highlighted text to suggest a change (suggesting mode)'
          : 'Revise your suggestion — sending again replaces your previous response'}
      </label>
      <textarea rows={3} value={suggested} onChange={(e) => setSuggested(e.target.value)} />
      <label>Comment to the author (optional)</label>
      <MentionInput rows={2} value={comment} onChange={setComment}
        placeholder="Explain your suggestion… type @ to mention someone" />
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button disabled={busy} onClick={() => submit('approved')}>Approve as-is</button>
        <button className="danger" disabled={busy} onClick={() => submit('changes_requested')}>Suggest change</button>
        <Link className="linklike" to={`/authoring/drafts/${r.draft_id}/review-edit`}>
          or edit the whole document →
        </Link>
      </div>
    </div>
  )
}

function SuggestionDiff({ r }) {
  if (!r.suggested_text) return null
  return (
    <div className="suggestion-diff">
      <div className="sug-old"><span className="sug-tag">Original</span>{r.excerpt || '—'}</div>
      <div className="sug-new"><span className="sug-tag">Suggested</span>{r.suggested_text}</div>
    </div>
  )
}

function ReviewCard({ r, mine, onChange, focused }) {
  const [busy, setBusy] = useState(false)
  const [ctx, setCtx] = useState(false)
  const ref = useRef(null)
  // Notification links carry ?request=<id>. Without this the recipient
  // lands on every thread they are tagged in and has to find theirs.
  useEffect(() => {
    if (focused && ref.current) ref.current.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focused])
  async function act(kind) {
    setBusy(true)
    try { await api.post(`/authoring/review-requests/${r.id}/${kind}`); onChange() }
    catch (e) { alert(e.message); setBusy(false) }
  }
  const isAuthor = r.my_role === 'author'
  const open = !r.resolution && !r.draft_finalized
  const canDecideSuggestion = isAuthor && r.status === 'reviewed' && r.suggested_text && open

  return (
    <div className={`review-card${focused ? ' focused' : ''}`} ref={ref}>
      <div className="toolbar" style={{ margin: 0 }}>
        <Link to={`/authoring/drafts/${r.draft_id}`}><strong>{r.draft_title || `Draft #${r.draft_id}`}</strong></Link>
        <StatusBadge r={r} />
        <span className="spacer" />
        <span className="hint">
          {r.my_role === 'reviewer' ? `from ${r.requested_by_name || 'author'}` : `reviewer: ${r.reviewer_name}`}
          {r.requested_at ? ` · ${new Date(r.requested_at).toLocaleDateString()}` : ''}
        </span>
      </div>

      {r.excerpt
        ? <blockquote className="review-excerpt">{r.excerpt}</blockquote>
        : <p className="hint">Whole-draft review (no specific section highlighted).</p>}

      {r.excerpt && (
        <button className="linklike" onClick={() => setCtx((v) => !v)}>
          {ctx ? 'Hide in context' : 'Show in context ↓'}
        </button>
      )}
      {ctx && <InContext draftId={r.draft_id} excerpt={r.excerpt} />}

      <SuggestionDiff r={r} />

      {/* Conversation */}
      <Thread r={r} onChange={onChange} />

      {/* Reviewer: respond to the section, or edit the whole document */}
      {mine && open && <ReviewerForm r={r} onDone={onChange} />}

      {/* Author decisions */}
      {isAuthor && open && (
        <div className="toolbar" style={{ marginTop: 8 }}>
          {canDecideSuggestion && <button disabled={busy} onClick={() => act('accept')}>✓ Accept &amp; merge</button>}
          {canDecideSuggestion && <button className="secondary" disabled={busy} onClick={() => act('reject')}>✗ Reject edit</button>}
          <button className="secondary" disabled={busy} onClick={() => act('resolve')}>Resolve</button>
          {canDecideSuggestion && <span className="hint">Accepting merges the suggested text into the draft.</span>}
        </div>
      )}
      {r.resolution && (
        <p className="hint">
          {r.resolution === 'accepted' ? 'Suggestion merged into the draft.'
            : r.resolution === 'rejected' ? 'Suggestion was not applied.'
              : 'Thread resolved.'}
        </p>
      )}
    </div>
  )
}

export default function Reviews() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [params] = useSearchParams()
  const focusId = Number(params.get('request')) || null
  const load = useCallback(() => {
    api.get('/authoring/my-reviews').then(setData).catch((e) => setError(e.message))
  }, [])
  useEffect(() => { load() }, [load])

  if (error) return <div className="error">{error}</div>
  if (!data) return <p className="hint">Loading…</p>

  const reviewer = data.as_reviewer || []
  const author = data.as_author || []
  const pending = reviewer.filter((r) => r.status === 'pending').length
  // A link can outlive its thread — cancelled, or the draft deleted. Say so
  // rather than dropping the reader on an unexplained list.
  const missing = focusId && ![...reviewer, ...author].some((r) => r.id === focusId)

  return (
    <div>
      <h2>Reviews</h2>
      <p className="hint">
        Everywhere you’re tagged. Reviewers edit the highlighted text to suggest a change and reply in the thread;
        the author replies, resolves, or accepts — accepting merges the suggestion into the draft.
      </p>

      {missing && (
        <div className="error">
          That review is no longer available — it may have been cancelled, or the draft removed.
        </div>
      )}

      <div className="card">
        <h3>Assigned to me {pending > 0 && <span className="badge warn">{pending} to review</span>}</h3>
        {reviewer.length === 0 && <p className="hint">Nothing assigned to you.</p>}
        {reviewer.map((r) => <ReviewCard key={r.id} r={r} mine onChange={load} focused={r.id === focusId} />)}
      </div>

      <div className="card">
        <h3>My review requests</h3>
        {author.length === 0 && <p className="hint">You haven’t requested any reviews.</p>}
        {author.map((r) => <ReviewCard key={r.id} r={r} mine={false} onChange={load} focused={r.id === focusId} />)}
      </div>
    </div>
  )
}
