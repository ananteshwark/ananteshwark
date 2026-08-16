import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'

const EMPTY = { title: '', description: '', owner_id: '', due_date: '', priority: 'normal' }

function entityLink(t) {
  if (t.entity_type === 'contract') return `/contracts/${t.entity_id}`
  if (t.entity_type === 'contract_draft') return `/authoring/drafts/${t.entity_id}`
  return null
}

export default function Tasks() {
  const [tasks, setTasks] = useState([])
  const [users, setUsers] = useState([])
  const [statusFilter, setStatusFilter] = useState('open')
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState(null)

  const load = useCallback(() => {
    api.get(`/tasks?mine=true${statusFilter ? `&status=${statusFilter}` : ''}`)
      .then((r) => setTasks(r.tasks)).catch((e) => setError(e.message))
  }, [statusFilter])
  useEffect(() => { load() }, [load])
  useEffect(() => { api.get('/auth/users-lite').then(setUsers).catch(() => {}) }, [])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function create() {
    if (!form.title.trim()) return
    setError(null)
    try {
      await api.post('/tasks', {
        ...form,
        owner_id: form.owner_id ? Number(form.owner_id) : null,
        due_date: form.due_date || null,
      })
      setForm(EMPTY); load()
    } catch (e) { setError(e.message) }
  }
  async function toggle(t) {
    try { await api.patch(`/tasks/${t.id}`, { status: t.status === 'done' ? 'open' : 'done' }); load() }
    catch (e) { setError(e.message) }
  }
  async function remove(id) {
    try { await api.del(`/tasks/${id}`); load() } catch (e) { setError(e.message) }
  }

  const overdue = (t) => t.status === 'open' && t.due_date && t.due_date < new Date().toISOString().slice(0, 10)

  return (
    <div>
      <div className="toolbar" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>My Tasks</h2>
        <span className="spacer" />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="open">Open</option>
          <option value="done">Done</option>
          <option value="">All</option>
        </select>
      </div>
      {error && <div className="error">{error}</div>}

      <div className="card">
        <div className="toolbar" style={{ margin: 0, flexWrap: 'wrap' }}>
          <input placeholder="New task…" value={form.title} onChange={set('title')} style={{ flex: 2, minWidth: 200 }}
            onKeyDown={(e) => { if (e.key === 'Enter') create() }} />
          <select value={form.owner_id} onChange={set('owner_id')}>
            <option value="">Assign to me</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <input type="date" value={form.due_date} onChange={set('due_date')} title="Due date" />
          <select value={form.priority} onChange={set('priority')}>
            <option value="low">low</option><option value="normal">normal</option><option value="high">high</option>
          </select>
          <button disabled={!form.title.trim()} onClick={create}>Add task</button>
        </div>
      </div>

      <table className="grid">
        <thead><tr><th></th><th>Task</th><th>Owner</th><th>Due</th><th>Priority</th><th>Linked</th><th></th></tr></thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} style={t.status === 'done' ? { opacity: 0.6 } : undefined}>
              <td><input type="checkbox" style={{ width: 'auto' }} checked={t.status === 'done'} onChange={() => toggle(t)} /></td>
              <td style={t.status === 'done' ? { textDecoration: 'line-through' } : undefined}>
                {t.title}{t.description && <div className="hint">{t.description}</div>}
              </td>
              <td>{t.owner_name || '—'}</td>
              <td>{overdue(t) ? <span className="badge REJECTED">{t.due_date}</span> : (t.due_date || '—')}</td>
              <td>{t.priority === 'high' ? <span className="badge warn">high</span> : t.priority}</td>
              <td>{entityLink(t) ? <Link to={entityLink(t)}>{t.entity_type === 'contract' ? `#${t.entity_id}` : 'draft'}</Link> : '—'}</td>
              <td><button className="danger" onClick={() => remove(t.id)}>×</button></td>
            </tr>
          ))}
          {tasks.length === 0 && <tr><td colSpan="7" className="hint">No tasks.</td></tr>}
        </tbody>
      </table>
    </div>
  )
}
