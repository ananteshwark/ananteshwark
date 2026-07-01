import { useState, useEffect } from 'react';
import { privacyApi } from '../../api/privacy';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const SENS: Record<string, string> = { LOW: 'bg-gray-100 text-gray-600', MEDIUM: 'bg-amber-100 text-amber-700', HIGH: 'bg-red-100 text-red-700' };

function PiiTab() {
  const [fields, setFields] = useState<any[]>([]);
  const [form, setForm] = useState({ entityName: '', fieldName: '', category: 'EMAIL', sensitivity: 'HIGH', maskStrategy: 'EMAIL' });
  useEffect(() => { load(); }, []);
  async function load() { setFields(unwrap(await privacyApi.listPii())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await privacyApi.registerPii(form); setForm({ entityName: '', fieldName: '', category: 'EMAIL', sensitivity: 'HIGH', maskStrategy: 'EMAIL' }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-6 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="Entity" value={form.entityName} onChange={(e) => setForm({ ...form, entityName: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input required placeholder="Field" value={form.fieldName} onChange={(e) => setForm({ ...form, fieldName: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <select value={form.sensitivity} onChange={(e) => setForm({ ...form, sensitivity: e.target.value })} className="border rounded px-2 py-1 text-sm">{['LOW', 'MEDIUM', 'HIGH'].map((s) => <option key={s}>{s}</option>)}</select>
        <select value={form.maskStrategy} onChange={(e) => setForm({ ...form, maskStrategy: e.target.value })} className="border rounded px-2 py-1 text-sm">{['FULL', 'PARTIAL', 'EMAIL', 'HASH'].map((s) => <option key={s}>{s}</option>)}</select>
        <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">+ PII</button>
      </form>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Entity</th><th className="px-3 py-2 text-left">Field</th><th className="px-3 py-2 text-left">Category</th><th className="px-3 py-2 text-left">Sensitivity</th><th className="px-3 py-2 text-left">Mask</th></tr></thead>
        <tbody className="divide-y">
          {fields.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No PII fields registered.</td></tr> : fields.map((f) => (
            <tr key={f.id}><td className="px-3 py-2">{f.entityName}</td><td className="px-3 py-2 font-mono text-xs">{f.fieldName}</td><td className="px-3 py-2">{f.category}</td><td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${SENS[f.sensitivity]}`}>{f.sensitivity}</span></td><td className="px-3 py-2 text-xs">{f.maskStrategy}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RightsTab() {
  const [subjectId, setSubjectId] = useState('CUST-1');
  const [consents, setConsents] = useState<any[]>([]);
  const [purpose, setPurpose] = useState('MARKETING');
  const [dsar, setDsar] = useState<any>(null);
  async function loadConsents() { setConsents(unwrap(await privacyApi.listConsents(subjectId))); }
  async function setConsent(granted: boolean) {
    try { await privacyApi.recordConsent({ subjectId, purpose, granted, at: '2026-06-30T00:00:00Z' }); loadConsents(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function erasure() {
    try { await privacyApi.requestErasure({ subjectId, retentionUntil: '2026-12-31' }); alert('Erasure requested (retention until 2026-12-31)'); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function processErasure() {
    try { const r = await privacyApi.processErasures('2027-01-15'); const d = r.data?.data ?? r.data; alert(`Anonymized ${d.anonymized}, retained ${d.retained}`); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function runDsar() {
    try { const r = await privacyApi.fulfilDsar({ subjectId, data: { name: 'Sample Subject', email: 's@example.com' }, at: '2026-06-30T00:00:00Z' }); setDsar(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div><label className="text-xs text-gray-500">Subject ID</label><input value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-48 border rounded px-2 py-1 text-sm font-mono" /></div>
        <button onClick={loadConsents} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Load Consents</button>
      </div>
      <div className="border rounded-lg p-3 space-y-2">
        <h3 className="text-sm font-semibold">Consent (Ph-270)</h3>
        <div className="flex gap-2 items-end">
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} className="border rounded px-2 py-1 text-sm" />
          <button onClick={() => setConsent(true)} className="bg-green-600 text-white px-3 py-1.5 rounded text-sm">Grant</button>
          <button onClick={() => setConsent(false)} className="bg-red-500 text-white px-3 py-1.5 rounded text-sm">Withdraw</button>
        </div>
        <ul className="text-sm divide-y border rounded">
          {consents.length === 0 ? <li className="px-3 py-2 text-gray-400">No consents.</li> : consents.map((c) => <li key={c.id} className="px-3 py-2 flex justify-between"><span>{c.purpose}</span><span className={c.granted ? 'text-green-600' : 'text-red-500'}>{c.granted ? 'GRANTED' : 'WITHDRAWN'}</span></li>)}
        </ul>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="border rounded-lg p-3 space-y-2">
          <h3 className="text-sm font-semibold">Right to Erasure (Ph-271)</h3>
          <button onClick={erasure} className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Request Erasure</button>
          <button onClick={processErasure} className="w-full bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Process Due Erasures</button>
        </div>
        <div className="border rounded-lg p-3 space-y-2">
          <h3 className="text-sm font-semibold">DSAR Export (Ph-272)</h3>
          <button onClick={runDsar} className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Fulfil DSAR</button>
          {dsar && <pre className="text-[10px] bg-gray-50 p-2 rounded max-h-32 overflow-auto">{JSON.stringify(dsar.exportedData, null, 1)}</pre>}
        </div>
      </div>
    </div>
  );
}

const TABS = ['PII Inventory', 'Subject Rights'];

export default function PrivacyPage() {
  const [tab, setTab] = useState('PII Inventory');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Data Privacy & GDPR</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Data Safe parity — a PII field inventory with masking strategies, consent management per
          purpose, right-to-erasure with retention, and DSAR export with an access audit trail.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'PII Inventory' && <PiiTab />}
      {tab === 'Subject Rights' && <RightsTab />}
    </div>
  );
}
