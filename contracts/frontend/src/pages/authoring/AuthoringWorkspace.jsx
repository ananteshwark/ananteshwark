import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import { Color, FontFamily, FontSize, LineHeight, TextStyle } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import Highlight from '@tiptap/extension-highlight'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import EditorToolbar from '../../authoring/EditorToolbar'
import { api } from '../../api'
import { VendorPicker } from '../../components/ContractForm'
import LetterheadPaper from '../../components/LetterheadPaper'
import { MergeField, syncMergeFields, flagFieldConflict } from '../../authoring/mergeField'
import { renumberSections } from '../../authoring/renumber'
import { confirmDialog, promptDialog } from '../../confirm'
import { useAuth } from '../../auth'

// Custom drag payload type for dragging a clause version onto the editor.
const CLAUSE_DND = 'application/x-cms-clause'

// Kind per register field, used to interpret an inline chip edit written back to
// the form. Fields needing a structured picker (vendor/department) aren't here.
const FIELD_KIND = {
  vendor_address: 'text', service_summary: 'text',
  start_date: 'date', end_date: 'date', contract_value: 'number',
}
function normalizeDate(text) {
  const t = (text || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const ms = Date.parse(t)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString().slice(0, 10)
}

const STATUSES = ['DRAFT', 'INTERNAL_REVIEW', 'SHARED_WITH_VENDOR', 'NEGOTIATION',
  'INTERNAL_APPROVED', 'OUT_FOR_SIGNATURE', 'ON_HOLD', 'ABANDONED']

// Right-pane register fields (label, key, kind). Derived fields are read-only.
const FIELDS = [
  ['Signing Entity', 'signing_entity', 'text'],
  ['Vendor Address', 'vendor_address', 'area'],
  ['Start Date', 'start_date', 'date'],
  ['End Date', 'end_date', 'date'],
  ['Contract Tenure', 'contract_tenure', 'text'],
  ['PO Number', 'po_number', 'text'],
  ['Contract Value', 'contract_value', 'number'],
  ['Currency', 'currency', 'text'],
  ['IKS Signing Authority', 'iks_signing_authority', 'text'],
  ['Vendor Signing Authority', 'vendor_signing_authority', 'text'],
  ['Contract Service', 'contract_service', 'text'],
  ['Service Summary', 'service_summary', 'area'],
  ['Payment Term', 'payment_term', 'text'],
  ['Notice Period', 'notice_period', 'text'],
  ['Business Unit (BU)', 'location', 'text'],
  ['Any PHI Shared', 'phi_shared', 'bool'],
]

export default function AuthoringWorkspace() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [draft, setDraft] = useState(null)
  const [fields, setFields] = useState({})
  // Internal section-review workflow
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewers, setReviewers] = useState([])
  // Any active user can be a reviewer now, so the list can be long enough
  // to need filtering.
  const [reviewerFilter, setReviewerFilter] = useState('')
  const [reviewSel, setReviewSel] = useState([])       // selected reviewer ids
  const [reviewNote, setReviewNote] = useState('')
  const [reviewExcerpt, setReviewExcerpt] = useState('')
  const [reviews, setReviews] = useState({ requests: [], summary: { total: 0, pending: 0, reviewed: 0 } })
  const [reviewsPanel, setReviewsPanel] = useState(false)
  const [departments, setDepartments] = useState([])
  const [status, setStatus] = useState('DRAFT')
  const [saving, setSaving] = useState('idle')   // idle | saving | saved
  const [leaveOpen, setLeaveOpen] = useState(false)  // save/discard prompt on Back
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [showVersions, setShowVersions] = useState(false)
  const [diff, setDiff] = useState(null)   // { base, target, rows, changed }
  const [versions, setVersions] = useState([])
  const [collapse, setCollapse] = useState('')   // '' | 'left' | 'right'
  const [preview, setPreview] = useState(false)
  const [showOutline, setShowOutline] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [splitPct, setSplitPct] = useState(() => Number(localStorage.getItem('cms_authoring_split')) || 50)
  const splitRef = useRef(null)
  const splitPctRef = useRef(splitPct)
  useEffect(() => { splitPctRef.current = splitPct }, [splitPct])
  const [dockWidth, setDockWidth] = useState(() => Number(localStorage.getItem('cms_clauses_dock_w')) || 300)
  const dockWidthRef = useRef(dockWidth)
  useEffect(() => { dockWidthRef.current = dockWidth }, [dockWidth])
  const [clausePanel, setClausePanel] = useState(false)
  const [clauseType, setClauseType] = useState('')
  const [taxonomy, setTaxonomy] = useState([])
  const [clauseRows, setClauseRows] = useState([])
  const [review, setReview] = useState(null)
  const [reviewing, setReviewing] = useState(false)
  const [deviations, setDeviations] = useState(null)
  const [checkingPlaybook, setCheckingPlaybook] = useState(false)
  const [clauseMap, setClauseMap] = useState(null)
  const [mapping, setMapping] = useState(false)
  const [redlining, setRedlining] = useState(false)
  const [missing, setMissing] = useState([])   // AI-detected missing clauses (banner)
  const didAutoReview = useRef(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [share, setShare] = useState({ email: '', name: '', access: 'SUGGEST', expires_days: 14, due_days: '', cover_message: '', require_otp: false })
  const [shareLinks, setShareLinks] = useState([])
  const [signOpen, setSignOpen] = useState(false)
  const [approvals, setApprovals] = useState(null)
  const [envelope, setEnvelope] = useState(null)
  const [signers, setSigners] = useState([{ name: '', email: '', role: 'Signer', order: 1 }, { name: '', email: '', role: 'Signer', order: 2 }])
  const [sendOpts, setSendOpts] = useState({ reminder_enabled: true, reminder_frequency_days: 3, expire_days: 30, template_id: '' })

  const fieldsRef = useRef({})
  const pending = useRef({})
  const saveTimer = useRef(null)
  const loaded = useRef(false)
  const revRef = useRef(0)

  // Holds the current "insert clause at index" fn; called from the ProseMirror
  // drop handler below (which is created once and can't see later closures).
  const dndInsertRef = useRef(null)
  const renumberTimer = useRef(null)

  const editor = useEditor({
    extensions: [
      StarterKit, MergeField,
      Table.configure({ resizable: true }), TableRow, TableHeader, TableCell,
      // Contract paper is formatted paper: schedules get centred headings, rate
      // tables get sized text, defined terms get emphasis. StarterKit covers
      // bold/italic/underline/strike/lists/headings/quote/rule/link; these are
      // the rest of what the toolbar offers.
      TextStyle, Color, FontFamily, FontSize, LineHeight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Highlight.configure({ multicolor: true }),
      Subscript, Superscript,
    ],
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
    editable: true,
    editorProps: {
      // Handle the clause drop inside ProseMirror so TipTap doesn't swallow it.
      handleDOMEvents: {
        dragover: (view, event) => {
          if (Array.from(event.dataTransfer?.types || []).includes(CLAUSE_DND)) {
            event.preventDefault()   // mark the editor as a valid drop target
            return true
          }
          return false
        },
        drop: (view, event) => {
          const raw = event.dataTransfer?.getData(CLAUSE_DND)
          if (!raw) return false     // not our drag — let ProseMirror handle it
          event.preventDefault()
          let data
          try { data = JSON.parse(raw) } catch { return true }
          let index
          try {
            const info = view.posAtCoords({ left: event.clientX, top: event.clientY })
            if (info) index = view.state.doc.resolve(info.pos).index(0) + 1  // after the block dropped on
          } catch { /* fall back to append */ }
          if (dndInsertRef.current) dndInsertRef.current(data.version_id, index)
          return true
        },
      },
    },
    onUpdate: ({ editor, transaction }) => {
      if (transaction.getMeta('mergeSync')) return   // our own value sync, not a user edit
      scheduleSave({ document: editor.getJSON() })   // saves renumbered docs too
      // Re-number sections shortly after an edit (added/removed/reordered clauses).
      if (!transaction.getMeta('renumber')) {
        clearTimeout(renumberTimer.current)
        renumberTimer.current = setTimeout(() => renumberSections(editor), 400)
      }
    },
  })

  // Focus a field in the form when its chip is clicked; write an inline chip
  // edit back to the register field (reverse two-way binding).
  useEffect(() => {
    if (!editor) return
    editor.storage.mergeField.onFieldClick = (field) => {
      const el = document.getElementById(`fld-${field}`)
      if (el) { el.focus(); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1200) }
    }
    editor.storage.mergeField.onFieldEdit = (field, rawText) => {
      const text = (rawText || '').trim()
      // Structured fields can't be resolved from free text — flag and defer to the form.
      if (field === 'vendor' || field === 'department') {
        flagFieldConflict(editor, field)
        setError(`"${field}" is chosen from a list — edit it in the form to reconcile.`)
        const el = document.getElementById(`fld-${field}`); if (el) el.focus()
        return
      }
      const kind = FIELD_KIND[field] || 'text'
      if (kind === 'number') {
        const m = text.replace(/[\s,]/g, '').match(/^[A-Za-z]{0,3}(-?\d+(?:\.\d+)?)$/)
        if (!m) { flagFieldConflict(editor, field); setError(`Ambiguous value for ${field} — set it in the form.`); return }
        setField(field, Number(m[1]))
      } else if (kind === 'date') {
        const iso = normalizeDate(text)
        if (!iso) { flagFieldConflict(editor, field); setError(`Couldn't read a date for ${field} — set it in the form.`); return }
        setField(field, iso)
      } else {
        setField(field, text)
      }
      setError(null)
    }
  }, [editor])

  // Lock the document (and inline chip editing) once finalized or in preview.
  useEffect(() => {
    if (editor) editor.setEditable(!draft?.contract_id && !preview)
  }, [editor, draft, preview])

  // Highlight missing clauses (AI gap analysis) once the draft is loaded (4).
  useEffect(() => {
    if (draft && editor && !didAutoReview.current) {
      didAutoReview.current = true
      autoReview()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, editor])

  // Accessibility: Escape closes the top-most open modal / exits fullscreen.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (signOpen) setSignOpen(false)
      else if (shareOpen) setShareOpen(false)
      else if (commentsOpen) setCommentsOpen(false)
      else if (refsOpen) setRefsOpen(false)
      else if (clausePanel) setClausePanel(false)
      else if (review) setReview(null)
      else if (deviations) setDeviations(null)
      else if (clauseMap) setClauseMap(null)
      else if (showVersions) setShowVersions(false)
      else if (fullscreen) setFullscreen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Warn on tab close / refresh while a debounced autosave is still pending.
  useEffect(() => {
    const onBeforeUnload = (e) => {
      if (Object.keys(pending.current).length > 0) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const load = useCallback(() => {
    api.get(`/authoring/drafts/${id}`).then((d) => {
      setDraft(d)
      setFields(d.fields || {})
      fieldsRef.current = d.fields || {}
      revRef.current = d.rev || 0
      setStatus(d.status)
      if (editor && d.document) {
        editor.commands.setContent(d.document, false)
        syncMergeFields(editor, d.fields || {})
      }
      loaded.current = true
    }).catch((e) => setError(e.message))
  }, [id, editor])

  const [fieldPolicy, setFieldPolicy] = useState({ restricted: [], can_edit_restricted: true })
  useEffect(() => { api.get('/departments').then(setDepartments).catch(() => {}) }, [])
  useEffect(() => { api.get('/authoring/field-policy').then(setFieldPolicy).catch(() => {}) }, [])
  const locked = (key) => fieldPolicy.restricted.includes(key) && !fieldPolicy.can_edit_restricted
  useEffect(() => { if (editor) load() }, [editor, load])

  // Debounced autosave that merges pending field/document changes.
  function scheduleSave(patch) {
    if (!loaded.current) return
    pending.current = { ...pending.current, ...patch }
    setSaving('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flush, 1100)
  }

  async function flush() {
    const body = pending.current
    pending.current = {}
    if (Object.keys(body).length === 0) { setSaving('saved'); return }
    try {
      const d = await api.put(`/authoring/drafts/${id}`, { ...body, base_rev: revRef.current })
      // Server recomputes derived values (end date, amounts in words) — reflect them.
      setFields(d.fields || {})
      fieldsRef.current = d.fields || {}
      revRef.current = d.rev || 0
      if (editor) syncMergeFields(editor, d.fields || {})
      setSaving('saved')
    } catch (e) {
      // 409 = someone else saved since we loaded — reload to their version.
      if (/changed elsewhere|changed since/i.test(e.message)) {
        setError('This draft was edited in another session — reloading the latest version.')
        setTimeout(load, 400)
      } else {
        setError(e.message)
      }
      setSaving('idle')
    }
  }

  function setField(key, value) {
    const next = { ...fieldsRef.current, [key]: value === '' ? null : value }
    fieldsRef.current = next
    setFields(next)
    if (editor) syncMergeFields(editor, next)   // immediate optimistic re-render
    scheduleSave({ fields: { [key]: value === '' ? null : value } })
  }

  function onVendor(v) {
    const next = { ...fieldsRef.current, vendor: v.name }
    fieldsRef.current = next; setFields(next)
    if (editor) syncMergeFields(editor, next)
    scheduleSave({ fields: { vendor: v.name }, vendor_id: v.id === 'new' ? null : v.id })
  }

  function onDepartment(deptId) {
    const dept = departments.find((d) => String(d.id) === String(deptId))
    const next = { ...fieldsRef.current, department: dept ? dept.name : null }
    fieldsRef.current = next; setFields(next)
    if (editor) syncMergeFields(editor, next)
    scheduleSave({ fields: { department: dept ? dept.name : null }, department_id: deptId ? Number(deptId) : null })
  }

  function changeStatus(s) { setStatus(s); scheduleSave({ status: s }) }

  // --- Line items (priced schedule) ---
  function lineItems() { return Array.isArray(fields.line_items) ? fields.line_items : [] }
  function commitLineItems(rows) {
    const next = { ...fieldsRef.current, line_items: rows }
    fieldsRef.current = next; setFields(next)
    scheduleSave({ fields: { line_items: rows } })
  }
  function updateLineItem(i, key, value) {
    const rows = lineItems().map((r, j) => {
      if (j !== i) return r
      const row = { ...r, [key]: value }
      if (key === 'quantity' || key === 'unit_rate') {
        const q = Number(key === 'quantity' ? value : row.quantity)
        const rate = Number(key === 'unit_rate' ? value : row.unit_rate)
        if (!Number.isNaN(q) && !Number.isNaN(rate) && (row.quantity !== '' && row.unit_rate !== '')) row.amount = q * rate
      }
      return row
    })
    commitLineItems(rows)
  }
  function addLineItem() { commitLineItems([...lineItems(), { item: '', unit: '', quantity: '', unit_rate: '', amount: '' }]) }
  function removeLineItem(i) { commitLineItems(lineItems().filter((_, j) => j !== i)) }
  const lineItemsTotal = lineItems().reduce((a, r) => a + (Number(r.amount) || 0), 0)

  // --- Tags + attachments while drafting (3.15) ---
  const [allTags, setAllTags] = useState([])
  const [attachments, setAttachments] = useState([])
  useEffect(() => { api.get('/tags').then(setAllTags).catch(() => {}) }, [])
  const loadAttachments = useCallback(() => {
    api.get(`/authoring/drafts/${id}/attachments`).then(setAttachments).catch(() => {})
  }, [id])
  useEffect(() => { if (loaded.current) loadAttachments() }, [loadAttachments, draft])
  function tagIds() { return Array.isArray(fields.tag_ids) ? fields.tag_ids : [] }
  function toggleTag(tid) {
    const cur = tagIds()
    const next = cur.includes(tid) ? cur.filter((x) => x !== tid) : [...cur, tid]
    const merged = { ...fieldsRef.current, tag_ids: next }
    fieldsRef.current = merged; setFields(merged)
    scheduleSave({ fields: { tag_ids: next } })
  }
  async function uploadAttachment(file) {
    if (!file) return
    const fd = new FormData(); fd.append('file', file)
    try { await api.post(`/authoring/drafts/${id}/attachments`, fd); loadAttachments(); setMessage('Attachment added.') }
    catch (e) { setError(e.message) }
  }
  async function removeAttachment(aid) {
    try { await api.del(`/authoring/drafts/${id}/attachments/${aid}`); loadAttachments() }
    catch (e) { setError(e.message) }
  }

  async function openVersions() {
    setShowVersions(true)
    setVersions(await api.get(`/authoring/drafts/${id}/versions`).catch(() => []))
  }

  async function compareVersion(vno) {
    try {
      const d = await api.get(`/authoring/drafts/${id}/compare?base=${vno}&target=0`)
      setDiff(d)
    } catch (e) { setError(e.message) }
  }

  async function restore(vno) {
    if (!await confirmDialog(`Restore version ${vno}? Current state is snapshotted first.`)) return
    try {
      const d = await api.post(`/authoring/drafts/${id}/restore/${vno}`)
      setFields(d.fields || {}); fieldsRef.current = d.fields || {}
      if (editor && d.document) { editor.commands.setContent(d.document, false); syncMergeFields(editor, d.fields || {}) }
      setShowVersions(false)
    } catch (e) { setError(e.message) }
  }

  async function finalize() {
    if (!await confirmDialog('Finalize this draft into the contract register? It will enter validation (duplicate detection + reminders apply).')) return
    try {
      await flush()
      const res = await api.post(`/authoring/drafts/${id}/finalize`)
      navigate(`/validation/${res.contract_id}`)
    } catch (e) { setError(e.message) }
  }

  // Explicit save — flush any pending autosave immediately (3).
  async function saveNow() {
    clearTimeout(saveTimer.current)
    try { await flush(); setMessage('Draft saved.') }
    catch (e) { setError(e.message) }
  }

  // Cancel the draft — discard it (soft delete, recoverable from Data Retention)
  // and leave the editor (2).
  async function cancelDraft() {
    if (!await confirmDialog('Cancel this draft? It will be discarded and removed from the drafts list (recoverable from Data Retention).')) return
    clearTimeout(saveTimer.current)
    pending.current = {}
    try {
      await api.del(`/authoring/drafts/${id}`)
      navigate(window.history.length > 1 ? -1 : '/authoring/new')
    } catch (e) { setError(e.message) }
  }

  // Unsaved = a debounced autosave is still pending (edits not yet flushed).
  function hasUnsaved() {
    return saving === 'saving' || Object.keys(pending.current).length > 0
  }
  function leaveEditor() {
    navigate(window.history.length > 1 ? -1 : '/authoring/drafts')
  }
  // Back: leave straight away if everything is saved, otherwise ask.
  function goBack() {
    if (finalized || !hasUnsaved()) leaveEditor()
    else setLeaveOpen(true)
  }
  async function saveAndLeave() {
    clearTimeout(saveTimer.current)
    try { await flush(); setLeaveOpen(false); leaveEditor() }
    catch (e) { setError(e.message); setLeaveOpen(false) }
  }
  function discardAndLeave() {
    clearTimeout(saveTimer.current)
    pending.current = {}
    setLeaveOpen(false)
    leaveEditor()
  }

  function openClauses() {
    setClausePanel((open) => {
      const next = !open
      if (next) {
        if (taxonomy.length === 0) api.get('/clauses/taxonomy').then((r) => setTaxonomy(r.types)).catch(() => {})
        loadClauses('')
      }
      return next
    })
  }
  function loadClauses(t) {
    setClauseType(t)
    const p = new URLSearchParams()
    if (t) p.set('clause_type', t)
    p.set('most_used', 'true')
    api.get(`/clauses?${p}`).then(setClauseRows).catch(() => {})
  }
  // Apply a server-returned document. `undoable` replaces the whole doc as a
  // single history step (so clause insert/swap/drop can be undone), otherwise it
  // resets content without touching the undo stack (load/restore).
  function applyServerDoc(docJSON, fieldsJSON, { undoable = false } = {}) {
    if (!editor || !docJSON) return
    if (undoable) {
      try {
        const { state, view } = editor
        const node = editor.schema.nodeFromJSON(docJSON)
        view.dispatch(state.tr.replaceWith(0, state.doc.content.size, node.content))
      } catch { editor.commands.setContent(docJSON, false) }
    } else {
      editor.commands.setContent(docJSON, false)
    }
    syncMergeFields(editor, fieldsJSON || {})
  }

  async function insertClause(body) {
    try {
      const d = await api.post(`/authoring/drafts/${id}/insert-clause`, body)
      applyServerDoc(d.document, d.fields, { undoable: true })
      setFields(d.fields || {}); fieldsRef.current = d.fields || {}
      revRef.current = d.rev || revRef.current
    } catch (e) { setError(e.message) }
  }

  // --- Drag-and-drop clause insertion (2.15) ---
  function onClauseDragStart(e, versionId) {
    e.dataTransfer.setData(CLAUSE_DND, JSON.stringify({ version_id: versionId }))
    e.dataTransfer.effectAllowed = 'copy'
    // The clauses panel is a persistent side panel, so it stays open during the
    // drag — no need to close/expose anything.
  }
  // Keep the ProseMirror drop handler pointed at the current insert closure.
  dndInsertRef.current = async (versionId, index) => {
    await insertClause({ version_id: versionId, index })
    setMessage('Clause inserted.')
  }
  // Block index just after the caret's top-level block, so "Insert" drops the
  // clause at the cursor position rather than appending at the end.
  function cursorInsertIndex() {
    if (!editor) return undefined
    try { return editor.state.selection.$from.index(0) + 1 } catch { return undefined }
  }

  // Run the AI gap analysis and return its result (or null); poll the async job.
  async function fetchReview() {
    await api.post(`/authoring/drafts/${id}/review-async`)
    for (let i = 0; i < 120; i++) {
      const s = await api.get(`/authoring/drafts/${id}/review-status`)
      if (s.status === 'done') return s.result
      if (s.status === 'error') throw new Error(s.error || 'Review failed')
      await new Promise((r) => setTimeout(r, 500))
    }
    return null
  }
  async function runReview() {
    setReviewing(true); setError(null)
    try {
      const r = await fetchReview()
      if (r) { setReview(r); setMissing(r.missing || []) }
    } catch (e) { setError(e.message) }
    finally { setReviewing(false) }
  }
  async function runPlaybookCheck() {
    setCheckingPlaybook(true); setError(null)
    try { setDeviations(await api.get(`/authoring/drafts/${id}/deviations`)) }
    catch (e) { setError(e.message) }
    finally { setCheckingPlaybook(false) }
  }
  async function runAutoRedline() {
    setRedlining(true); setError(null)
    try {
      const r = await api.post(`/authoring/drafts/${id}/auto-redline`)
      const msg = !r.configured
        ? 'No playbook is configured yet — set clause tiers in the Clause Library first.'
        : r.proposed === 0
          ? 'No off-playbook clauses found — nothing to redline.'
          : `Proposed ${r.proposed} edit(s). Review them in the Redline screen.`
      window.dispatchEvent(new CustomEvent('cms:toast', { detail: { message: msg, type: r.proposed ? 'success' : 'info' } }))
    } catch (e) { setError(e.message) }
    finally { setRedlining(false) }
  }

  async function runClauseMap() {
    setMapping(true); setError(null)
    try { setClauseMap(await api.get(`/authoring/drafts/${id}/clause-map`)) }
    catch (e) { setError(e.message) }
    finally { setMapping(false) }
  }
  // Silent refresh of the missing-clauses banner (4) — no modal.
  async function autoReview() {
    try { const r = await fetchReview(); if (r) setMissing(r.missing || []) } catch { /* banner only */ }
  }
  async function insertMissing(m) {
    await insertClause(m.suggested_version_id ? { version_id: m.suggested_version_id } : { clause_type: m.clause_type, text: `${m.clause_type}: [drafting required].` })
    autoReview()
  }
  async function insertAllCritical() {
    if (!review) return
    for (const m of review.missing.filter((x) => x.severity === 'Critical')) {
      await insertClause(m.suggested_version_id ? { version_id: m.suggested_version_id } : { clause_type: m.clause_type, text: `${m.clause_type}: [drafting required].` })
    }
    runReview()
  }

  async function markReviewed() {
    try {
      const d = await api.post(`/authoring/drafts/${id}/internal-review`)
      setDraft((cur) => ({ ...cur, internal_reviewed_at: d.internal_reviewed_at }))
      setMessage('Marked internally reviewed.')
    } catch (e) { setError(e.message) }
  }

  async function openShare() {
    setShareOpen(true)
    api.get(`/authoring/drafts/${id}/shares`).then(setShareLinks).catch(() => {})
  }
  async function createShare() {
    if (!share.email.trim()) return
    // Internal review is advisory — warn, but let the author proceed regardless.
    if (reviews.summary.pending > 0) {
      const go = await confirmDialog(
        `${reviews.summary.pending} internal review(s) are still pending. Send to the vendor anyway?`,
        { title: 'Pending internal review', confirmLabel: 'Send anyway' })
      if (!go) return
    }
    try {
      const r = await api.post(`/authoring/drafts/${id}/share`, {
        recipients: [{ email: share.email.trim(), name: share.name || null }],
        access: share.access, expires_days: Number(share.expires_days) || 14,
        due_days: share.due_days ? Number(share.due_days) : null,
        cover_message: share.cover_message || null, require_otp: share.require_otp,
      })
      setShareLinks((prev) => [...r.links, ...prev])
      setMessage(`Shared with ${share.email} (round ${r.round_no}).`)
      setShare({ ...share, email: '', name: '' })
    } catch (e) { setError(e.message) }
  }
  async function revokeShare(linkId) {
    try { await api.post(`/authoring/shares/${linkId}/revoke`); api.get(`/authoring/drafts/${id}/shares`).then(setShareLinks) }
    catch (e) { setError(e.message) }
  }

  const loadReviews = useCallback(() => {
    api.get(`/authoring/drafts/${id}/review-requests`).then(setReviews).catch(() => {})
  }, [id])
  useEffect(() => { loadReviews() }, [loadReviews])

  function openReviewModal() {
    // Capture the currently highlighted text as the section under review.
    let excerpt = ''
    try {
      const { from, to } = editor.state.selection
      if (to > from) excerpt = editor.state.doc.textBetween(from, to, ' ').trim()
    } catch { /* no selection */ }
    setReviewExcerpt(excerpt)
    setReviewSel([]); setReviewNote(''); setReviewerFilter('')
    api.get('/authoring/reviewers').then(setReviewers).catch(() => {})
    setReviewOpen(true)
  }
  const visibleReviewers = useMemo(() => {
    const q = reviewerFilter.trim().toLowerCase()
    if (!q) return reviewers
    return reviewers.filter((r) => `${r.name} ${r.email}`.toLowerCase().includes(q))
  }, [reviewers, reviewerFilter])

  async function sendReview() {
    if (reviewSel.length === 0) return
    try {
      const res = await api.post(`/authoring/drafts/${id}/review-requests`, {
        reviewer_ids: reviewSel, excerpt: reviewExcerpt || null, note: reviewNote || null,
      })
      setReviews(res)
      setReviewOpen(false)
      setMessage(`Sent for internal review to ${reviewSel.length} reviewer(s).`)
    } catch (e) { setError(e.message) }
  }
  async function completeReview(reqId, outcome) {
    const comment = await promptDialog(
      outcome === 'approved' ? 'Approve this section — add a note (optional):'
        : 'Request changes — describe what needs to change:',
      { title: outcome === 'approved' ? 'Approve section' : 'Request changes',
        confirmLabel: outcome === 'approved' ? 'Approve' : 'Request changes',
        required: outcome !== 'approved' })
    if (outcome !== 'approved' && !comment) return
    try {
      await api.post(`/authoring/review-requests/${reqId}/complete`, { outcome, comment: comment || null })
      loadReviews()
      setMessage('Review recorded.')
    } catch (e) { setError(e.message) }
  }
  async function cancelReview(reqId) {
    if (!await confirmDialog('Cancel this review request?')) return
    try { await api.del(`/authoring/review-requests/${reqId}`); loadReviews() }
    catch (e) { setError(e.message) }
  }

  async function promote() {
    const name = prompt('Save this draft as a reusable template named:')
    if (!name) return
    try { await api.post(`/authoring/drafts/${id}/promote-template`, { name }); alert('Template created.') }
    catch (e) { setError(e.message) }
  }

  async function openSign() {
    setSignOpen(true)
    api.get(`/esign/drafts/${id}/approvals`).then(setApprovals).catch(() => {})
    api.get(`/esign/drafts/${id}/envelope`).then(setEnvelope).catch(() => {})
    const f = fieldsRef.current
    const dept = departments.find((d) => String(d.id) === String(draft.department_id))
    if (dept && dept.default_signers && dept.default_signers.length) {
      // Pre-populate from the department's default signer roster.
      setSigners(dept.default_signers.map((s, i) => ({
        name: s.name || '', email: s.email || '', role: s.role || 'Signer', order: s.order || i + 1,
      })))
    } else {
      setSigners([
        { name: f.iks_signing_authority || '', email: '', role: 'Signer', order: 1 },
        { name: f.vendor_signing_authority || '', email: '', role: 'Signer', order: 2 },
      ])
    }
  }
  function exportDoc(kind) {
    const ext = kind === 'pdf' ? 'pdf' : 'docx'
    api.download(`/authoring/drafts/${id}/export.${ext}`, `${draft.title || 'contract'}.${ext}`).catch((e) => setError(e.message))
  }
  function exportTracked() {
    api.download(`/authoring/drafts/${id}/export-tracked.docx`, `${draft.title || 'contract'}-tracked.docx`).catch((e) => setError(e.message))
  }
  async function importTracked(fileInput) {
    const file = fileInput.files[0]
    if (!file) return
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post(`/authoring/drafts/${id}/import-tracked?apply=true`, fd)
      window.dispatchEvent(new CustomEvent('cms:toast', { detail: { message: `Imported ${r.imported} change(s), applied ${r.applied}.`, type: 'success' } }))
      load()
    } catch (e) { setError(e.message) }
    finally { fileInput.value = '' }
  }

  // --- Internal comments ---
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState([])
  const [newComment, setNewComment] = useState('')
  function openComments() {
    setCommentsOpen(true)
    api.get(`/authoring/drafts/${id}/comments`).then(setComments).catch(() => {})
  }
  async function addComment() {
    if (!newComment.trim()) return
    try { await api.post(`/authoring/drafts/${id}/comments`, { body: newComment.trim() }); setNewComment(''); api.get(`/authoring/drafts/${id}/comments`).then(setComments) }
    catch (e) { setError(e.message) }
  }
  async function delComment(cid) {
    try { await api.del(`/authoring/comments/${cid}`); api.get(`/authoring/drafts/${id}/comments`).then(setComments) }
    catch (e) { setError(e.message) }
  }

  // --- References: defined terms + cross-references ---
  const [refsOpen, setRefsOpen] = useState(false)
  const [refs, setRefs] = useState(null)
  async function openReferences() {
    setRefsOpen(true); setRefs(null)
    try { await flush(); setRefs(await api.get(`/authoring/drafts/${id}/references`)) }
    catch (e) { setError(e.message) }
  }

  // --- Clause swap (with redline preview) ---
  // Blocks are derived by clauseBlocks() on demand; the state it replaced is gone.
  function clauseBlocks() {
    const doc = editor ? editor.getJSON() : draft.document
    const out = []
    ;(doc?.content || []).forEach((b, i) => {
      const vid = b.attrs?.clauseVersionId
      if (b.type === 'paragraph' && vid) out.push({ index: i, clauseType: b.attrs?.clauseType, versionId: vid })
    })
    return out
  }
  async function doSwap(blockIndex, versionId) {
    try {
      const res = await api.post(`/authoring/drafts/${id}/swap-clause`, { block_index: blockIndex, version_id: Number(versionId) })
      applyServerDoc(res.draft.document, res.draft.fields, { undoable: true })
      revRef.current = res.draft.rev || revRef.current
      setMessage('Clause swapped.')
    } catch (e) { setError(e.message) }
  }
  async function requestApproval(gate) {
    try { await api.post(`/esign/drafts/${id}/request-approval?gate=${gate}`); api.get(`/esign/drafts/${id}/approvals`).then(setApprovals) }
    catch (e) { setError(e.message) }
  }
  async function requestAllApprovals() {
    try { setApprovals(await api.post(`/esign/drafts/${id}/request-approvals`)) }
    catch (e) { setError(e.message) }
  }
  async function decideApproval(approvalId, status) {
    let reason = null
    if (status === 'REJECTED') { reason = prompt('Reason:'); if (!reason) return }
    try { await api.post(`/esign/approvals/${approvalId}/decide`, { status, reason }); api.get(`/esign/drafts/${id}/approvals`).then(setApprovals) }
    catch (e) { setError(e.message) }
  }
  async function sendForSignature() {
    try {
      await flush()
      const env = await api.post(`/esign/drafts/${id}/send`, {
        signers: signers.filter((s) => s.email.trim()),
        reminder_enabled: sendOpts.reminder_enabled,
        reminder_frequency_days: Number(sendOpts.reminder_frequency_days) || 3,
        expire_days: Number(sendOpts.expire_days) || 30,
        template_id: sendOpts.template_id.trim() || null,
      })
      setEnvelope(env); setMessage('Sent for signature.'); load()
    } catch (e) { setError(e.message) }
  }
  async function correctEnvelope() {
    try {
      const env = await api.post(`/esign/envelopes/${envelope.id}/correct`, {
        expire_days: Number(sendOpts.expire_days) || 30,
        reminder_enabled: sendOpts.reminder_enabled,
        reminder_frequency_days: Number(sendOpts.reminder_frequency_days) || 3,
      })
      setEnvelope(env); setMessage('Envelope reminders/expiration updated.')
    } catch (e) { setError(e.message) }
  }
  async function voidEnvelope() {
    const reason = prompt('Reason for voiding:')
    if (!reason) return
    try { await api.post(`/esign/envelopes/${envelope.id}/void?reason=${encodeURIComponent(reason)}`); openSign(); load() }
    catch (e) { setError(e.message) }
  }

  if (error && !draft) return <div className="error">{error}</div>
  if (!draft) return <p>Loading…</p>

  const finalized = draft.contract_id != null

  // Document outline (clause gutter): headings and clause-typed blocks with their
  // editor position, recomputed each render (useEditor re-renders on transactions).
  function buildOutline() {
    if (!editor) return []
    const items = []
    editor.state.doc.forEach((node, offset) => {
      const text = node.textContent
      if (node.type.name === 'heading') {
        items.push({ pos: offset + 1, label: text || 'Section', kind: 'heading', level: node.attrs?.level || 2 })
      } else if (node.type.name === 'paragraph' && node.attrs?.clauseType) {
        items.push({ pos: offset + 1, label: node.attrs.clauseType, kind: 'clause' })
      }
    })
    return items
  }
  function gotoBlock(pos) {
    editor.chain().focus().setTextSelection(pos).scrollIntoView().run()
  }

  // Draggable divider for the clauses side panel width (1).
  function startDockResize(e) {
    e.preventDefault()
    const startX = e.clientX
    const startW = dockWidthRef.current
    const move = (ev) => setDockWidth(Math.min(560, Math.max(220, startW + (ev.clientX - startX))))
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      localStorage.setItem('cms_clauses_dock_w', String(Math.round(dockWidthRef.current)))
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  // Draggable divider between the document and fields panes (3.9).
  function startResize(e) {
    e.preventDefault()
    const move = (ev) => {
      const rect = splitRef.current?.getBoundingClientRect()
      if (!rect) return
      const pct = Math.min(80, Math.max(20, ((ev.clientX - rect.left) / rect.width) * 100))
      setSplitPct(pct)
    }
    const up = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      localStorage.setItem('cms_authoring_split', String(Math.round(splitPctRef.current)))
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  return (
    <div className={fullscreen ? 'authoring-fullscreen' : ''}>
      <div className="toolbar">
        <button className="secondary" onClick={goBack} title="Back to the drafting queue">← Back</button>
        <h2 style={{ margin: 0 }}>{draft.title}</h2>
        <span className={`badge ${status}`}>{status}</span>
        <span className="hint">{saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'All changes saved' : ''}</span>
        <span className="spacer" />
        {!finalized && (
          <select value={status} onChange={(e) => changeStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <button className="secondary" onClick={() => editor && editor.chain().focus().undo().run()}
                disabled={finalized || !editor || !editor.can().undo()} title="Undo (Ctrl/Cmd+Z)">↶ Undo</button>
        <button className="secondary" onClick={() => editor && editor.chain().focus().redo().run()}
                disabled={finalized || !editor || !editor.can().redo()} title="Redo (Ctrl/Cmd+Shift+Z)">↷ Redo</button>
        <button className="secondary" onClick={saveNow} disabled={finalized} title="Save the draft now">💾 Save</button>
        <button className={`secondary${clausePanel ? ' active' : ''}`} onClick={openClauses} disabled={finalized}>Clauses</button>
        <button className="secondary" onClick={openComments}>Comments</button>
        <button className="secondary" onClick={openReferences}>References</button>
        <button className="secondary" onClick={runReview} disabled={reviewing}>{reviewing ? 'Reviewing…' : 'Review draft'}</button>
        <button className="secondary" onClick={runPlaybookCheck} disabled={checkingPlaybook}
          title="Check the draft's clauses against Legal's playbook (standard / fallback / walk-away)">
          {checkingPlaybook ? 'Checking…' : 'Playbook check'}</button>
        <button className="secondary" onClick={runAutoRedline} disabled={finalized || redlining}
          title="Propose playbook wording for every off-playbook clause, as tracked changes you can accept or reject">
          {redlining ? 'Drafting…' : '✎ Auto-redline'}</button>
        <button className={`secondary${draft.origin === 'third_party' ? ' active' : ''}`} onClick={runClauseMap} disabled={mapping}
          title="Map each clause onto the library & playbook — for reviewing counterparty paper">
          {mapping ? 'Mapping…' : `Clause map${draft.origin === 'third_party' ? ' (counterparty)' : ''}`}</button>
        <button className="secondary" onClick={openReviewModal} disabled={finalized}
          title="Send the selected section (or whole draft) to internal reviewers">Send for review</button>
        {reviews.summary.total > 0 && (
          <button className={`secondary${reviewsPanel ? ' active' : ''}`} onClick={() => setReviewsPanel((v) => !v)}
            title="Internal review requests">
            Reviews {reviews.summary.pending > 0
              ? <span className="badge warn">{reviews.summary.pending} pending</span>
              : <span className="badge VALIDATED">all done</span>}
          </button>
        )}
        <button className="secondary" onClick={openShare} disabled={finalized}>Share with vendor</button>
        <button className="secondary" onClick={openVersions}>History</button>
        <button className="secondary" onClick={() => exportDoc('docx')} title="Download as Word (.docx)">DOCX</button>
        <button className="secondary" onClick={() => exportDoc('pdf')} title="Download as PDF">PDF</button>
        <button className="secondary" onClick={exportTracked} title="Download .docx with native Word tracked changes for pending edits">DOCX (tracked)</button>
        <label className="btn secondary" style={{ margin: 0, cursor: finalized ? 'not-allowed' : 'pointer' }}
          title="Import a redlined Word .docx and apply its tracked changes">
          Import redline
          <input type="file" accept=".docx" style={{ display: 'none' }} disabled={finalized}
            onChange={(e) => importTracked(e.target)} />
        </label>
        <button className="secondary" onClick={() => setPreview((p) => !p)}>{preview ? 'Edit' : 'Preview'}</button>
        <button className="secondary" onClick={() => setFullscreen((f) => !f)} title="Toggle fullscreen">{fullscreen ? '⤢ Exit' : '⤢ Fullscreen'}</button>
        <button className="secondary" onClick={promote} disabled={finalized}>Save as template</button>
        {draft.vendor_accepted_at && <span className="badge VALIDATED" title="The vendor accepted this version">✔ Vendor accepted</span>}
        <button className="secondary" onClick={openSign} disabled={finalized}>Send for signature</button>
        <button className="danger" onClick={cancelDraft} disabled={finalized} title="Discard this draft">Cancel</button>
        <button onClick={finalize} disabled={finalized || !draft.signed}
          title={draft.signed ? 'Create the register contract' : 'Available once the document is signed (e-signed, a completed e-signature envelope, or a signed document attached)'}>
          {finalized ? `→ contract #${draft.contract_id}` : 'Finalize to register'}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      {message && <div className="success" onClick={() => setMessage(null)} style={{ cursor: 'pointer' }}>{message}</div>}
      {finalized && <div className="success">Finalized into contract #{draft.contract_id} — this draft is read-only.</div>}

      {Array.isArray(draft.stages) && (
        <div className="stage-stepper" title="Contract authoring workflow">
          {draft.stages.map((s, i) => (
            <span key={i} className={`stage-step${i < draft.stage_index ? ' done' : i === draft.stage_index ? ' current' : ''}`}>
              {i + 1}. {s}
            </span>
          ))}
        </div>
      )}

      <div className="authoring-layout">
      {clausePanel && (
        <aside className="clauses-dock card" style={{ flex: `0 0 ${dockWidth}px` }}>
          <div className="toolbar" style={{ margin: '0 0 6px' }}>
            <strong>Clauses</strong>
            <span className="spacer" />
            <button className="secondary" aria-label="Hide clauses panel" title="Hide" onClick={() => setClausePanel(false)}>×</button>
          </div>
          <p className="hint" style={{ marginTop: 0 }}>Drag a clause onto the document, or click Insert.</p>
          {clauseBlocks().length > 0 && (
            <div className="card" style={{ background: '#f7fafc', padding: 8 }}>
              <strong>Swap an existing clause</strong>
              <table className="grid" style={{ marginTop: 6 }}>
                <tbody>
                  {clauseBlocks().map((b) => (
                    <tr key={b.index}>
                      <td>{b.clauseType || 'Clause'} <span className="hint">(block {b.index})</span></td>
                      <td>
                        <select defaultValue="" onChange={async (e) => { if (e.target.value && await confirmDialog('Swap this clause to the selected version?')) doSwap(b.index, e.target.value) }}>
                          <option value="">swap to…</option>
                          {clauseRows.filter((v) => v.clause_type === b.clauseType).map((v) => (
                            <option key={v.id} value={v.id}>{v.label} · used {v.usage_count}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="toolbar" style={{ margin: '8px 0' }}>
            <select value={clauseType} onChange={(e) => loadClauses(e.target.value)} style={{ width: '100%' }}>
              <option value="">All types (most used)</option>
              {taxonomy.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="clauses-dock-list">
            {clauseRows.map((v) => (
              <div key={v.id} className="clause-dock-item" draggable onDragStart={(e) => onClauseDragStart(e, v.id)}
                   title={v.text || 'Drag onto the document, or click Insert'}>
                <div className="clause-dock-head">
                  <span className="grip" aria-hidden>⠿</span>
                  <strong>{v.clause_type}</strong> <span className="hint">{v.label}</span>
                  <span className="spacer" />
                  <button className="secondary" style={{ padding: '1px 8px' }} onClick={() => insertClause({ version_id: v.id, index: cursorInsertIndex() })}>Insert at cursor</button>
                </div>
                <div className="clause-dock-meta">
                  <span className={`riskbadge ${v.risk_posture}`}>{v.risk_posture.replace('_', ' ').toLowerCase()}</span>
                  <span className="hint">{v.status} · used {v.usage_count}</span>
                </div>
              </div>
            ))}
            {clauseRows.length === 0 && <p className="hint">No clauses yet — build the library from the Clause Library page.</p>}
          </div>
        </aside>
      )}
      {clausePanel && <div className="split-resizer" onMouseDown={startDockResize} title="Drag to resize the clauses panel" />}
      <div className="authoring-main">
      <div ref={splitRef} className={`authoring-split collapse-${collapse}`}
           style={collapse ? undefined : { gridTemplateColumns: `${splitPct}% 8px minmax(0,1fr)`, gap: 0 }}>
        <div className="pane doc-pane">
          <div className="toolbar" style={{ margin: '0 0 8px' }}>
            <strong>Document</strong>
            {editor && !finalized && !preview && <EditorToolbar editor={editor} />}
            <span className="hint">clause-aware · bound values are chips</span>
            <span className="spacer" />
            <button className={`secondary${showOutline ? ' active' : ''}`} title="Toggle clause outline" onClick={() => setShowOutline((s) => !s)}>☰ Outline</button>
            <button className="secondary" title="Collapse fields" aria-label="Collapse fields pane" onClick={() => setCollapse(collapse === 'right' ? '' : 'right')}>⇥</button>
          </div>
          {missing.length > 0 && !finalized && (
            <div className="missing-banner">
              <span className="missing-title">⚠ Missing clauses ({missing.length}) — AI review:</span>
              {missing.map((m) => (
                <button key={m.clause_type} className={`missing-chip sev-${(m.severity || '').toLowerCase()}`}
                        title={m.rationale || 'Click to insert'} onClick={() => insertMissing(m)}>
                  + {m.clause_type}
                </button>
              ))}
              <span className="spacer" />
              <button className="secondary" style={{ padding: '1px 8px' }} onClick={autoReview} title="Re-scan">↻</button>
            </div>
          )}
          <div className="doc-with-gutter">
            {showOutline && (
              <div className="clause-gutter">
                <div className="hint" style={{ padding: '4px 6px' }}>Outline</div>
                {buildOutline().map((it, i) => (
                  <div key={i} className={`gutter-item ${it.kind}`} style={{ paddingLeft: 6 + (it.level ? (it.level - 1) * 8 : 8) }}
                       onClick={() => gotoBlock(it.pos)} title={it.label}>
                    {it.kind === 'clause' ? '§ ' : ''}{it.label}
                  </div>
                ))}
                {buildOutline().length === 0 && <div className="hint" style={{ padding: 6 }}>No sections yet.</div>}
              </div>
            )}
            <div className={`doc-surface${preview ? ' preview' : ''}`} style={{ flex: 1 }}>
              {/* Drafting happens on the business unit's paper, so the author
                  can see where the letterhead leaves room for the text. */}
              <LetterheadPaper businessUnit={fields.location}>
                <EditorContent editor={editor} />
              </LetterheadPaper>
            </div>
          </div>
        </div>

        {!collapse && <div className="split-resizer" onMouseDown={startResize} title="Drag to resize" />}

        <div className="pane fields-pane">
          <div className="toolbar" style={{ margin: '0 0 8px' }}>
            <strong>Data fields</strong>
            <span className="spacer" />
            <button className="secondary" title="Collapse document" aria-label="Collapse document pane" onClick={() => setCollapse(collapse === 'left' ? '' : 'left')}>⇤</button>
          </div>
          <fieldset disabled={finalized} style={{ border: 0, padding: 0, margin: 0 }}>
            <label>Signing Entity</label>
            <input id="fld-signing_entity" value={fields.signing_entity || ''} onChange={(e) => setField('signing_entity', e.target.value)} />

            <label>Counterparty</label>
            <div id="fld-vendor"><VendorPicker value={draft.vendor_id} rawName={fields.vendor} onPick={onVendor} onCreate={(name) => onVendor({ id: 'new', name })} /></div>

            <label>Department</label>
            <select id="fld-department" value={draft.department_id || ''} onChange={(e) => onDepartment(e.target.value)}>
              <option value="">— select —</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>

            {FIELDS.map(([label, key, kind]) => (
              <div key={key}>
                <label>{label}{['contract_value', 'contract_tenure'].includes(key) && fields[`${key}_in_words`] ? <span className="hint"> · {fields[`${key}_in_words`]}</span> : null}{locked(key) ? <span className="hint" title="Editable only by Legal"> · 🔒 Legal</span> : null}</label>
                {kind === 'area'
                  ? <textarea id={`fld-${key}`} rows={2} value={fields[key] || ''} disabled={locked(key)} onChange={(e) => setField(key, e.target.value)} />
                  : kind === 'bool'
                  ? <select id={`fld-${key}`} disabled={locked(key)}
                      value={fields[key] === true ? 'yes' : fields[key] === false ? 'no' : ''}
                      onChange={(e) => setField(key, e.target.value === '' ? null : e.target.value === 'yes')}>
                      <option value="">— not set —</option>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  : <input id={`fld-${key}`} type={kind === 'number' ? 'number' : kind === 'date' ? 'date' : 'text'} disabled={locked(key)}
                      value={fields[key] ?? ''} onChange={(e) => setField(key, kind === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)} />}
              </div>
            ))}

            <div style={{ marginTop: 14, borderTop: '1px solid #e6ebf0', paddingTop: 10 }}>
              <div className="toolbar" style={{ margin: 0 }}>
                <strong>Line items</strong>
                <span className="hint">priced schedule → register</span>
                <span className="spacer" />
                <button type="button" className="secondary" onClick={addLineItem}>+ Add</button>
              </div>
              {lineItems().length > 0 && (
                <table className="grid" style={{ marginTop: 6 }}>
                  <thead><tr><th>Item</th><th>Unit</th><th>Qty</th><th>Rate</th><th>Amount</th><th /></tr></thead>
                  <tbody>
                    {lineItems().map((r, i) => (
                      <tr key={i}>
                        <td><input value={r.item ?? ''} onChange={(e) => updateLineItem(i, 'item', e.target.value)} /></td>
                        <td><input style={{ width: 56 }} value={r.unit ?? ''} onChange={(e) => updateLineItem(i, 'unit', e.target.value)} /></td>
                        <td><input style={{ width: 60 }} type="number" value={r.quantity ?? ''} onChange={(e) => updateLineItem(i, 'quantity', e.target.value === '' ? '' : Number(e.target.value))} /></td>
                        <td><input style={{ width: 80 }} type="number" value={r.unit_rate ?? ''} onChange={(e) => updateLineItem(i, 'unit_rate', e.target.value === '' ? '' : Number(e.target.value))} /></td>
                        <td><input style={{ width: 90 }} type="number" value={r.amount ?? ''} onChange={(e) => updateLineItem(i, 'amount', e.target.value === '' ? '' : Number(e.target.value))} /></td>
                        <td><button type="button" className="danger" style={{ padding: '2px 8px' }} onClick={() => removeLineItem(i)}>×</button></td>
                      </tr>
                    ))}
                    <tr><td colSpan="4" style={{ textAlign: 'right', fontWeight: 600 }}>Total</td><td style={{ fontWeight: 600 }}>{lineItemsTotal.toLocaleString('en-IN')}</td><td /></tr>
                  </tbody>
                </table>
              )}
              {lineItems().length === 0 && <p className="hint">No line items. Add priced rows to carry a schedule into the register.</p>}
            </div>

            <div style={{ marginTop: 14, borderTop: '1px solid #e6ebf0', paddingTop: 10 }}>
              <strong>Tags</strong>
              <span className="hint"> → register</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {allTags.map((t) => (
                  <button type="button" key={t.id} onClick={() => toggleTag(t.id)}
                          className={`badge ${tagIds().includes(t.id) ? 'VALIDATED' : ''}`}
                          style={{ cursor: 'pointer', border: tagIds().includes(t.id) ? '1px solid #1c6b31' : '1px solid #ccc', background: tagIds().includes(t.id) ? undefined : '#f3f5f8' }}>
                    {t.name}
                  </button>
                ))}
                {allTags.length === 0 && <span className="hint">No tags defined.</span>}
              </div>
            </div>

            <div style={{ marginTop: 14, borderTop: '1px solid #e6ebf0', paddingTop: 10 }}>
              <div className="toolbar" style={{ margin: 0 }}>
                <strong>Attachments</strong>
                <span className="hint">annexures, exhibits…</span>
                <span className="spacer" />
                <label className="btn secondary" style={{ cursor: 'pointer', margin: 0 }}>
                  + Upload
                  <input type="file" accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt,.png,.jpg,.jpeg,.tif,.tiff" style={{ display: 'none' }} onChange={(e) => { uploadAttachment(e.target.files[0]); e.target.value = '' }} />
                </label>
              </div>
              {attachments.map((a) => (
                <div key={a.id} className="snippet" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <a href="#" onClick={(e) => { e.preventDefault(); api.download(`/authoring/drafts/${id}/attachments/${a.id}/file`, a.filename).catch((err) => setError(err.message)) }}>{a.filename}</a>
                  <span><span className="hint">{a.kind} · {Math.round((a.size_bytes || 0) / 1024)} KB</span>
                    {!finalized && <button type="button" className="danger" style={{ padding: '2px 8px', marginLeft: 8 }} onClick={() => removeAttachment(a.id)}>×</button>}</span>
                </div>
              ))}
              {attachments.length === 0 && <p className="hint">No attachments yet.</p>}
            </div>
          </fieldset>
        </div>
      </div>
      </div>
      </div>

      {signOpen && (
        <div className="modal-backdrop" onClick={() => setSignOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <h3>Send for signature</h3>
            {approvals && approvals.required.length > 0 && (
              <div className="card" style={{ background: approvals.satisfied ? '#f2f8f2' : '#fff6f4' }}>
                <div className="toolbar" style={{ margin: 0 }}>
                  <strong>Approval workflow</strong>
                  <span className="spacer" />
                  {!approvals.required.every((g) => g.requested) && (
                    <button className="secondary" onClick={requestAllApprovals}>Request all</button>
                  )}
                </div>
                <table className="grid" style={{ marginTop: 6 }}>
                  <tbody>
                    {approvals.required.map((g) => (
                      <tr key={g.gate}>
                        <td>
                          {g.order != null && <span className="hint" style={{ marginRight: 6 }}>#{g.order}</span>}
                          {g.name || g.gate}
                          {g.approver_role && <span className="hint"> · {g.approver_role.toLowerCase()}</span>}
                          {!g.active && g.status === 'PENDING' && <span className="hint"> · waiting on earlier stage</span>}
                        </td>
                        <td><span className={`badge ${g.status === 'APPROVED' ? 'VALIDATED' : g.status === 'REJECTED' ? 'REJECTED' : 'PENDING_VALIDATION'}`}>{g.status}</span></td>
                        <td>
                          {g.status === 'PENDING' && !g.approval_id && <button className="secondary" onClick={() => requestApproval(g.gate)}>Request</button>}
                          {g.status === 'PENDING' && g.approval_id && <>
                            <button className="secondary" disabled={!g.active} title={g.active ? '' : 'An earlier stage must be approved first'} onClick={() => decideApproval(g.approval_id, 'APPROVED')}>Approve</button>
                            <button className="danger" onClick={() => decideApproval(g.approval_id, 'REJECTED')}>Reject</button>
                          </>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {envelope && !['VOIDED', 'DECLINED'].includes(envelope.status) ? (
              <div className="card">
                <p>Envelope <span className="badge">{envelope.status}</span> <span className="hint">{envelope.external_id}</span></p>
                <ul>{envelope.events.map((ev, i) => <li key={i} className="hint">{ev.event_type} {ev.recipient ? `· ${ev.recipient}` : ''} {ev.status ? `· ${ev.status}` : ''}</li>)}</ul>
                {envelope.options && (envelope.options.expire_days || envelope.options.reminder_enabled !== undefined) && (
                  <p className="hint">Reminders {envelope.options.reminder_enabled ? `every ${envelope.options.reminder_frequency_days}d` : 'off'} · expires in {envelope.options.expire_days}d{envelope.options.template_id ? ` · template ${envelope.options.template_id}` : ''}</p>
                )}
                {!['COMPLETED', 'VOIDED', 'DECLINED'].includes(envelope.status) && <button className="secondary" onClick={correctEnvelope}>Update reminders/expiry</button>}
                {envelope.status !== 'COMPLETED' && <button className="danger" onClick={voidEnvelope}>Void envelope</button>}
                {(envelope.signed_pdf || envelope.certificate) && (
                  <div className="toolbar" style={{ marginTop: 6 }}>
                    {envelope.signed_pdf && <a className="btn secondary" href={`/api/esign/envelopes/${envelope.id}/signed.pdf`} target="_blank" rel="noreferrer">Signed PDF</a>}
                    {envelope.certificate && <a className="btn secondary" href={`/api/esign/envelopes/${envelope.id}/certificate.pdf`} target="_blank" rel="noreferrer">Certificate of Completion</a>}
                  </div>
                )}
                {envelope.contract_id && <p className="success">Executed → contract #{envelope.contract_id}</p>}
              </div>
            ) : (
              <>
                <p className="hint">Signers are anchor-tagged; signature/date fields are pre-populated from the register signing authorities.</p>
                {signers.map((s, i) => (
                  <div className="toolbar" key={i} style={{ margin: '4px 0' }}>
                    <input placeholder="Name" value={s.name} onChange={(e) => setSigners(signers.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                    <input placeholder="Email" value={s.email} onChange={(e) => setSigners(signers.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                    <select value={s.role} onChange={(e) => setSigners(signers.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}>
                      <option>Signer</option><option>CC</option><option>Approver</option>
                    </select>
                  </div>
                ))}
                <div className="card" style={{ background: '#f7fafc', marginTop: 8 }}>
                  <strong>Delivery options</strong>
                  <div className="split" style={{ marginTop: 6 }}>
                    <div className="pane">
                      <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 400 }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked={sendOpts.reminder_enabled} onChange={(e) => setSendOpts({ ...sendOpts, reminder_enabled: e.target.checked })} /> Send reminders
                      </label>
                      <label>Reminder every (days)</label>
                      <input type="number" value={sendOpts.reminder_frequency_days} onChange={(e) => setSendOpts({ ...sendOpts, reminder_frequency_days: e.target.value })} disabled={!sendOpts.reminder_enabled} />
                    </div>
                    <div className="pane">
                      <label>Expires after (days)</label>
                      <input type="number" value={sendOpts.expire_days} onChange={(e) => setSendOpts({ ...sendOpts, expire_days: e.target.value })} />
                      <label>DocuSign template ID (optional)</label>
                      <input value={sendOpts.template_id} onChange={(e) => setSendOpts({ ...sendOpts, template_id: e.target.value })} placeholder="server template id" />
                    </div>
                  </div>
                </div>
                <div className="toolbar" style={{ marginTop: 10 }}>
                  <button onClick={sendForSignature} disabled={approvals && !approvals.satisfied}>Send</button>
                  <button className="secondary" onClick={() => setSignOpen(false)}>Cancel</button>
                  {approvals && !approvals.satisfied && <span className="hint">Approvals required before sending.</span>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {reviewOpen && (
        <div className="modal-backdrop" onClick={() => setReviewOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3>Send for internal review</h3>
            <p className="hint">
              Pick anyone who should look at this. Review is advisory — you can still send the
              draft to the vendor while reviews are outstanding, and you can send it out again
              as many times as you need.
            </p>
            <label>Section under review</label>
            {reviewExcerpt
              ? <blockquote className="review-excerpt">{reviewExcerpt}</blockquote>
              : <p className="hint">No text selected — the whole draft is under review. Tip: highlight a section in the editor before clicking “Send for review” to scope it.</p>}
            <label>Reviewers</label>
            <div className="reviewer-list">
              {reviewers.length === 0 && <p className="hint">No active users to pick from.</p>}
              <input placeholder="Filter by name…" value={reviewerFilter} style={{ marginBottom: 6 }}
                onChange={(e) => setReviewerFilter(e.target.value)} />
              {visibleReviewers.map((r) => (
                <label key={r.id} className="reviewer-row">
                  <input type="checkbox" style={{ width: 'auto' }} checked={reviewSel.includes(r.id)}
                    onChange={() => setReviewSel((s) => s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id])} />
                  {r.name} <span className="hint">· {r.role}</span>
                </label>
              ))}
            </div>
            <label>Note to reviewers (optional)</label>
            <textarea rows={2} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)}
              placeholder="e.g. please confirm the liability cap in this section" />
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button disabled={reviewSel.length === 0} onClick={sendReview}>Send to {reviewSel.length || ''} reviewer(s)</button>
              <button className="secondary" onClick={() => setReviewOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {reviewsPanel && (
        <div className="modal-backdrop" onClick={() => setReviewsPanel(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
            <h3>Internal review requests</h3>
            <p className="hint">
              {reviews.summary.reviewed}/{reviews.summary.total} completed · {reviews.summary.pending} pending.
              Review is advisory and never blocks sending to the vendor.
            </p>
            {reviews.requests.length === 0 && <p>No review requests yet.</p>}
            {reviews.requests.map((r) => {
              const mine = user && r.reviewer_id === user.id
              return (
                <div key={r.id} className="review-card">
                  <div className="toolbar" style={{ margin: 0 }}>
                    <strong>{r.reviewer_name}</strong>
                    {r.status === 'pending'
                      ? <span className="badge warn">pending</span>
                      : <span className={`badge ${r.outcome === 'approved' ? 'VALIDATED' : 'REJECTED'}`}>
                          {r.outcome === 'approved' ? 'approved' : 'changes requested'}</span>}
                    <span className="spacer" />
                    {r.status === 'pending' && <button className="secondary" onClick={() => cancelReview(r.id)}>Cancel</button>}
                  </div>
                  {r.excerpt && <blockquote className="review-excerpt">{r.excerpt}</blockquote>}
                  {r.note && <p className="hint">Note: {r.note}</p>}
                  {r.reviewer_comment && <p><b>Reviewer:</b> {r.reviewer_comment}</p>}
                  {mine && r.status === 'pending' && (
                    <div className="toolbar" style={{ marginTop: 6 }}>
                      <button onClick={() => completeReview(r.id, 'approved')}>Approve section</button>
                      <button className="danger" onClick={() => completeReview(r.id, 'changes_requested')}>Request changes</button>
                    </div>
                  )}
                </div>
              )
            })}
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button className="secondary" onClick={() => setReviewsPanel(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {shareOpen && (
        <div className="modal-backdrop" onClick={() => setShareOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <h3>Share for review</h3>
            <p className="hint">Generates a single-purpose, expiring, revocable link per recipient. Vendors need no account — the link is their access. Sharing again starts a new round and invalidates prior links.</p>
            {draft.internal_reviewed_at ? (
              <p className="hint">✓ Signed off internally on {new Date(draft.internal_reviewed_at).toLocaleDateString()}.</p>
            ) : (
              <div className="toolbar" style={{ margin: '0 0 10px' }}>
                <span className="hint" style={{ flex: 1 }}>
                  Not yet signed off internally. Required before sharing if your administrator has turned that on.
                </span>
                <button className="secondary" onClick={markReviewed}>Mark internally reviewed</button>
              </div>
            )}
            <div className="split">
              <div className="pane">
                <label>Recipient email</label>
                <input value={share.email} onChange={(e) => setShare({ ...share, email: e.target.value })} />
                <label>Recipient name</label>
                <input value={share.name} onChange={(e) => setShare({ ...share, name: e.target.value })} />
                <label>Access level</label>
                <select value={share.access} onChange={(e) => setShare({ ...share, access: e.target.value })}>
                  <option value="VIEW">View only</option>
                  <option value="COMMENT">Comment only</option>
                  <option value="SUGGEST">Suggest edits</option>
                </select>
              </div>
              <div className="pane">
                <label>Expires in (days)</label>
                <input type="number" value={share.expires_days} onChange={(e) => setShare({ ...share, expires_days: e.target.value })} />
                <label>Response due in (days, optional)</label>
                <input type="number" value={share.due_days} onChange={(e) => setShare({ ...share, due_days: e.target.value })} />
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontWeight: 400, marginTop: 12 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={share.require_otp} onChange={(e) => setShare({ ...share, require_otp: e.target.checked })} /> Require emailed OTP on first open
                </label>
              </div>
            </div>
            <label>Cover message</label>
            <textarea rows={2} value={share.cover_message} onChange={(e) => setShare({ ...share, cover_message: e.target.value })} />
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button onClick={createShare} disabled={!share.email.trim()}>Create link</button>
              <button className="secondary" onClick={() => setShareOpen(false)}>Close</button>
            </div>
            {shareLinks.length > 0 && (
              <>
                <h4>Share links</h4>
                <table className="grid">
                  <thead><tr><th>Recipient</th><th>Access</th><th>Status</th><th>Opens</th><th>Link</th><th /></tr></thead>
                  <tbody>
                    {shareLinks.map((l) => (
                      <tr key={l.id}>
                        <td>{l.recipient_email}</td><td>{l.access}</td>
                        <td>{l.revoked ? <span className="badge REJECTED">revoked</span> : l.valid ? <span className="badge VALIDATED">active</span> : <span className="badge warn">{l.invalid_reason}</span>}</td>
                        <td>{l.open_count || 0}</td>
                        <td>{!l.revoked && l.valid ? <a href={`/vendor/${l.token}`} target="_blank" rel="noreferrer">open</a> : '—'}</td>
                        <td>{!l.revoked && <button className="danger" onClick={() => revokeShare(l.id)}>Revoke</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {commentsOpen && (
        <div className="modal-backdrop" onClick={() => setCommentsOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3>Internal comments <span className="hint">— not shared with the vendor</span></h3>
            {comments.map((c) => (
              <div key={c.id} className="snippet" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{c.body} <span className="hint">— {c.author || 'someone'} · {c.created_at ? new Date(c.created_at).toLocaleString() : ''}</span></span>
                {!finalized && <button className="danger" style={{ padding: '2px 8px' }} onClick={() => delComment(c.id)}>×</button>}
              </div>
            ))}
            {comments.length === 0 && <p className="hint">No comments yet.</p>}
            {!finalized && (
              <div style={{ marginTop: 10 }}>
                <textarea rows={4} placeholder="Add an internal note…" value={newComment}
                  onChange={(e) => setNewComment(e.target.value)} style={{ width: '100%', boxSizing: 'border-box' }} />
                <div className="toolbar" style={{ marginTop: 6 }}>
                  <button onClick={addComment} disabled={!newComment.trim()}>Add</button>
                </div>
              </div>
            )}
            <div className="toolbar" style={{ marginTop: 8 }}><button className="secondary" onClick={() => setCommentsOpen(false)}>Close</button></div>
          </div>
        </div>
      )}

      {refsOpen && (
        <div className="modal-backdrop" onClick={() => setRefsOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <h3>Defined terms &amp; cross-references</h3>
            {!refs && <p className="hint">Analyzing…</p>}
            {refs && (
              <>
                {refs.issues.length > 0 && (
                  <div className="card" style={{ background: '#fff6f4' }}>
                    <strong>Issues ({refs.issues.length})</strong>
                    <ul>{refs.issues.map((i, k) => <li key={k} className="hint" style={{ color: '#b5361f' }}>{i}</li>)}</ul>
                  </div>
                )}
                <div className="split">
                  <div className="pane">
                    <h4>Defined terms ({refs.defined_terms.length})</h4>
                    {refs.defined_terms.length === 0 && <p className="hint">None detected.</p>}
                    {refs.defined_terms.map((t) => (
                      <div key={t.term} className="snippet">
                        <strong>{t.term}</strong> <span className="hint">×{t.occurrences}</span>
                        {t.unused && <span className="badge warn" style={{ marginLeft: 6 }}>unused</span>}
                      </div>
                    ))}
                  </div>
                  <div className="pane">
                    <h4>Cross-references ({refs.cross_refs.length})</h4>
                    {refs.cross_refs.length === 0 && <p className="hint">None detected.</p>}
                    {refs.cross_refs.map((c) => (
                      <div key={`${c.kind} ${c.number}`} className="snippet">
                        {c.kind} {c.number} <span className="hint">×{c.count}</span>
                        {c.dangling && <span className="badge REJECTED" style={{ marginLeft: 6 }}>no target</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button className="secondary" onClick={openReferences}>Re-scan</button>
              <button className="secondary" onClick={() => setRefsOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {review && (
        <div className="modal-backdrop" onClick={() => setReview(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>AI draft review <span className="hint">completeness {review.score}%</span></h3>
            <div className="progressbar" style={{ width: '100%' }}><div style={{ width: `${review.score}%` }} /></div>
            <div className="toolbar" style={{ margin: '10px 0' }}>
              <strong>Missing clauses ({review.missing.length})</strong>
              <span className="spacer" />
              {review.missing.some((m) => m.severity === 'Critical') &&
                <button className="secondary" onClick={insertAllCritical}>Insert all Critical</button>}
            </div>
            <table className="grid">
              <thead><tr><th>Clause</th><th>Severity</th><th>Why</th><th /></tr></thead>
              <tbody>
                {review.missing.map((m) => (
                  <tr key={m.clause_type}>
                    <td>{m.clause_type}</td>
                    <td><span className={`badge ${m.severity === 'Critical' ? 'REJECTED' : m.severity === 'Recommended' ? 'warn' : 'ARCHIVED'}`}>{m.severity}</span></td>
                    <td className="hint">{m.rationale}</td>
                    <td><button className="secondary" onClick={() => insertMissing(m)}>Insert</button></td>
                  </tr>
                ))}
                {review.missing.length === 0 && <tr><td colSpan="4" className="hint">No missing expected clauses.</td></tr>}
              </tbody>
            </table>
            {review.weak.length > 0 && (
              <>
                <h4>Weak / risky</h4>
                <ul>{review.weak.map((w) => <li key={w.clause_type} className="hint">{w.clause_type}: {w.note}</li>)}</ul>
              </>
            )}
            {review.inconsistencies.length > 0 && (
              <>
                <h4>Inconsistencies</h4>
                <ul>{review.inconsistencies.map((i, k) => <li key={k} className="hint" style={{ color: '#b5361f' }}>{i.message}</li>)}</ul>
              </>
            )}
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button className="secondary" onClick={runReview}>Re-run</button>
              <button className="secondary" onClick={() => setReview(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {deviations && (
        <div className="modal-backdrop" onClick={() => setDeviations(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3>Playbook check{' '}
              {deviations.configured && (
                <span className={`badge ${deviations.risk_level === 'high' ? 'REJECTED' : deviations.risk_level === 'medium' ? 'warn' : 'VALIDATED'}`}>
                  risk {deviations.risk_score}% · {deviations.risk_level}
                </span>
              )}
            </h3>
            {!deviations.configured ? (
              <p className="hint">No negotiation playbook is set yet. In the Clause Library, open a clause version (Legal) and assign it a playbook tier (standard / fallback / walk-away).</p>
            ) : (
              <>
                <p className="hint">
                  {deviations.on_standard} of {deviations.playbook_types.length} playbook clause type(s) on the standard position.
                </p>
                <table className="grid">
                  <thead><tr><th>Clause</th><th>Position</th><th>Match</th><th>Note</th></tr></thead>
                  <tbody>
                    {deviations.deviations.map((d) => (
                      <tr key={d.clause_type}>
                        <td>{d.clause_type}</td>
                        <td><span className={`badge ${d.level === 'high' ? 'REJECTED' : d.level === 'watch' ? 'warn' : 'VALIDATED'}`}>{d.label}</span></td>
                        <td className="hint">{d.similarity != null ? `${Math.round(d.similarity * 100)}%` : '—'}</td>
                        <td className="hint">{d.note || (d.position === 'standard' ? 'On the preferred wording.' : '')}</td>
                      </tr>
                    ))}
                    {deviations.deviations.length === 0 && <tr><td colSpan="4" className="hint">No playbook clause types apply to this draft.</td></tr>}
                  </tbody>
                </table>
              </>
            )}
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button className="secondary" onClick={runPlaybookCheck}>Re-check</button>
              <button className="secondary" onClick={() => setDeviations(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {clauseMap && (
        <div className="modal-backdrop" onClick={() => setClauseMap(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820 }}>
            <h3>Clause map <span className="hint">{clauseMap.recognised} recognised · {clauseMap.unmapped} unrecognised of {clauseMap.total_blocks} block(s)</span></h3>
            <p className="hint">Each block classified and matched to the closest approved library version{clauseMap.has_playbook ? ', with its playbook position' : ''}. Unrecognised blocks may be non-standard language a counterparty introduced — review them.</p>
            <table className="grid">
              <thead><tr><th>#</th><th>Clause</th><th>Library match</th>{clauseMap.has_playbook && <th>Playbook</th>}<th>Text</th></tr></thead>
              <tbody>
                {clauseMap.clauses.map((c) => (
                  <tr key={c.index} style={!c.clause_type ? { background: 'var(--warn-bg, #fff6e5)' } : undefined}>
                    <td>{c.index + 1}</td>
                    <td>{c.clause_type || <span className="hint">unrecognised</span>}</td>
                    <td className="hint">
                      {c.matched_version_id
                        ? <>{c.matched_label} · {c.risk_posture?.replace('_', ' ').toLowerCase()}{c.legal_approved ? ' ✓' : ''} <span>({Math.round((c.library_similarity || 0) * 100)}%)</span></>
                        : (c.clause_type ? 'no library version' : '—')}
                    </td>
                    {clauseMap.has_playbook && (
                      <td>{c.playbook_position
                        ? <span className={`badge ${c.playbook_level === 'high' ? 'REJECTED' : c.playbook_level === 'watch' ? 'warn' : 'VALIDATED'}`}>{c.playbook_label}</span>
                        : <span className="hint">—</span>}</td>
                    )}
                    <td className="hint" style={{ maxWidth: 320 }}>{c.preview}</td>
                  </tr>
                ))}
                {clauseMap.clauses.length === 0 && <tr><td colSpan={clauseMap.has_playbook ? 5 : 4} className="hint">No clause blocks detected.</td></tr>}
              </tbody>
            </table>
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button className="secondary" onClick={runClauseMap}>Re-map</button>
              <button className="secondary" onClick={() => setClauseMap(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showVersions && (
        <div className="modal-backdrop" onClick={() => setShowVersions(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>Version history</h3>
            <table className="grid">
              <thead><tr><th>Version</th><th>Note</th><th>When</th><th /></tr></thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.version_no}>
                    <td>v{v.version_no}</td>
                    <td>{v.note || '—'}</td>
                    <td className="hint">{new Date(v.created_at).toLocaleString()}</td>
                    <td>
                      <div className="toolbar" style={{ margin: 0 }}>
                        <button className="secondary" onClick={() => compareVersion(v.version_no)} title="Compare with the current draft">Compare</button>
                        {!finalized && <button className="secondary" onClick={() => restore(v.version_no)}>Restore</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button className="secondary" onClick={() => setShowVersions(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {diff && (
        <div className="modal-backdrop" onClick={() => setDiff(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 980 }}>
            <h3>Compare {diff.base} → {diff.target} <span className="hint">· {diff.changed} changed block(s)</span></h3>
            <div className="diff-view">
              <div className="diff-head">{diff.base}</div>
              <div className="diff-head">{diff.target}</div>
              {diff.rows.map((r, i) => (
                <div key={i} className={`diff-row ${r.tag}`} style={{ display: 'contents' }}>
                  <div className={`diff-cell ${r.tag === 'delete' || r.tag === 'replace' ? 'old' : ''}`}>{r.a ?? ''}</div>
                  <div className={`diff-cell ${r.tag === 'insert' || r.tag === 'replace' ? 'new' : ''}`}>{r.b ?? ''}</div>
                </div>
              ))}
              {diff.rows.length === 0 && <div className="hint" style={{ gridColumn: '1 / -1', padding: 8 }}>No content to compare.</div>}
            </div>
            <div className="toolbar" style={{ marginTop: 10 }}>
              <button className="secondary" onClick={() => setDiff(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {leaveOpen && (
        <div className="modal-backdrop" onClick={() => setLeaveOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 440 }}>
            <h3>Unsaved changes</h3>
            <p className="hint">You have edits that haven't been saved yet. Save them before leaving, or discard them?</p>
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button onClick={saveAndLeave}>Save &amp; leave</button>
              <button className="danger" onClick={discardAndLeave}>Discard &amp; leave</button>
              <span className="spacer" />
              <button className="secondary" onClick={() => setLeaveOpen(false)}>Keep editing</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
