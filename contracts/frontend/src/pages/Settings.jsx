import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { confirmDialog } from '../confirm'
import MultiSelect from '../components/MultiSelect'

const ROLE_OPTIONS = ['SUPER_ADMIN', 'ADMIN', 'VALIDATOR', 'VIEWER', 'AUTHOR', 'LEGAL', 'APPROVER']

// Suggested models per provider, roughly most→least capable. Larger models give
// better extraction accuracy; "Custom…" allows any other model id.
const MODEL_OPTIONS = {
  claude: ['claude-opus-4-8', 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
  openai: ['gpt-4o', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4.1-mini'],
  gemini: ['gemini-1.5-pro', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-flash'],
}

// Admin Settings is split into tabs so each configuration area is uncluttered.
const SETTINGS_TABS = [
  ['general', 'General'],
  ['google', 'Google & AI'],
  ['signatures', 'Signatures'],
  ['notifications', 'Notifications'],
  ['workflow', 'Workflow'],
  ['prompts', 'Prompts & Templates'],
  ['accounts', 'Users & Access'],
]

// Default signer roster is edited as one "Name | email | Role" per line.
function formatSigners(list) {
  return (list || []).map((s) => [s.name || '', s.email || '', s.role || 'Signer'].join(' | ')).join('\n')
}
function parseSigners(text) {
  return (text || '').split('\n').map((line) => line.trim()).filter(Boolean).map((line, i) => {
    const [name, email, role] = line.split('|').map((x) => (x || '').trim())
    return { name: name || '', email: email || '', role: role || 'Signer', order: i + 1 }
  }).filter((s) => s.email)
}

function InternalEntitiesCard() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState({ name: '', aliases: '' })
  const [edit, setEdit] = useState(null)
  const [err, setErr] = useState(null)
  const [msg, setMsg] = useState(null)
  const [selected, setSelected] = useState([])          // ids checked for merge
  const [mergeTarget, setMergeTarget] = useState(null)  // survivor id while modal open
  const [captured, setCaptured] = useState(null)        // consolidation panel (null = hidden)
  const [capSel, setCapSel] = useState([])              // captured values checked
  const [capTarget, setCapTarget] = useState('')        // canonical name to re-point to
  const load = () => api.get('/internal-entities').then(setRows).catch(() => {})
  useEffect(() => { load() }, [])
  const parseAliases = (s) => (s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean)
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  async function create() {
    if (!form.name.trim()) return
    try { await api.post('/internal-entities', { name: form.name.trim(), aliases: parseAliases(form.aliases) }); setForm({ name: '', aliases: '' }); load() }
    catch (e) { setErr(e.message) }
  }
  async function save() {
    setErr(null); setMsg(null)
    try {
      const res = await api.put(`/internal-entities/${edit.id}`, { name: edit.name.trim(), aliases: parseAliases(edit.aliases_text) })
      if (res.contracts_repointed > 0) setMsg(`Renamed to ${res.name}; ${res.contracts_repointed} contract(s) re-pointed to the new name.`)
      setEdit(null); load()
    } catch (e) { setErr(e.message) }
  }
  async function remove(id) {
    if (!await confirmDialog('Delete this internal entity?')) return
    try { await api.del(`/internal-entities/${id}`); load() } catch (e) { setErr(e.message) }
  }
  async function doMerge() {
    setErr(null); setMsg(null)
    const sources = selected.filter((id) => id !== mergeTarget)
    try {
      const res = await api.post(`/internal-entities/${mergeTarget}/merge`, { source_ids: sources })
      setMsg(`Merged ${res.absorbed.length} entity(ies) into ${res.target.name}; ${res.contracts_moved} contract(s) re-pointed.`)
      setSelected([]); setMergeTarget(null); load()
    } catch (e) { setErr(e.message) }
  }
  const selectedEntities = rows.filter((e) => selected.includes(e.id))

  async function openConsolidate() {
    setErr(null); setMsg(null); setCapSel([]); setCapTarget('')
    try { setCaptured((await api.get('/internal-entities/captured-values')).values) }
    catch (e) { setErr(e.message) }
  }
  async function repoint() {
    if (capSel.length === 0 || !capTarget) return
    try {
      const res = await api.post('/internal-entities/repoint', {
        from_values: capSel, to_name: capTarget, add_as_aliases: true,
      })
      setMsg(`Re-pointed ${res.contracts_moved} contract(s) to ${capTarget}${res.aliases_learned.length ? `; learned ${res.aliases_learned.length} alias(es)` : ''}.`)
      setCaptured((await api.get('/internal-entities/captured-values')).values)
      setCapSel([]); load()
    } catch (e) { setErr(e.message) }
  }

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid #e6ebf0', paddingTop: 12 }}>
      <label>Internal (organization) entities — recognized as the signing entity, never the vendor</label>
      <p className="hint">
        Define each of your own entities once, with its aliases/abbreviations. During extraction the AI
        is given these names and normalizes similar‑looking names in the document to the exact canonical
        name (e.g. “IKS”, “Inventurus Knowledge Sol Pvt Ltd” → “Inventurus Knowledge Solutions”).
      </p>
      {err && <div className="error">{err}</div>}
      {msg && <div className="success">{msg}</div>}
      {selected.length >= 2 && (
        <div className="toolbar" style={{ margin: '0 0 8px' }}>
          <button onClick={() => setMergeTarget(selected[0])}>Merge {selected.length} entities…</button>
          <button className="secondary" onClick={() => setSelected([])}>Clear selection</button>
        </div>
      )}
      <table className="grid">
        <thead><tr><th></th><th>Canonical name</th><th>Aliases / variants</th><th>Actions</th></tr></thead>
        <tbody>
          {rows.map((e) => (edit && edit.id === e.id ? (
            <tr key={e.id}>
              <td></td>
              <td><input value={edit.name} onChange={(ev) => setEdit({ ...edit, name: ev.target.value })} /></td>
              <td><input value={edit.aliases_text} placeholder="IKS, Inventurus, Inventurus Knowledge Sol"
                onChange={(ev) => setEdit({ ...edit, aliases_text: ev.target.value })} /></td>
              <td><div className="toolbar" style={{ margin: 0 }}>
                <button disabled={!edit.name.trim()} onClick={save}>Save</button>
                <button className="secondary" onClick={() => setEdit(null)}>Cancel</button>
              </div></td>
            </tr>
          ) : (
            <tr key={e.id}>
              <td><input type="checkbox" style={{ width: 'auto' }} checked={selected.includes(e.id)} onChange={() => toggle(e.id)} /></td>
              <td>{e.name}</td>
              <td className="hint">{(e.aliases || []).join(', ') || '—'}</td>
              <td><div className="toolbar" style={{ margin: 0 }}>
                <button className="secondary" onClick={() => setEdit({ id: e.id, name: e.name, aliases_text: (e.aliases || []).join(', ') })}>Edit</button>
                <button className="danger" onClick={() => remove(e.id)}>×</button>
              </div></td>
            </tr>
          )))}
          {rows.length === 0 && <tr><td colSpan="4" className="hint">No internal entities yet — add yours below.</td></tr>}
        </tbody>
      </table>
      <div className="toolbar" style={{ marginTop: 10 }}>
        <input placeholder="Canonical name (e.g. Inventurus Knowledge Solutions)" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Aliases, comma-separated (IKS, Inventurus)" value={form.aliases}
          onChange={(e) => setForm({ ...form, aliases: e.target.value })} />
        <button disabled={!form.name.trim()} onClick={create}>Add entity</button>
        <span className="spacer" />
        <button className="secondary" onClick={captured === null ? openConsolidate : () => setCaptured(null)}>
          {captured === null ? 'Consolidate captured names…' : 'Hide consolidation'}
        </button>
      </div>

      {captured !== null && (
        <div style={{ marginTop: 12, borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
          <label>Consolidate signing-entity names captured on contracts</label>
          <p className="hint">
            These are the distinct signing-entity strings currently on contracts. Variant spellings of the
            same entity (extra spaces/punctuation) show as separate rows on the dashboard. Tick the variants,
            pick the canonical entity to keep, and re-point every matching contract to it in one go. Each
            re-pointed spelling is also learned as an alias so future extraction snaps to the canonical name.
          </p>
          <table className="grid">
            <thead><tr><th></th><th>Captured value</th><th>On contracts</th><th>Resolves to</th></tr></thead>
            <tbody>
              {captured.length === 0 && <tr><td colSpan="4" className="hint">No signing-entity values on contracts yet.</td></tr>}
              {captured.map((v) => (
                <tr key={v.value}>
                  <td><input type="checkbox" style={{ width: 'auto' }} checked={capSel.includes(v.value)}
                    onChange={() => setCapSel((s) => s.includes(v.value) ? s.filter((x) => x !== v.value) : [...s, v.value])} /></td>
                  <td>{v.value}{v.is_canonical && <span className="badge VALIDATED" style={{ marginLeft: 6 }}>canonical</span>}</td>
                  <td>{v.count}</td>
                  <td className="hint">{v.canonical || <span className="badge warn">no match</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <span className="hint">{capSel.length} selected → re-point to</span>
            <select value={capTarget} onChange={(e) => setCapTarget(e.target.value)}>
              <option value="">— canonical entity —</option>
              {rows.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
            </select>
            <button disabled={capSel.length === 0 || !capTarget} onClick={repoint}>Re-point contracts</button>
          </div>
        </div>
      )}

      {mergeTarget && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 520 }}>
            <h3>Merge internal entities</h3>
            <p className="hint">
              Choose the entity to <b>keep</b>. The others are folded into it: contracts signed
              under them are re-pointed to the survivor, their names become aliases, and they are archived.
            </p>
            <label>Keep (survivor)</label>
            <select value={mergeTarget} onChange={(e) => setMergeTarget(Number(e.target.value))}>
              {selectedEntities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <p style={{ marginTop: 10 }}>
              Folding in: {selectedEntities.filter((e) => e.id !== mergeTarget).map((e) => e.name).join(', ')}
            </p>
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button onClick={doMerge}>Merge</button>
              <button className="secondary" onClick={() => setMergeTarget(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ModelSelect({ options, value, onChange }) {
  const known = options.includes(value)
  const [custom, setCustom] = useState(value !== '' && value != null && !known)

  if (custom) {
    return (
      <div className="toolbar" style={{ margin: 0 }}>
        <input value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder="model id" />
        <button type="button" className="secondary" onClick={() => { setCustom(false); onChange(options[0]) }}>
          Pick from list
        </button>
      </div>
    )
  }
  return (
    <select value={known ? value : ''} onChange={(e) => {
      if (e.target.value === '__custom__') { setCustom(true); onChange('') }
      else onChange(e.target.value)
    }}>
      {!known && <option value="" disabled>— select a model —</option>}
      {options.map((m) => <option key={m} value={m}>{m}</option>)}
      <option value="__custom__">Custom / other…</option>
    </select>
  )
}

const APPROVER_ROLES = ['LEGAL', 'APPROVER', 'ADMIN', 'VALIDATOR']
const COND_TYPES = [
  ['always', 'Always'], ['value_gte', 'Value ≥'], ['contract_type', 'Contract type ='], ['department', 'Department id ='],
]

// Editor for the configurable multi-stage approval workflow. Serializes to the
// `approval_policy` JSON setting; empty = legacy legal/finance gates.
function ApprovalWorkflowEditor({ value, onChange }) {
  let stages = []
  try { stages = value ? JSON.parse(value) : [] } catch { stages = [] }
  if (!Array.isArray(stages)) stages = []
  const push = (next) => onChange(next.length ? JSON.stringify(next) : '')
  const update = (i, patch) => push(stages.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const add = () => push([...stages, {
    key: `stage${stages.length + 1}`, name: `Stage ${stages.length + 1}`,
    approver_role: 'APPROVER', order: stages.length + 1, condition: { type: 'always' }, sla_days: null,
  }])
  const remove = (i) => push(stages.filter((_, j) => j !== i))

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--border, #e6ebf0)', paddingTop: 12 }}>
      <h4 style={{ margin: '0 0 4px' }}>Approval workflow (multi-stage)</h4>
      <p className="hint">
        Ordered, conditional, role-based approval stages required before signature. Same order number = parallel;
        lower order runs first. Leave empty to use the simple Legal/Finance gates above.
      </p>
      {stages.length > 0 && (
        <table className="grid">
          <thead><tr><th>Stage name</th><th>Approver role</th><th>Order</th><th>Applies when</th><th>SLA days</th><th></th></tr></thead>
          <tbody>
            {stages.map((s, i) => (
              <tr key={i}>
                <td><input value={s.name || ''} onChange={(e) => update(i, { name: e.target.value, key: (e.target.value || `stage${i + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, '_') })} /></td>
                <td><select value={s.approver_role || 'APPROVER'} onChange={(e) => update(i, { approver_role: e.target.value })}>
                  {APPROVER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select></td>
                <td><input type="number" min="1" style={{ maxWidth: 70 }} value={s.order ?? i + 1} onChange={(e) => update(i, { order: Number(e.target.value) })} /></td>
                <td><div className="toolbar" style={{ margin: 0 }}>
                  <select value={(s.condition || {}).type || 'always'} onChange={(e) => update(i, { condition: { type: e.target.value, value: (s.condition || {}).value } })}>
                    {COND_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                  {(s.condition || {}).type && (s.condition.type !== 'always') && (
                    <input style={{ maxWidth: 120 }} value={(s.condition || {}).value ?? ''}
                      onChange={(e) => update(i, { condition: { type: s.condition.type, value: e.target.value } })}
                      placeholder={s.condition.type === 'value_gte' ? 'amount' : s.condition.type === 'department' ? 'dept id' : 'e.g. MSA'} />
                  )}
                </div></td>
                <td><input type="number" min="0" style={{ maxWidth: 70 }} value={s.sla_days ?? ''} onChange={(e) => update(i, { sla_days: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                <td><button className="danger" onClick={() => remove(i)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="secondary" onClick={add}>+ Add stage</button>
        <span className="hint">Remember to Save settings below.</span>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const [values, setValues] = useState(null)
  const [prompts, setPrompts] = useState([])
  const [newPrompt, setNewPrompt] = useState('')
  const [emailTemplates, setEmailTemplates] = useState([])
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [newUser, setNewUser] = useState({ email: '', name: '', password: '', roles: ['VALIDATOR'] })
  const [newDept, setNewDept] = useState({ name: '', default_recipient_email: '' })
  const [editDept, setEditDept] = useState(null)
  const [resetFor, setResetFor] = useState(null)   // user object being password-reset
  const [resetPw, setResetPw] = useState('')
  const [emailTestTo, setEmailTestTo] = useState('')
  const [systemStatus, setSystemStatus] = useState(null)
  const [driveReport, setDriveReport] = useState(null)
  const [tags, setTags] = useState([])
  const [newTag, setNewTag] = useState({ name: '', color: '' })
  const [pageAccess, setPageAccess] = useState(null)  // { pages, roles, access }
  const [masterLists, setMasterLists] = useState({ currencies: [], business_units: [] })
  const [newCurrency, setNewCurrency] = useState('')
  const [newBU, setNewBU] = useState('')
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const [tab, setTab] = useState('general')

  const load = useCallback(() => {
    api.get('/settings').then(setValues).catch((e) => setError(e.message))
    api.get('/settings/prompts').then((p) => {
      setPrompts(p)
      const active = p.find((x) => x.is_active)
      if (active) setNewPrompt(active.content)
    }).catch(() => {})
    api.get('/settings/email-templates').then(setEmailTemplates).catch(() => {})
    api.get('/auth/users').then(setUsers).catch(() => {})
    api.get('/departments').then(setDepartments).catch(() => {})
    api.get('/settings/system-status').then(setSystemStatus).catch(() => {})
    api.get('/tags').then(setTags).catch(() => {})
    api.get('/settings/page-access').then(setPageAccess).catch(() => {})
    api.get('/settings/master-lists').then(setMasterLists).catch(() => {})
  }, [])

  useEffect(load, [load])

  async function pauseIngestion() {
    if (!await confirmDialog('Pause folder watching, Google Drive polling, and AI extraction? Queued files wait and nothing is lost.',
      { title: 'Pause all ingestion', danger: true, confirmLabel: 'Pause all' })) return
    try { await api.post('/settings/ingestion/pause-all'); setMessage('All ingestion paused.'); load() }
    catch (e) { setError(e.message) }
  }
  async function resumeIngestion() {
    try { await api.post('/settings/ingestion/resume-all'); setMessage('Ingestion resumed.'); load() }
    catch (e) { setError(e.message) }
  }

  async function saveSettings() {
    try {
      setValues(await api.put('/settings', { values }))
      setMessage('Settings saved — watcher/scheduler updated live')
    } catch (e) { setError(e.message) }
  }

  async function pollDriveNow() {
    setError(null)
    setMessage(null)
    setDriveReport(null)
    try {
      const res = await api.post('/settings/gdrive/poll-now')
      setDriveReport(res)
      if (res.ok) setMessage(res.message)
      else setError(res.message)
    } catch (e) { setError(e.message) }
  }

  async function savePromptVersion() {
    try {
      await api.post('/settings/prompts', { content: newPrompt, activate: true })
      setMessage('New prompt version created and activated')
      load()
    } catch (e) { setError(e.message) }
  }

  function togglePageRole(key, role) {
    setPageAccess((pa) => {
      if (!pa) return pa
      const current = pa.access[key] || []
      const next = current.includes(role) ? current.filter((r) => r !== role) : [...current, role]
      return { ...pa, access: { ...pa.access, [key]: next } }
    })
  }

  async function savePageAccess() {
    setError(null)
    try {
      const res = await api.put('/settings/page-access', { access: pageAccess.access })
      setPageAccess((pa) => ({ ...pa, access: res.access }))
      setMessage('Page access saved')
    } catch (e) { setError(e.message) }
  }

  async function saveMasterLists(next) {
    setError(null)
    try {
      const res = await api.put('/settings/master-lists', next)
      setMasterLists(res)
      setMessage('Master lists saved')
    } catch (e) { setError(e.message) }
  }
  function addCurrency() {
    const v = newCurrency.trim().toUpperCase()
    if (!v || masterLists.currencies.includes(v)) { setNewCurrency(''); return }
    saveMasterLists({ ...masterLists, currencies: [...masterLists.currencies, v] })
    setNewCurrency('')
  }
  function addBU() {
    const v = newBU.trim()
    if (!v || masterLists.business_units.includes(v)) { setNewBU(''); return }
    saveMasterLists({ ...masterLists, business_units: [...masterLists.business_units, v] })
    setNewBU('')
  }

  async function createUser() {
    try {
      await api.post('/auth/users', newUser)
      setNewUser({ email: '', name: '', password: '', roles: ['VALIDATOR'] })
      load()
    } catch (e) { setError(e.message) }
  }

  async function updateUser(id, patch) {
    setError(null)
    try {
      await api.patch(`/auth/users/${id}`, patch)
      load()
    } catch (e) { setError(e.message) }
  }

  async function deleteUser(u) {
    if (!await confirmDialog(`Remove user ${u.email}? This soft-deletes the account.`)) return
    setError(null)
    try {
      await api.del(`/auth/users/${u.id}`)
      setMessage(`User ${u.email} removed`)
      load()
    } catch (e) { setError(e.message) }
  }

  async function submitReset() {
    setError(null)
    try {
      await api.post(`/auth/users/${resetFor.id}/reset-password`, { new_password: resetPw })
      setResetFor(null); setResetPw('')
      setMessage('Password reset')
    } catch (e) { setError(e.message) }
  }

  async function sendDigestNow() {
    setError(null)
    try {
      const res = await api.post('/settings/digest-now')
      const s = res.summary || {}
      if (res.sent) {
        setMessage(`Digest ${res.dry_run ? 'logged (dry-run)' : 'sent'} — `
          + `${s.pending} pending, ${s.expiring} expiring, ${s.milestones ?? 0} obligations, ${s.failed} failed`)
      } else {
        setMessage(`Digest not sent: ${res.reason}`)
      }
    } catch (e) { setError(e.message) }
  }

  async function sendEventWebhookTest() {
    setError(null)
    try {
      const res = await api.post('/settings/event-webhook-test')
      setMessage(`Test event delivered${res.signed ? ' (signed)' : ''}`)
    } catch (e) { setError(e.message) }
  }

  async function sendChatTest(channel) {
    setError(null)
    try {
      await api.post(`/settings/notify-test?channel=${channel}`)
      setMessage(`Test message sent to ${channel}`)
    } catch (e) { setError(e.message) }
  }

  async function sendTestEmail() {
    setError(null)
    try {
      const res = await api.post('/settings/email-test', { to: emailTestTo })
      setMessage(res.detail || 'Test email sent')
    } catch (e) { setError(e.message) }
  }

  async function createTag() {
    setError(null)
    try {
      await api.post('/tags', { name: newTag.name.trim(), color: newTag.color || null })
      setNewTag({ name: '', color: '' })
      api.get('/tags').then(setTags)
    } catch (e) { setError(e.message) }
  }

  async function deleteTag(t) {
    if (!await confirmDialog(`Delete tag "${t.name}"? It will be removed from ${t.contract_count} contract(s).`)) return
    setError(null)
    try {
      await api.del(`/tags/${t.id}`)
      api.get('/tags').then(setTags)
    } catch (e) { setError(e.message) }
  }

  async function createDept() {
    try {
      await api.post('/departments', {
        name: newDept.name,
        default_recipient_email: newDept.default_recipient_email || null,
      })
      setNewDept({ name: '', default_recipient_email: '' })
      load()
    } catch (e) { setError(e.message) }
  }

  async function saveDept() {
    try {
      await api.put(`/departments/${editDept.id}`, {
        name: editDept.name,
        default_recipient_email: editDept.default_recipient_email || null,
        default_recipient_name: editDept.default_recipient_name || null,
        approval_require_legal: editDept.approval_require_legal === '' ? null : editDept.approval_require_legal === 'true',
        approval_value_threshold: editDept.approval_value_threshold === '' ? null : Number(editDept.approval_value_threshold),
        default_signers: parseSigners(editDept.default_signers_text),
      })
      setEditDept(null)
      load()
    } catch (e) { setError(e.message) }
  }

  async function deleteDept(d) {
    if (!await confirmDialog(`Delete department "${d.name}"? Existing contracts keep their data but lose this mapping.`)) return
    setError(null)
    try {
      await api.del(`/departments/${d.id}`)
      load()
    } catch (e) { setError(e.message) }
  }

  if (!values) return <p>Loading…</p>

  const set = (key) => (e) => setValues({ ...values, [key]: e.target.value })

  return (
    <div>
      <h2>Admin Settings</h2>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <div className="settings-tabs">
        {SETTINGS_TABS.map(([key, label]) => (
          <button key={key} className={`tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'general' && (<>
      {systemStatus && (
        <div className="card">
          <div className="toolbar" style={{ margin: 0 }}>
            <h3 style={{ margin: 0 }}>System status</h3>
            <span className="spacer" />
            {systemStatus.ingestion && (systemStatus.ingestion.paused_all || systemStatus.ingestion.can_resume
              ? <button className="secondary" onClick={resumeIngestion}>▶ Resume ingestion</button>
              : <button className="danger" onClick={pauseIngestion}>⏸ Pause all ingestion</button>)}
          </div>
          <p className="hint">Live state of the background services and scheduled jobs.</p>
          <table className="grid">
            <thead><tr><th>Service</th><th>State</th><th>Detail</th></tr></thead>
            <tbody>
              <tr>
                <td>Local folder watcher</td>
                <td><StatusBadge on={systemStatus.watcher.running} onText="Running" offText={systemStatus.watcher.enabled ? 'Stopped' : 'Disabled'} /></td>
                <td>{(systemStatus.watcher.roots || '—').split('\n').join(', ')}</td>
              </tr>
              {systemStatus.extraction && (
                <tr>
                  <td>AI extraction</td>
                  <td><StatusBadge on={systemStatus.extraction.enabled} onText="Running" offText="Paused" /></td>
                  <td>{systemStatus.extraction.queued ? `${systemStatus.extraction.queued} file(s) queued` : 'Idle'}</td>
                </tr>
              )}
              <tr>
                <td>Google Drive poller</td>
                <td><StatusBadge on={systemStatus.gdrive.running} onText="Running" offText={systemStatus.gdrive.enabled ? 'Stopped' : 'Disabled'} /></td>
                <td>—</td>
              </tr>
              <tr>
                <td>Scheduled digest</td>
                <td><StatusBadge on={systemStatus.digest.enabled} onText="Enabled" offText="Disabled" /></td>
                <td>{systemStatus.digest.enabled ? `${systemStatus.digest.frequency} at ${systemStatus.digest.time}` : '—'}</td>
              </tr>
              {(systemStatus.jobs || []).map((j) => (
                <tr key={j.id}>
                  <td>{j.label}</td>
                  <td><span className="badge VALIDATED">Scheduled</span></td>
                  <td>Next run: {j.next_run ? new Date(j.next_run).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h3>Folder monitoring</h3>
        <label>Watched folders — one per line, each monitored recursively (new subfolders included)</label>
        <textarea rows={3} value={values.watch_roots} onChange={set('watch_roots')}
          placeholder={'/data/contracts\n/mnt/shared/legal-agreements'} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label>Watching enabled</label>
            <select value={values.watch_enabled} onChange={set('watch_enabled')}>
              <option value="true">Enabled</option><option value="false">Disabled</option>
            </select>
          </div>
          <div>
            <label>File-type filters (extensions)</label>
            <input value={values.supported_extensions} onChange={set('supported_extensions')} />
          </div>
          <div>
            <label>File stability wait (seconds)</label>
            <input value={values.file_stability_seconds} onChange={set('file_stability_seconds')} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <label>AI extraction</label>
          <select value={values.extraction_enabled} onChange={set('extraction_enabled')} style={{ maxWidth: 220 }}>
            <option value="true">Enabled</option><option value="false">Paused (stop extraction)</option>
          </select>
          <p className="hint">
            Set <b>Watching</b> to Disabled to stop monitoring folders, and <b>AI extraction</b> to Paused to
            stop processing. Paused files stay queued and are extracted when you re-enable — nothing is lost.
          </p>
        </div>
      </div>

      </>)}

      {tab === 'google' && (<>
      <div className="card">
        <h3>Google Sign-In (SSO)</h3>
        <p className="hint">
          Lets users sign in with their Google account. Create an OAuth 2.0 Client
          ID (type “Web application”) in Google Cloud Console with this app's URL
          as an authorized JavaScript origin, and paste the Client ID below. The
          Client ID is public. Existing users are matched by email; unknown emails
          are only created when auto-provision is on and an allowed domain is set.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
          <div>
            <label>Google Sign-In</label>
            <select value={values.google_auth_enabled} onChange={set('google_auth_enabled')}>
              <option value="false">Disabled</option><option value="true">Enabled</option>
            </select>
          </div>
          <div>
            <label>OAuth Client ID</label>
            <input value={values.google_client_id} onChange={set('google_client_id')}
              placeholder="1234567890-abc.apps.googleusercontent.com" />
          </div>
          <div>
            <label>Allowed email domain (optional, restricts sign-in)</label>
            <input value={values.google_allowed_domain} onChange={set('google_allowed_domain')} placeholder="example.com" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label>Auto-provision unknown users</label>
              <select value={values.google_auto_provision} onChange={set('google_auto_provision')}>
                <option value="false">Off</option><option value="true">On (requires domain)</option>
              </select>
            </div>
            <div>
              <label>Default role for new users</label>
              <select value={values.google_default_role} onChange={set('google_default_role')}>
                <option>VIEWER</option><option>VALIDATOR</option><option>ADMIN</option><option>AUTHOR</option><option>LEGAL</option><option>APPROVER</option>
              </select>
            </div>
          </div>
        </div>
        <div style={{ marginTop: 10 }}><button onClick={saveSettings}>Save Google Sign-In settings</button></div>
      </div>

      <div className="card">
        <h3>On-prem SSO (OIDC)</h3>
        <p className="hint">Sign in against an internal identity provider (Keycloak, ADFS, Entra internal) via OpenID Connect. Local password login always remains available.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label>SSO enabled</label>
            <select value={values.oidc_enabled} onChange={set('oidc_enabled')}>
              <option value="false">Off</option><option value="true">On</option>
            </select>
          </div>
          <div>
            <label>Button label</label>
            <input value={values.oidc_button_label || ''} onChange={set('oidc_button_label')} placeholder="Sign in with SSO" />
          </div>
          <div>
            <label>Client ID</label>
            <input value={values.oidc_client_id || ''} onChange={set('oidc_client_id')} />
          </div>
          <div>
            <label>Client secret</label>
            <input type="password" value={values.oidc_client_secret || ''} onChange={set('oidc_client_secret')} autoComplete="new-password" />
          </div>
          <div>
            <label>Authorization endpoint</label>
            <input value={values.oidc_authorization_endpoint || ''} onChange={set('oidc_authorization_endpoint')} placeholder="https://idp.internal/authorize" />
          </div>
          <div>
            <label>Token endpoint</label>
            <input value={values.oidc_token_endpoint || ''} onChange={set('oidc_token_endpoint')} placeholder="https://idp.internal/token" />
          </div>
          <div>
            <label>Userinfo endpoint</label>
            <input value={values.oidc_userinfo_endpoint || ''} onChange={set('oidc_userinfo_endpoint')} placeholder="https://idp.internal/userinfo" />
          </div>
          <div>
            <label>Redirect URI</label>
            <input value={values.oidc_redirect_uri || ''} onChange={set('oidc_redirect_uri')} placeholder="https://cms.internal/api/auth/oidc/callback" />
          </div>
          <div>
            <label>Scopes</label>
            <input value={values.oidc_scopes || ''} onChange={set('oidc_scopes')} placeholder="openid email profile" />
          </div>
          <div>
            <label>Allowed email domain <span className="hint">(optional)</span></label>
            <input value={values.oidc_allowed_domain || ''} onChange={set('oidc_allowed_domain')} placeholder="example.com" />
          </div>
          <div>
            <label>Auto-provision unknown users</label>
            <select value={values.oidc_auto_provision} onChange={set('oidc_auto_provision')}>
              <option value="false">Off</option><option value="true">On</option>
            </select>
          </div>
          <div>
            <label>Default role for new users</label>
            <select value={values.oidc_default_role} onChange={set('oidc_default_role')}>
              {['VIEWER', 'VALIDATOR', 'AUTHOR', 'LEGAL', 'APPROVER', 'ADMIN'].map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginTop: 10 }}><button onClick={saveSettings}>Save SSO settings</button></div>
      </div>

      <div className="card">
        <h3>Google Drive monitoring</h3>
        <p className="hint">
          Monitors Drive folder(s) with a Google service account (read-only). New
          files are downloaded and run through the same ingestion pipeline as the
          local watched folders. Share each Drive folder with the service
          account's email, then paste its credentials JSON below.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label>Drive monitoring</label>
            <select value={values.gdrive_enabled} onChange={set('gdrive_enabled')}>
              <option value="false">Disabled</option><option value="true">Enabled</option>
            </select>
          </div>
          <div>
            <label>Poll interval (seconds, min 30)</label>
            <input value={values.gdrive_poll_seconds} onChange={set('gdrive_poll_seconds')} />
          </div>
          <div>
            <label>Local staging folder for downloads</label>
            <input value={values.gdrive_staging_dir} onChange={set('gdrive_staging_dir')} />
          </div>
        </div>
        <label>Drive folder IDs — one per line (the ID is the last path segment of the folder URL)</label>
        <textarea rows={2} value={values.gdrive_folder_ids} onChange={set('gdrive_folder_ids')}
          placeholder={'1AbCdEfGhIjKlMnOpQrStUvWxYz'} />
        <label>Service-account credentials JSON {values.gdrive_credentials_json ? '(configured — leave masked to keep)' : ''}</label>
        <textarea rows={4} value={values.gdrive_credentials_json} onChange={set('gdrive_credentials_json')}
          placeholder='{"type":"service_account", ...}' style={{ fontFamily: 'monospace' }} autoComplete="off" />
        <p className="hint">Stored server-side only, never returned to the browser.</p>
        <div className="toolbar" style={{ marginTop: 10 }}>
          <button onClick={saveSettings}>Save Drive settings</button>
          <button className="secondary" onClick={pollDriveNow}>Poll Drive now</button>
        </div>
        {driveReport && (
          <div className="card" style={{ marginTop: 10, background: driveReport.ok ? '#f2f8f2' : '#fff6f4', borderColor: driveReport.ok ? '#bfe0bf' : '#f2c4bb' }}>
            <div className="toolbar" style={{ margin: 0 }}>
              <strong>Poll result</strong>
              <span className="hint">imported {driveReport.imported} · {driveReport.seen} file(s) seen across {driveReport.folders.length} folder(s)</span>
            </div>
            {driveReport.service_account_email && (
              <p className="hint" style={{ margin: '6px 0 0' }}>
                Service account: <code>{driveReport.service_account_email}</code> — each Drive folder must be shared with this address.
              </p>
            )}
            {driveReport.folders.length > 0 && (
              <table className="grid" style={{ marginTop: 8 }}>
                <thead><tr><th>Folder ID</th><th>Listed</th><th>Importable</th><th>Imported</th><th>Problem</th></tr></thead>
                <tbody>
                  {driveReport.folders.map((f) => (
                    <tr key={f.id}>
                      <td><code>{f.id}</code></td>
                      <td>{f.listed}</td>
                      <td>{f.candidates}</td>
                      <td>{f.imported}</td>
                      <td>{f.error ? <span className="badge REJECTED">{f.error}</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {driveReport.errors.length > 0 && (
              <ul style={{ margin: '8px 0 0' }}>
                {driveReport.errors.map((e, i) => <li key={i} className="hint" style={{ color: '#b5361f' }}>{e}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h3>AI document processing</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
          <div>
            <label>Extraction provider</label>
            <select value={values.extraction_provider} onChange={set('extraction_provider')}>
              <option value="claude">Claude (Anthropic)</option>
              <option value="openai">ChatGPT (OpenAI)</option>
              <option value="gemini">Gemini (Google)</option>
              <option value="custom">Custom (self-hosted LLM)</option>
            </select>
            <p className="hint">Documents are processed with the selected provider using its API key below.
              For better accuracy, pick a larger model — then re-run any low-confidence files from the Ingestion Log (Retry).</p>
          </div>
          <div />
        </div>

        {values.extraction_provider === 'claude' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label>Anthropic API key {values.anthropic_api_key ? '(configured — leave masked to keep)' : '(currently using ANTHROPIC_API_KEY env var)'}</label>
              <input type="password" value={values.anthropic_api_key} onChange={set('anthropic_api_key')}
                placeholder="sk-ant-…" autoComplete="new-password" />
            </div>
            <div>
              <label>Claude model</label>
              <ModelSelect options={MODEL_OPTIONS.claude} value={values.claude_model}
                onChange={(v) => setValues({ ...values, claude_model: v })} />
            </div>
          </div>
        )}
        {values.extraction_provider === 'openai' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label>OpenAI API key {values.openai_api_key ? '(configured — leave masked to keep)' : ''}</label>
              <input type="password" value={values.openai_api_key} onChange={set('openai_api_key')}
                placeholder="sk-…" autoComplete="new-password" />
            </div>
            <div>
              <label>OpenAI model</label>
              <ModelSelect options={MODEL_OPTIONS.openai} value={values.openai_model}
                onChange={(v) => setValues({ ...values, openai_model: v })} />
            </div>
          </div>
        )}
        {values.extraction_provider === 'gemini' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label>Gemini API key {values.gemini_api_key ? '(configured — leave masked to keep)' : ''}</label>
              <input type="password" value={values.gemini_api_key} onChange={set('gemini_api_key')}
                placeholder="AIza…" autoComplete="new-password" />
            </div>
            <div>
              <label>Gemini model</label>
              <ModelSelect options={MODEL_OPTIONS.gemini} value={values.gemini_model}
                onChange={(v) => setValues({ ...values, gemini_model: v })} />
            </div>
          </div>
        )}
        {values.extraction_provider === 'custom' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label>Base URL (OpenAI-compatible endpoint)</label>
                <input value={values.custom_api_base} onChange={set('custom_api_base')}
                  placeholder="http://localhost:8000/v1" />
              </div>
              <div>
                <label>Model name</label>
                <input value={values.custom_model} onChange={set('custom_model')}
                  placeholder="my-model-7b" />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label>API key {values.custom_api_key ? '(configured — leave masked to keep)' : '(optional)'}</label>
                <input type="password" value={values.custom_api_key} onChange={set('custom_api_key')}
                  placeholder="leave blank if your server needs no key" autoComplete="new-password" />
              </div>
              <div />
            </div>
            <p className="hint">
              Point this at your own model server exposing the OpenAI Chat Completions API
              (vLLM, Ollama, LM Studio, LocalAI, TGI, …). The base URL usually ends in <code>/v1</code>.
            </p>
          </>
        )}
        <p className="hint">API keys are stored server-side only and never returned to the browser.</p>

        <div style={{ marginTop: 12, borderTop: '1px solid #e6ebf0', paddingTop: 12 }}>
          <label>
            <input type="checkbox" style={{ width: 'auto', marginRight: 6 }}
              checked={values.secondary_extraction_enabled === 'true'}
              onChange={(e) => setValues({ ...values, secondary_extraction_enabled: e.target.checked ? 'true' : 'false' })} />
            Enable a second AI extractor
          </label>
          <p className="hint">A different provider you can re-run a document through on demand (“Retry with 2nd AI” in the Ingestion Log) when the first extraction came out poorly.</p>
          {values.secondary_extraction_enabled === 'true' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <div>
                <label>Second extractor provider</label>
                <select value={values.secondary_extraction_provider} onChange={set('secondary_extraction_provider')}>
                  <option value="claude">Claude (Anthropic)</option>
                  <option value="openai">ChatGPT (OpenAI)</option>
                  <option value="gemini">Gemini (Google)</option>
                  <option value="custom">Custom (self-hosted LLM)</option>
                </select>
              </div>
              <div><p className="hint">Reuses the API key and model configured above for the chosen provider — pick a different provider than your primary for a useful second opinion.</p></div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 12, borderTop: '1px solid #e6ebf0', paddingTop: 12 }}>
          <label>
            <input type="checkbox" style={{ width: 'auto', marginRight: 6 }}
              checked={values.clause_ai_enabled === 'true'}
              onChange={(e) => setValues({ ...values, clause_ai_enabled: e.target.checked ? 'true' : 'false' })} />
            Use this AI model for the Authoring module
          </label>
          <p className="hint">Powers AI gap analysis, clause-difference summaries and vendor change-risk commentary using the primary provider/model above. Falls back to the built-in deterministic engine when off or when no key is configured.</p>
        </div>

        <div style={{ marginTop: 12, borderTop: '1px solid #e6ebf0', paddingTop: 12 }}>
          <label>
            <input type="checkbox" style={{ width: 'auto', marginRight: 6 }}
              checked={values.clause_autolearn !== 'false'}
              onChange={(e) => setValues({ ...values, clause_autolearn: e.target.checked ? 'true' : 'false' })} />
            Auto-feed the clause library on validation
          </label>
          <p className="hint">When a contract is validated, its clauses are segmented and added to the library automatically, so it grows without a manual “Learn” run. Curate the top versions from the Clause Library page.</p>
        </div>

        <div style={{ marginTop: 8 }}><button onClick={saveSettings}>Save provider settings</button></div>

        <InternalEntitiesCard />
      </div>

      </>)}

      {tab === 'signatures' && (<>
      <div className="card">
        <h3>E-signature (DocuSign)</h3>
        <p className="hint">Credentials are stored server-side only (the private key and webhook secret are write-only).</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label>Provider</label>
            <select value={values.esign_provider} onChange={set('esign_provider')}>
              <option value="mock">Mock (testing — drive status via webhook)</option>
              <option value="docusign">DocuSign</option>
            </select>
          </div>
          <div>
            <label>Environment base URL</label>
            <input value={values.docusign_base_url} onChange={set('docusign_base_url')} placeholder="https://demo.docusign.net" />
          </div>
        </div>
        {values.esign_provider === 'docusign' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><label>OAuth host</label><input value={values.docusign_oauth_host} onChange={set('docusign_oauth_host')} placeholder="account-d.docusign.com" /></div>
              <div><label>Account ID</label><input value={values.docusign_account_id} onChange={set('docusign_account_id')} /></div>
              <div><label>Integration key (client ID)</label><input value={values.docusign_integration_key} onChange={set('docusign_integration_key')} /></div>
              <div><label>Impersonated user ID</label><input value={values.docusign_user_id} onChange={set('docusign_user_id')} /></div>
            </div>
            <label>RSA private key (JWT grant) {values.docusign_private_key ? '(configured — leave masked to keep)' : ''}</label>
            <textarea rows={3} value={values.docusign_private_key} onChange={set('docusign_private_key')}
              placeholder="-----BEGIN RSA PRIVATE KEY-----" style={{ fontFamily: 'monospace' }} autoComplete="off" />
            <label>Connect webhook HMAC secret {values.docusign_webhook_secret ? '(configured — leave masked to keep)' : ''}</label>
            <input value={values.docusign_webhook_secret} onChange={set('docusign_webhook_secret')} placeholder="shared secret for X-DocuSign-Signature" autoComplete="off" />
            <p className="hint">Point DocuSign Connect at <code>{`${window.location.origin}/api/esign/webhook`}</code> and set the same HMAC secret there.</p>
          </>
        )}
        <div style={{ marginTop: 8 }}><button onClick={saveSettings}>Save e-signature settings</button></div>

        <div style={{ marginTop: 12, borderTop: '1px solid #e6ebf0', paddingTop: 12 }}>
          <h4 style={{ margin: '0 0 6px' }}>Approval gates (global defaults)</h4>
          <p className="hint">Per-department overrides live on each department; these are the org-wide defaults.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label>Require Legal sign-off before signature</label>
              <select value={values.approval_require_legal} onChange={set('approval_require_legal')}>
                <option value="false">No</option><option value="true">Yes</option>
              </select>
            </div>
            <div>
              <label>Finance sign-off above value (0 = never)</label>
              <input type="number" value={values.approval_value_threshold} onChange={set('approval_value_threshold')} />
            </div>
            <div>
              <label>Require approval before sharing externally</label>
              <select value={values.require_approval_before_share} onChange={set('require_approval_before_share')}>
                <option value="false">No (only before signature)</option><option value="true">Yes</option>
              </select>
            </div>
          </div>
          <ApprovalWorkflowEditor value={values.approval_policy || ''}
            onChange={(v) => setValues({ ...values, approval_policy: v })} />
          <div style={{ marginTop: 8 }}><button onClick={saveSettings}>Save settings</button></div>
          <div style={{ marginTop: 10 }}>
            <label>Restricted authoring fields <span className="hint">(only Legal/Admin may edit — comma-separated field keys, e.g. contract_value,payment_term)</span></label>
            <input value={values.restricted_authoring_fields || ''} onChange={set('restricted_authoring_fields')} placeholder="e.g. contract_value, iks_signing_authority" />
          </div>
          <div style={{ marginTop: 10 }}>
            <label>Restricted contract register fields <span className="hint">(only Legal/Admin may edit on the contract/validation screen — comma-separated, e.g. contract_value,savings_amount)</span></label>
            <input value={values.restricted_contract_fields || ''} onChange={set('restricted_contract_fields')} placeholder="e.g. contract_value, savings_amount" />
          </div>
          <div style={{ marginTop: 8 }}><button onClick={saveSettings}>Save approval settings</button></div>
        </div>
      </div>

      </>)}

      {tab === 'notifications' && (<>
      <div className="card">
        <h3>Email (SMTP)</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div><label>SMTP host</label><input value={values.smtp_host} onChange={set('smtp_host')} /></div>
          <div><label>SMTP port</label><input value={values.smtp_port} onChange={set('smtp_port')} /></div>
          <div><label>From address</label><input value={values.smtp_from} onChange={set('smtp_from')} /></div>
          <div><label>SMTP user</label><input value={values.smtp_user} onChange={set('smtp_user')} /></div>
          <div>
            <label>SMTP password {values.smtp_password ? '(configured)' : ''}</label>
            <input type="password" value={values.smtp_password} onChange={set('smtp_password')} autoComplete="new-password" />
          </div>
          <div>
            <label>TLS</label>
            <select value={values.smtp_tls} onChange={set('smtp_tls')}>
              <option value="false">Off</option><option value="true">STARTTLS</option>
            </select>
          </div>
          <div>
            <label>Delivery mode</label>
            <select value={values.email_dry_run} onChange={set('email_dry_run')}>
              <option value="true">Dry run (log only)</option>
              <option value="false">Send emails</option>
            </select>
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: 10 }}>
          <button onClick={saveSettings}>Save email settings</button>
          <span className="spacer" />
          <input placeholder="test@recipient.com" value={emailTestTo} onChange={(e) => setEmailTestTo(e.target.value)} style={{ minWidth: 220 }} />
          <button className="secondary" disabled={!emailTestTo} onClick={sendTestEmail}>Send test email</button>
        </div>
      </div>

      <div className="card">
        <h3>Outbound event webhooks</h3>
        <p className="hint">
          POST a JSON event to an external system when a contract is validated,
          rejected, renewed or terminated. If a signing secret is set, each
          request carries an <code>X-CMS-Signature</code> (HMAC-SHA256) header so
          the receiver can verify it. URL and secret are stored write-only.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
          <div>
            <label>Event webhooks</label>
            <select value={values.event_webhook_enabled} onChange={set('event_webhook_enabled')}>
              <option value="false">Disabled</option><option value="true">Enabled</option>
            </select>
          </div>
          <div>
            <label>Webhook URL {values.event_webhook_url ? '(configured — leave masked to keep)' : ''}</label>
            <input type="password" value={values.event_webhook_url} onChange={set('event_webhook_url')}
              placeholder="https://api.example.com/cms-events" autoComplete="new-password" />
          </div>
          <div>
            <label>Signing secret (optional) {values.event_webhook_secret ? '(configured)' : ''}</label>
            <input type="password" value={values.event_webhook_secret} onChange={set('event_webhook_secret')} autoComplete="new-password" />
          </div>
          <div>
            <label>Events (comma-separated; blank = all)</label>
            <input value={values.event_webhook_events} onChange={set('event_webhook_events')}
              placeholder="contract.validated, contract.terminated" />
          </div>
        </div>
        <div className="toolbar" style={{ marginTop: 10 }}>
          <button onClick={saveSettings}>Save webhook settings</button>
          <button className="secondary" onClick={sendEventWebhookTest}>Send test event</button>
        </div>
      </div>

      <div className="card">
        <h3>Chat notifications (Slack / Teams)</h3>
        <p className="hint">
          Paste an incoming-webhook URL to deliver reminders (add the channel to a
          reminder rule) and, optionally, the scheduled digest. URLs are stored
          write-only and never returned to the browser.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <label>Slack webhook URL {values.slack_webhook_url ? '(configured — leave masked to keep)' : ''}</label>
            <input type="password" value={values.slack_webhook_url} onChange={set('slack_webhook_url')}
              placeholder="https://hooks.slack.com/services/…" autoComplete="new-password" />
          </div>
          <button className="secondary" onClick={() => sendChatTest('slack')}>Test Slack</button>
          <div>
            <label>Microsoft Teams webhook URL {values.teams_webhook_url ? '(configured — leave masked to keep)' : ''}</label>
            <input type="password" value={values.teams_webhook_url} onChange={set('teams_webhook_url')}
              placeholder="https://outlook.office.com/webhook/…" autoComplete="new-password" />
          </div>
          <button className="secondary" onClick={() => sendChatTest('teams')}>Test Teams</button>
        </div>
        <label style={{ marginTop: 10 }}>Also post the scheduled digest to chat</label>
        <select value={values.digest_chat_enabled} onChange={set('digest_chat_enabled')}>
          <option value="false">Email only</option>
          <option value="true">Email + chat</option>
        </select>
        <div style={{ marginTop: 10 }}><button onClick={saveSettings}>Save chat settings</button></div>
      </div>

      <div className="card">
        <h3>Extraction failure alerts</h3>
        <p className="hint">Notify admins by email (and optionally a webhook) when a document fails extraction.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
          <div>
            <label>Failure alerts</label>
            <select value={values.failure_alerts_enabled} onChange={set('failure_alerts_enabled')}>
              <option value="true">Enabled</option><option value="false">Disabled</option>
            </select>
          </div>
          <div>
            <label>Alert recipients (comma-separated; blank = all admins)</label>
            <input value={values.failure_alert_emails} onChange={set('failure_alert_emails')} placeholder="ops@example.com, lead@example.com" />
          </div>
        </div>
        <label>Webhook URL (optional — receives a JSON POST per failure)</label>
        <input value={values.failure_alert_webhook} onChange={set('failure_alert_webhook')} placeholder="https://hooks.example.com/cms-failures" />
        <div style={{ marginTop: 10 }}><button onClick={saveSettings}>Save alert settings</button></div>
      </div>

      <div className="card">
        <h3>Scheduled digest email</h3>
        <p className="hint">
          A recurring summary of what needs attention — contracts awaiting
          validation, contracts expiring within 30 days, and documents that
          failed extraction — emailed to the recipients below (blank = all
          admins). Uses the SMTP settings above.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label>Digest</label>
            <select value={values.digest_enabled} onChange={set('digest_enabled')}>
              <option value="false">Disabled</option><option value="true">Enabled</option>
            </select>
          </div>
          <div>
            <label>Frequency</label>
            <select value={values.digest_frequency} onChange={set('digest_frequency')}>
              <option value="daily">Daily</option><option value="weekly">Weekly</option>
            </select>
          </div>
          <div>
            <label>Day (weekly only)</label>
            <select value={values.digest_day_of_week} onChange={set('digest_day_of_week')}
              disabled={values.digest_frequency !== 'weekly'}>
              {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
                .map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </div>
          <div>
            <label>Send time (HH:MM, Asia/Kolkata)</label>
            <input value={values.digest_time} onChange={set('digest_time')} placeholder="08:00" />
          </div>
        </div>
        <label>Recipients (comma-separated; blank = all admins)</label>
        <input value={values.digest_recipients} onChange={set('digest_recipients')} placeholder="manager@example.com, ops@example.com" />
        <div className="toolbar" style={{ marginTop: 10 }}>
          <button onClick={saveSettings}>Save digest settings</button>
          <button className="secondary" onClick={sendDigestNow}>Send digest now</button>
        </div>
      </div>

      </>)}

      {tab === 'workflow' && (<>
      <div className="card">
        <h3>Validation &amp; reminders</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <label>Low-confidence highlight threshold (0–1)</label>
            <input value={values.confidence_threshold} onChange={set('confidence_threshold')} />
          </div>
          <div>
            <label>Daily reminder run time (HH:MM, Asia/Kolkata)</label>
            <input value={values.reminder_run_time} onChange={set('reminder_run_time')} />
          </div>
          <div>
            <label>Rule mapping changes apply to</label>
            <select value={values.rule_change_scope} onChange={set('rule_change_scope')}>
              <option value="existing_and_new">Existing and new contracts</option>
              <option value="new_only">New contracts only</option>
            </select>
          </div>
          <div>
            <label>Auto-draft renewals</label>
            <select value={values.auto_renewal_enabled} onChange={set('auto_renewal_enabled')}>
              <option value="false">Off</option>
              <option value="true">On</option>
            </select>
          </div>
          <div>
            <label>…this many days before expiry</label>
            <input type="number" value={values.auto_renewal_lead_days} onChange={set('auto_renewal_lead_days')}
              disabled={values.auto_renewal_enabled !== 'true'} />
          </div>
        </div>
        <p className="hint">When on, the daily job queues a renewal draft for each validated, active contract expiring within the lead window (deduped — no stacking).</p>
        <div style={{ marginTop: 12 }}><button onClick={saveSettings}>Save settings</button></div>
      </div>

      <div className="card">
        <h3>Contract types &amp; tags</h3>
        <label>Contract-type vocabulary (comma- or newline-separated) — suggested in the type dropdowns</label>
        <textarea rows={2} value={values.contract_types} onChange={set('contract_types')}
          placeholder="NDA, MSA, SOW, Service Agreement, Purchase Order, Lease" />
        <div style={{ marginTop: 10 }}><button onClick={saveSettings}>Save contract types</button></div>

        <h4 style={{ marginTop: 18, marginBottom: 6 }}>Tags</h4>
        <p className="hint">Tags are free-form labels for organizing and filtering contracts. Deleting a tag removes it from all contracts.</p>
        <table className="grid">
          <thead><tr><th>Tag</th><th>Color</th><th>In use</th><th></th></tr></thead>
          <tbody>
            {tags.map((t) => (
              <tr key={t.id}>
                <td><span className="tag-chip" style={t.color ? { borderColor: t.color, color: t.color } : undefined}>{t.name}</span></td>
                <td>{t.color || '—'}</td>
                <td>{t.contract_count}</td>
                <td><button className="danger" onClick={() => deleteTag(t)}>Delete</button></td>
              </tr>
            ))}
            {tags.length === 0 && <tr><td colSpan={4} className="hint">No tags yet.</td></tr>}
          </tbody>
        </table>
        <div className="toolbar" style={{ marginTop: 10 }}>
          <input placeholder="New tag name" value={newTag.name} onChange={(e) => setNewTag({ ...newTag, name: e.target.value })} />
          <input placeholder="Color (optional, e.g. #c0392b)" value={newTag.color} onChange={(e) => setNewTag({ ...newTag, color: e.target.value })} />
          <button disabled={!newTag.name.trim()} onClick={createTag}>Add tag</button>
        </div>
      </div>

      <div className="card">
        <h3>Master data — currencies &amp; business units</h3>
        <p className="hint">These populate the Currency and Business Unit (BU) pickers on the validation and authoring forms.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label>Currencies</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0 8px' }}>
              {masterLists.currencies.map((c) => (
                <span key={c} className="tag-chip">
                  {c}
                  <button className="secondary" title="Remove" style={{ padding: '0 6px', marginLeft: 6 }}
                    onClick={() => saveMasterLists({ ...masterLists, currencies: masterLists.currencies.filter((x) => x !== c) })}>×</button>
                </span>
              ))}
              {masterLists.currencies.length === 0 && <span className="hint">None yet.</span>}
            </div>
            <div className="toolbar" style={{ margin: 0 }}>
              <input placeholder="e.g. JPY" value={newCurrency} onChange={(e) => setNewCurrency(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addCurrency() }} style={{ maxWidth: 120 }} />
              <button className="secondary" onClick={addCurrency}>Add currency</button>
            </div>
          </div>
          <div>
            <label>Business units (BU)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0 8px' }}>
              {masterLists.business_units.map((b) => (
                <span key={b} className="tag-chip">
                  {b}
                  <button className="secondary" title="Remove" style={{ padding: '0 6px', marginLeft: 6 }}
                    onClick={() => saveMasterLists({ ...masterLists, business_units: masterLists.business_units.filter((x) => x !== b) })}>×</button>
                </span>
              ))}
              {masterLists.business_units.length === 0 && <span className="hint">None yet.</span>}
            </div>
            <div className="toolbar" style={{ margin: 0 }}>
              <input placeholder="e.g. North America" value={newBU} onChange={(e) => setNewBU(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addBU() }} />
              <button className="secondary" onClick={addBU}>Add business unit</button>
            </div>
          </div>
        </div>
      </div>

      </>)}

      {tab === 'prompts' && (<>
      <div className="card">
        <h3>Claude extraction prompt (versioned)</h3>
        <p className="hint">
          Current versions: {prompts.map((p) => `v${p.version}${p.is_active ? ' (active)' : ''}`).join(', ') || 'none'}.
          Saving creates a new version and activates it. Use {'{document_text}'} as the placeholder.
        </p>
        <textarea rows={12} value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} style={{ fontFamily: 'monospace' }} />
        <div style={{ marginTop: 10 }}><button onClick={savePromptVersion}>Save as new version</button></div>
      </div>

      <div className="card">
        <h3>Authoring AI prompts (versioned)</h3>
        <p className="hint">Prompts the authoring module uses for clause polishing and difference summaries. Saving creates a new version and activates it; each falls back to a built-in default.</p>
        <AuthoringPromptEditor onSaved={() => setMessage('Prompt version saved')} onError={setError} />
      </div>

      <div className="card">
        <h3>Notification templates</h3>
        <p className="hint">Subjects and bodies for the emails the system sends — expiry reminders, approval requests, vendor decisions and access codes. Each falls back to a built-in default until you customize it.</p>
        <EmailTemplateEditor templates={emailTemplates} onSaved={() => { setMessage('Template saved'); load() }} onError={setError} />
      </div>

      </>)}

      {tab === 'accounts' && (<>
        <div className="pane card">
          <h3>Departments (master list)</h3>
          <table className="grid">
            <thead><tr><th>Name</th><th>Default recipient</th><th>Approval gates</th><th>Actions</th></tr></thead>
            <tbody>
              {departments.map((d) => (
                editDept && editDept.id === d.id ? (
                  <tr key={d.id}>
                    <td>
                      <input value={editDept.name}
                        onChange={(e) => setEditDept({ ...editDept, name: e.target.value })} />
                    </td>
                    <td>
                      <input placeholder="email1@x.com, email2@x.com" value={editDept.default_recipient_email}
                        onChange={(e) => setEditDept({ ...editDept, default_recipient_email: e.target.value })} />
                    </td>
                    <td>
                      <label style={{ margin: 0 }}>Legal sign-off</label>
                      <select value={editDept.approval_require_legal}
                        onChange={(e) => setEditDept({ ...editDept, approval_require_legal: e.target.value })}>
                        <option value="">Inherit global</option>
                        <option value="true">Required</option>
                        <option value="false">Not required</option>
                      </select>
                      <label style={{ margin: '6px 0 0' }}>Finance threshold (blank = inherit, 0 = none)</label>
                      <input type="number" placeholder="e.g. 1000000" value={editDept.approval_value_threshold}
                        onChange={(e) => setEditDept({ ...editDept, approval_value_threshold: e.target.value })} />
                      <label style={{ margin: '6px 0 0' }}>Default signers — one “Name | email | Role” per line</label>
                      <textarea rows={2} placeholder={'Jane Doe | jane@iks.com | Signer\nVendor Rep | rep@vendor.com | Signer'}
                        value={editDept.default_signers_text}
                        onChange={(e) => setEditDept({ ...editDept, default_signers_text: e.target.value })} />
                    </td>
                    <td>
                      <div className="toolbar" style={{ margin: 0 }}>
                        <button disabled={!editDept.name} onClick={saveDept}>Save</button>
                        <button className="secondary" onClick={() => setEditDept(null)}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={d.id}>
                    <td>{d.name}</td>
                    <td>{d.default_recipient_email || '—'}</td>
                    <td className="hint">
                      Legal: {d.approval_require_legal == null ? 'inherit' : d.approval_require_legal ? 'required' : 'off'}
                      {' · '}Finance ≥ {d.approval_value_threshold == null ? 'inherit' : (d.approval_value_threshold === 0 ? 'off' : d.approval_value_threshold.toLocaleString('en-IN'))}
                      {d.default_signers && d.default_signers.length > 0 && <> · {d.default_signers.length} default signer(s)</>}
                    </td>
                    <td>
                      <div className="toolbar" style={{ margin: 0 }}>
                        <button className="secondary" onClick={() => setEditDept({
                          id: d.id,
                          name: d.name,
                          default_recipient_email: d.default_recipient_email || '',
                          default_recipient_name: d.default_recipient_name || '',
                          approval_require_legal: d.approval_require_legal == null ? '' : String(d.approval_require_legal),
                          approval_value_threshold: d.approval_value_threshold == null ? '' : String(d.approval_value_threshold),
                          default_signers_text: formatSigners(d.default_signers),
                        })}>Edit</button>
                        <button className="danger" onClick={() => deleteDept(d)}>Remove</button>
                      </div>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
          <div className="toolbar" style={{ marginTop: 10 }}>
            <input placeholder="Department name" value={newDept.name} onChange={(e) => setNewDept({ ...newDept, name: e.target.value })} />
            <input placeholder="email1@x.com, email2@x.com" value={newDept.default_recipient_email} onChange={(e) => setNewDept({ ...newDept, default_recipient_email: e.target.value })} />
            <button disabled={!newDept.name} onClick={createDept}>Add</button>
          </div>
          <p className="hint">Default recipient email accepts multiple addresses, comma-separated — reminders CC all of them.</p>
        </div>

        <div className="pane card">
          <h3>Users &amp; roles</h3>
          <table className="grid">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>
                    <MultiSelect allLabel="Roles" options={ROLE_OPTIONS}
                      value={u.roles && u.roles.length ? u.roles : [u.role]}
                      onChange={(next) => { if (next.length) updateUser(u.id, { roles: next }) }} />
                  </td>
                  <td>
                    <span className={`badge ${u.is_active ? 'VALIDATED' : 'REJECTED'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div className="toolbar" style={{ margin: 0 }}>
                      <button className="secondary" onClick={() => updateUser(u.id, { is_active: !u.is_active })}>
                        {u.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button className="secondary" onClick={() => { setResetFor(u); setResetPw('') }}>Reset password</button>
                      <button className="danger" onClick={() => deleteUser(u)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 10 }}>
            <div className="toolbar">
              <input placeholder="Name" value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} />
              <input placeholder="Email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} />
            </div>
            <div className="toolbar">
              <input placeholder="Password (min 8 chars)" type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
              <MultiSelect allLabel="Roles" options={ROLE_OPTIONS}
                value={newUser.roles} onChange={(next) => setNewUser({ ...newUser, roles: next })} />
              <button disabled={!newUser.email || newUser.password.length < 8 || newUser.roles.length === 0} onClick={createUser}>Add user</button>
            </div>
          </div>
        </div>

        <div className="pane card">
          <h3>Page access by role</h3>
          <p className="hint">
            Tick which roles may see each page in the navigation. SUPER_ADMIN always has
            full access. This controls the menu; each API still enforces its own role checks.
          </p>
          {pageAccess ? (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Page</th>
                      {pageAccess.roles.map((r) => <th key={r} style={{ textAlign: 'center' }}>{r}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {pageAccess.pages.map((p) => (
                      <tr key={p.key}>
                        <td>{p.label}</td>
                        {pageAccess.roles.map((r) => (
                          <td key={r} style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={(pageAccess.access[p.key] || []).includes(r)}
                              onChange={() => togglePageRole(p.key, r)}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="toolbar" style={{ marginTop: 10 }}>
                <button onClick={savePageAccess}>Save page access</button>
              </div>
            </>
          ) : <p className="hint">Loading…</p>}
        </div>
      </>)}

      <div className="card">
        <h3>Search &amp; retrieval</h3>
        <p className="hint">
          How contract text is turned into a searchable vector. <strong>Concept</strong> maps
          contract wording onto shared legal concepts so paraphrases match — the offline default.
          <strong> Legacy</strong> is character-matching only and cannot match a paraphrase.
          <strong> Neural</strong> uses a real encoder where the host has it installed.
          Changing this makes existing vectors stale — re-index from Repository AI afterwards.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label>Embedding provider</label>
            <select value={values.embedding_provider} onChange={set('embedding_provider')}>
              <option value="concept">Concept (recommended, offline)</option>
              <option value="hashing">Legacy character matching</option>
              <option value="sentence_transformers">Neural encoder (requires install)</option>
            </select>
          </div>
          <div>
            <label>Neural model name</label>
            <input value={values.embedding_model || ''} onChange={set('embedding_model')}
              placeholder="all-MiniLM-L6-v2" />
          </div>
          <div>
            <label>Vector weight in hybrid search <span className="hint">(0–1)</span></label>
            <input type="number" step="0.05" min="0" max="1"
              value={values.hybrid_vector_weight || ''} onChange={set('hybrid_vector_weight')} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}><button onClick={saveSettings}>Save retrieval settings</button></div>
      </div>

      <CustomFieldsAdmin />
      <FxRatesAdmin />
      <ApiTokensAdmin />

      {resetFor && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 420 }}>
            <h3>Reset password — {resetFor.email}</h3>
            <label>New password (min 8 characters)</label>
            <input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)} autoComplete="new-password" />
            <div className="toolbar" style={{ marginTop: 12 }}>
              <button disabled={resetPw.length < 8} onClick={submitReset}>Set password</button>
              <button className="secondary" onClick={() => setResetFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function CustomFieldsAdmin() {
  const [fields, setFields] = useState([])
  const [form, setForm] = useState({ label: '', field_type: 'text', options: '', applies_to_type: '', required: false })
  const [types, setTypes] = useState([])
  const [error, setError] = useState(null)

  const load = () => api.get('/custom-fields?include_inactive=true').then(setFields).catch(() => {})
  useEffect(() => { load(); api.get('/contracts/types').then((r) => setTypes(r.types)).catch(() => {}) }, [])

  async function create() {
    if (!form.label.trim()) return
    setError(null)
    try {
      await api.post('/custom-fields', {
        label: form.label.trim(), field_type: form.field_type,
        options: form.field_type === 'select' ? form.options.split(',').map((s) => s.trim()).filter(Boolean) : null,
        applies_to_type: form.applies_to_type || null, required: form.required,
      })
      setForm({ label: '', field_type: 'text', options: '', applies_to_type: '', required: false })
      load()
    } catch (e) { setError(e.message) }
  }
  async function toggleActive(f) {
    try { await api.put(`/custom-fields/${f.id}`, { active: !f.active }); load() } catch (e) { setError(e.message) }
  }
  async function remove(id) {
    try { await api.del(`/custom-fields/${id}`); load() } catch (e) { setError(e.message) }
  }

  return (
    <div className="card">
      <h3>Custom fields <span className="hint">— admin-defined, per contract type</span></h3>
      {error && <div className="error">{error}</div>}
      {fields.length > 0 && (
        <table className="grid">
          <thead><tr><th>Label</th><th>Key</th><th>Type</th><th>Applies to</th><th>Required</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.id}>
                <td>{f.label}</td>
                <td className="hint">{f.key}</td>
                <td>{f.field_type}{f.field_type === 'select' && f.options.length ? ` (${f.options.join(', ')})` : ''}</td>
                <td>{f.applies_to_type || <span className="hint">all types</span>}</td>
                <td>{f.required ? '✓' : ''}</td>
                <td><button className="secondary" onClick={() => toggleActive(f)}>{f.active ? 'Active' : 'Inactive'}</button></td>
                <td><button className="danger" onClick={() => remove(f.id)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="toolbar" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <input placeholder="Field label…" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <select value={form.field_type} onChange={(e) => setForm({ ...form, field_type: e.target.value })}>
          <option value="text">text</option><option value="number">number</option>
          <option value="date">date</option><option value="select">select</option><option value="bool">yes/no</option>
        </select>
        {form.field_type === 'select' && (
          <input placeholder="Options, comma-separated" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} style={{ minWidth: 180 }} />
        )}
        <select value={form.applies_to_type} onChange={(e) => setForm({ ...form, applies_to_type: e.target.value })}>
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label style={{ margin: 0, display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 400 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} /> required
        </label>
        <button disabled={!form.label.trim()} onClick={create}>Add field</button>
      </div>
    </div>
  )
}

function FxRatesAdmin() {
  const [base, setBase] = useState('INR')
  const [rates, setRates] = useState([])
  const [form, setForm] = useState({ currency: '', rate_to_base: '' })
  const [error, setError] = useState(null)

  const load = () => api.get('/fx/rates').then((r) => { setBase(r.base_currency); setRates(r.rates) }).catch(() => {})
  useEffect(() => { load() }, [])

  async function saveBase() {
    try { await api.put('/settings', { values: { base_currency: base } }) } catch (e) { setError(e.message) }
  }
  async function upsert() {
    if (!form.currency.trim() || !form.rate_to_base) return
    setError(null)
    try { await api.put('/fx/rates', { currency: form.currency.trim(), rate_to_base: Number(form.rate_to_base) }); setForm({ currency: '', rate_to_base: '' }); load() }
    catch (e) { setError(e.message) }
  }
  async function remove(cur) {
    try { await api.del(`/fx/rates/${cur}`); load() } catch (e) { setError(e.message) }
  }

  return (
    <div className="card">
      <h3>Currencies &amp; FX rates <span className="hint">— normalize portfolio value (G15)</span></h3>
      {error && <div className="error">{error}</div>}
      <div className="toolbar" style={{ margin: '0 0 10px' }}>
        <label style={{ margin: 0 }}>Base currency:</label>
        <input value={base} onChange={(e) => setBase(e.target.value.toUpperCase())} style={{ maxWidth: 100 }} />
        <button className="secondary" onClick={saveBase}>Save base</button>
        <span className="hint">Each rate = how many {base} one unit is worth. The base currency is always 1.</span>
      </div>
      {rates.length > 0 && (
        <table className="grid">
          <thead><tr><th>Currency</th><th>Rate → {base}</th><th>Updated</th><th></th></tr></thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.currency}>
                <td>{r.currency}</td><td>{r.rate_to_base}</td>
                <td className="hint">{r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—'}</td>
                <td><button className="danger" onClick={() => remove(r.currency)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="toolbar" style={{ marginTop: 8 }}>
        <input placeholder="Currency (e.g. USD)" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} style={{ maxWidth: 140 }} />
        <input type="number" step="0.0001" placeholder={`Rate → ${base}`} value={form.rate_to_base} onChange={(e) => setForm({ ...form, rate_to_base: e.target.value })} style={{ maxWidth: 140 }} />
        <button disabled={!form.currency.trim() || !form.rate_to_base} onClick={upsert}>Set rate</button>
      </div>
    </div>
  )
}

function ApiTokensAdmin() {
  const [tokens, setTokens] = useState([])
  const [name, setName] = useState('')
  const [expires, setExpires] = useState('')
  const [newToken, setNewToken] = useState(null)   // raw token shown once
  const [catalog, setCatalog] = useState(null)
  const [error, setError] = useState(null)

  const load = () => api.get('/api-tokens').then(setTokens).catch(() => {})
  useEffect(() => { load() }, [])

  async function create() {
    if (!name.trim()) return
    setError(null)
    try {
      const t = await api.post('/api-tokens', { name: name.trim(), expires_on: expires || null })
      setNewToken(t.token); setName(''); setExpires(''); load()
    } catch (e) { setError(e.message) }
  }
  async function revoke(id) {
    try { await api.post(`/api-tokens/${id}/revoke`); load() } catch (e) { setError(e.message) }
  }
  async function remove(id) {
    try { await api.del(`/api-tokens/${id}`); load() } catch (e) { setError(e.message) }
  }
  async function showCatalog() {
    // Catalog requires an API token; if the admin has none, explain.
    if (tokens.length === 0) { setCatalog('need-token'); return }
    setCatalog('The event catalog is available at GET /api/v1/events/catalog using an X-API-Key header.')
  }

  return (
    <div className="card">
      <h3>API tokens <span className="hint">— read-only REST API (G17)</span></h3>
      {error && <div className="error">{error}</div>}
      <p className="hint">
        Tokens authenticate the documented read-only API under <code>/api/v1</code> (contracts, obligations, event catalog).
        Send the token in an <code>X-API-Key</code> header. The token is shown once at creation.
      </p>
      {newToken && (
        <div className="success" style={{ wordBreak: 'break-all' }}>
          New token (copy it now — it won’t be shown again): <code>{newToken}</code>
          <div><button className="secondary" style={{ marginTop: 6 }} onClick={() => setNewToken(null)}>Dismiss</button></div>
        </div>
      )}
      {tokens.length > 0 && (
        <table className="grid">
          <thead><tr><th>Name</th><th>Prefix</th><th>Last used</th><th>Expires</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {tokens.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="hint">{t.prefix}…</td>
                <td className="hint">{t.last_used_at ? new Date(t.last_used_at).toLocaleString() : 'never'}</td>
                <td className="hint">{t.expires_at ? new Date(t.expires_at).toLocaleDateString() : '—'}</td>
                <td>{t.active ? <span className="badge VALIDATED">active</span> : <span className="badge REJECTED">revoked</span>}</td>
                <td>
                  <div className="toolbar" style={{ margin: 0 }}>
                    {t.active && <button className="secondary" onClick={() => revoke(t.id)}>Revoke</button>}
                    <button className="danger" onClick={() => remove(t.id)}>×</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="toolbar" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <input placeholder="Token name (e.g. BI tool)" value={name} onChange={(e) => setName(e.target.value)} />
        <input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} title="Optional expiry" />
        <button disabled={!name.trim()} onClick={create}>Create token</button>
        <span className="spacer" />
        <button className="secondary" onClick={showCatalog}>Event catalog</button>
      </div>
      {catalog && (
        <p className="hint" style={{ marginTop: 6 }}>
          {catalog === 'need-token' ? 'Create a token first, then call GET /api/v1/events/catalog with the X-API-Key header.' : catalog}
        </p>
      )}
    </div>
  )
}

function StatusBadge({ on, onText, offText }) {
  return <span className={`badge ${on ? 'VALIDATED' : 'REJECTED'}`}>{on ? onText : offText}</span>
}

function AuthoringPromptEditor({ onSaved, onError }) {
  const [catalog, setCatalog] = useState([])
  const [name, setName] = useState('clause_polish')
  const [content, setContent] = useState('')
  const current = catalog.find((c) => c.name === name) || catalog[0]

  const reload = () => api.get('/settings/prompt-catalog').then(setCatalog).catch(() => {})
  useEffect(() => { reload() }, [])
  useEffect(() => {
    if (current) { setName(current.name); setContent(current.content || '') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.name, catalog])

  async function save(value) {
    try { await api.post('/settings/prompts', { name, content: value, activate: true }); await reload(); setContent(''); onSaved() }
    catch (e) { onError(e.message) }
  }

  const placeholders = current?.placeholders || []
  // Always show text: the edited buffer, else the active/default prompt.
  const shown = content || current?.content || current?.default || ''
  const dirty = current && content !== '' && content !== current.content
  if (catalog.length === 0) {
    return (
      <p className="hint">
        Couldn't load the prompt list. Reload the page; if it stays blank the backend may be an
        older build without <code>/api/settings/prompt-catalog</code> — redeploy the backend.
      </p>
    )
  }
  return (
    <div>
      <div className="toolbar" style={{ margin: '0 0 8px' }}>
        <label style={{ margin: 0 }}>Prompt</label>
        <select value={name} onChange={(e) => { setName(e.target.value); setContent('') }}>
          {catalog.map((c) => <option key={c.name} value={c.name}>{c.label}{c.customized ? ' — customized' : ''}</option>)}
        </select>
      </div>
      {current?.description && <p className="hint">{current.description}</p>}
      {placeholders.length > 0 && <p className="hint">Placeholders: {placeholders.map((p) => `{${p}}`).join(' ')}</p>}
      <textarea rows={8} value={shown} onChange={(e) => setContent(e.target.value)} style={{ fontFamily: 'monospace' }} />
      <div className="toolbar" style={{ marginTop: 10 }}>
        <button onClick={() => save(shown)} disabled={!dirty}>Save as new version</button>
        <button className="secondary" onClick={() => current && setContent(current.default || '')}>Load default</button>
        {current?.customized && <span className="badge">customized</span>}
      </div>
    </div>
  )
}

function EmailTemplateEditor({ templates, onSaved, onError }) {
  const [name, setName] = useState('expiry_reminder')
  const current = templates.find((t) => t.name === name) || templates[0]
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  // Reflect the selected template (server merges built-in defaults with overrides).
  useEffect(() => {
    if (current) { setName(current.name); setSubject(current.subject || ''); setBody(current.body || '') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.name, templates])

  async function save() {
    try { await api.put(`/settings/email-templates/${name}`, { subject, body }); onSaved() }
    catch (e) { onError(e.message) }
  }
  async function reset() {
    if (!await confirmDialog('Reset this template to its built-in default?')) return
    try { await api.del(`/settings/email-templates/${name}`); onSaved() }
    catch (e) { onError(e.message) }
  }
  function resetToDefaultLocal() {
    if (current) { setSubject(current.default_subject || ''); setBody(current.default_body || '') }
  }

  const placeholders = current?.placeholders || []
  const dirty = current && (subject !== current.subject || body !== current.body)

  return (
    <div>
      <div className="toolbar" style={{ margin: '0 0 8px' }}>
        <label style={{ margin: 0 }}>Template</label>
        <select value={name} onChange={(e) => setName(e.target.value)}>
          {templates.map((t) => (
            <option key={t.name} value={t.name}>{t.label || t.name}{t.customized ? ' — customized' : ''}</option>
          ))}
        </select>
      </div>
      {current?.description && <p className="hint">{current.description}</p>}
      {placeholders.length > 0 && (
        <p className="hint">Placeholders: {placeholders.map((p) => `{${p}}`).join(' ')}</p>
      )}
      <label>Subject</label>
      <input value={subject} onChange={(e) => setSubject(e.target.value)} />
      <label>Body (HTML)</label>
      <textarea rows={8} value={body} onChange={(e) => setBody(e.target.value)} style={{ fontFamily: 'monospace' }} />
      <div className="toolbar" style={{ marginTop: 10 }}>
        <button onClick={save} disabled={!dirty}>Save template</button>
        <button className="secondary" onClick={resetToDefaultLocal}>Load default text</button>
        {current?.customized && <button className="danger" onClick={reset}>Reset to default</button>}
        {current?.customized && <span className="badge">customized</span>}
      </div>
    </div>
  )
}
