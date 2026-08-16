import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import { confirmDialog } from '../../confirm'

export default function TemplateLibrary() {
  const navigate = useNavigate()
  const [templates, setTemplates] = useState([])
  const [types, setTypes] = useState([])
  const [departments, setDepartments] = useState([])
  const [form, setForm] = useState({ name: '', contract_type: 'MSA', department_id: '', description: '' })
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)

  const load = () => api.get('/authoring/templates?include_inactive=false').then(setTemplates).catch((e) => setError(e.message))
  useEffect(() => {
    load()
    api.get('/contracts/types').then((r) => setTypes(r.types)).catch(() => {})
    api.get('/departments').then(setDepartments).catch(() => {})
  }, [])

  async function create() {
    if (!form.name.trim()) return
    setError(null)
    try {
      await api.post('/authoring/templates', {
        name: form.name.trim(), contract_type: form.contract_type || null,
        department_id: form.department_id ? Number(form.department_id) : null,
        description: form.description || null,
      })
      setForm({ name: '', contract_type: 'MSA', department_id: '', description: '' })
      setMessage('Template created — open it in the workspace to edit its body.')
      load()
    } catch (e) { setError(e.message) }
  }

  async function editBody(t) {
    // Author the template body by creating a draft from it, editing, then re-promoting.
    try {
      const d = await api.post('/authoring/drafts', { origin: 'template', template_id: t.id, title: `Edit template: ${t.name}` })
      navigate(`/authoring/drafts/${d.id}`)
    } catch (e) { setError(e.message) }
  }

  async function remove(id) {
    if (!await confirmDialog('Delete this template?')) return
    try { await api.del(`/authoring/templates/${id}`); load() } catch (e) { setError(e.message) }
  }

  return (
    <div>
      <h2>Template Library</h2>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <div className="card">
        <h3>New template</h3>
        <div className="split">
          <div className="pane">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Standard MSA (India)" />
            <label>Contract type</label>
            <input list="tpl-types" value={form.contract_type} onChange={(e) => setForm({ ...form, contract_type: e.target.value })} />
            <datalist id="tpl-types">
              {['MSA', 'SOW', 'NDA', 'Service Agreement', 'Purchase Agreement', 'Amendment', 'Renewal', ...types]
                .filter((v, i, a) => a.indexOf(v) === i).map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          <div className="pane">
            <label>Department (optional)</label>
            <select value={form.department_id} onChange={(e) => setForm({ ...form, department_id: e.target.value })}>
              <option value="">Any</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            <label>Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button onClick={create} disabled={!form.name.trim()}>Create template</button>
          <span className="hint" style={{ marginLeft: 10 }}>The body is seeded from the type's standard skeleton; edit it in the workspace.</span>
        </div>
      </div>

      <div className="card">
        <h3>Templates</h3>
        <table className="grid">
          <thead><tr><th>Name</th><th>Type</th><th>Dept</th><th>Version</th><th>Description</th><th /></tr></thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td><td>{t.contract_type || '—'}</td><td>{t.department_name || 'Any'}</td>
                <td>v{t.version}</td><td className="hint">{t.description || '—'}</td>
                <td>
                  <div className="toolbar" style={{ margin: 0 }}>
                    <button className="secondary" onClick={() => editBody(t)}>Edit body</button>
                    <button className="danger" onClick={() => remove(t.id)}>×</button>
                  </div>
                </td>
              </tr>
            ))}
            {templates.length === 0 && <tr><td colSpan="6" className="hint">No templates yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
