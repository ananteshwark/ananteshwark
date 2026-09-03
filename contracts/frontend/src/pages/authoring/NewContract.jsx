import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../api'
import StartContractOptions from '../../components/StartContractOptions'

export default function NewContract() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)
  const [deleted, setDeleted] = useState([])

  const loadDeleted = () => api.get('/authoring/drafts/deleted').then(setDeleted).catch(() => {})
  useEffect(() => { loadDeleted() }, [])

  async function restoreDraft(id) {
    try { await api.post(`/authoring/drafts/${id}/restore-deleted`); navigate(`/authoring/drafts/${id}`) }
    catch (e) { setError(e.message) }
  }

  return (
    <div>
      <h2>New contract</h2>
      <p className="hint">Author a contract in-app. Pick a starting point — all four land in the same workspace.</p>
      {error && <div className="error">{error}</div>}

      <StartContractOptions
        onError={setError}
        onCreated={(d) => navigate(`/authoring/drafts/${d.id}`)}
      />

      {deleted.length > 0 && (
        <div className="card">
          <h3>Recently deleted drafts <span className="hint">— restore</span></h3>
          <table className="grid">
            <tbody>
              {deleted.map((d) => (
                <tr key={d.id}>
                  <td>{d.title || `Draft #${d.id}`} <span className="hint">{d.contract_type || ''} · deleted {d.deleted_at ? new Date(d.deleted_at).toLocaleDateString() : ''}</span></td>
                  <td style={{ width: 90 }}><button className="secondary" onClick={() => restoreDraft(d.id)}>Restore</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
