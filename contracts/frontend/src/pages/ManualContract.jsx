import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import ContractForm, { useMandatoryFields } from '../components/ContractForm'

// An empty "contract" so ContractForm's confidence/derived highlighting is inert
const EMPTY_CONTRACT = { confidence: {}, derived_fields: [], vendor_name: null }

export default function ManualContract() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ currency: 'INR' })
  const [departments, setDepartments] = useState([])
  const [signingEntities, setSigningEntities] = useState([])
  const [currencies, setCurrencies] = useState([])
  const [businessUnits, setBusinessUnits] = useState([])
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const mandatory = useMandatoryFields()

  useEffect(() => {
    api.get('/departments').then(setDepartments).catch(() => {})
    api.get('/internal-entities').then((r) => setSigningEntities((r || []).map((e) => e.name))).catch(() => {})
    api.get('/settings/master-lists').then((r) => {
      setCurrencies(r.currencies || [])
      setBusinessUnits(r.business_units || [])
    }).catch(() => {})
  }, [])

  async function save(goValidate) {
    setBusy(true)
    setError(null)
    try {
      const created = await api.post('/contracts', form)
      if (file) {
        const fd = new FormData()
        fd.append('file', file)
        await fetch(`/api/contracts/${created.sr_no}/upload`, {
          method: 'POST', headers: api.uploadHeaders(), credentials: 'same-origin', body: fd,
        }).then((r) => { if (!r.ok) throw new Error('File upload failed') })
      }
      navigate(goValidate ? `/validation/${created.sr_no}` : `/contracts/${created.sr_no}`)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <div>
      <h2>New contract (manual entry)</h2>
      <p className="hint">
        For contracts without an ingested file (e.g. paper contracts). Saved as
        pending validation; mandatory fields are enforced when you validate.
      </p>
      {error && <div className="error">{error}</div>}
      <div className="card" style={{ maxWidth: 820 }}>
        <ContractForm mandatory={mandatory} contract={EMPTY_CONTRACT} form={form} setForm={setForm} departments={departments}
          signingEntities={signingEntities} currencies={currencies} businessUnits={businessUnits} />
        <label style={{ marginTop: 12 }}>Attach document (optional)</label>
        <input type="file" accept=".pdf,.docx,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files[0] || null)} />
        <div className="toolbar" style={{ marginTop: 16 }}>
          <button disabled={busy} onClick={() => save(true)}>Save &amp; open validation</button>
          <button disabled={busy} className="secondary" onClick={() => save(false)}>Save draft</button>
          <button className="secondary" onClick={() => navigate('/contracts')}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
