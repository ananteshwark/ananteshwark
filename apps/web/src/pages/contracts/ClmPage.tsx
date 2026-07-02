import { useState, useEffect } from 'react';
import { clmApi } from '../../api/clm';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const today = '2026-06-30';
const RISK: Record<string, string> = { LOW: 'bg-green-100 text-green-700', MEDIUM: 'bg-amber-100 text-amber-700', HIGH: 'bg-red-100 text-red-700' };
const BUCKET: Record<string, string> = { '90': 'bg-blue-100 text-blue-700', '60': 'bg-amber-100 text-amber-700', '30': 'bg-orange-100 text-orange-700', OVERDUE: 'bg-red-100 text-red-700' };

function ClausesTab() {
  const [clauses, setClauses] = useState<any[]>([]);
  const emptyForm = { code: '', title: '', category: '', standardText: '', riskLevel: 'LOW' };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [assembly, setAssembly] = useState<any>(null);
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);

  useEffect(() => { load(); }, []);
  async function load() { setClauses(unwrap(await clmApi.listClauses())); }
  function editClause(c: any) { setEditingId(c.id); setForm({ code: c.code ?? '', title: c.title ?? '', category: c.category ?? '', standardText: c.standardText ?? '', riskLevel: c.riskLevel ?? 'LOW' }); }
  function cancelEdit() { setEditingId(null); setForm(emptyForm); }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingId) await clmApi.updateClause(editingId, form);
      else await clmApi.createClause(form);
      cancelEdit(); load();
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function assemble() {
    if (!selectedCodes.length) return;
    try { const r = await clmApi.assemble(selectedCodes); setAssembly(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  function toggle(code: string) { setSelectedCodes(selectedCodes.includes(code) ? selectedCodes.filter((c) => c !== code) : [...selectedCodes, code]); }

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-3">
        <form onSubmit={add} className="bg-gray-50 p-3 rounded-lg space-y-2">
          <div className="flex gap-2">
            <input required placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-24 border rounded px-2 py-1 text-sm" />
            <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="flex-1 border rounded px-2 py-1 text-sm" />
            <select value={form.riskLevel} onChange={(e) => setForm({ ...form, riskLevel: e.target.value })} className="border rounded px-1 py-1 text-sm">{['LOW', 'MEDIUM', 'HIGH'].map((r) => <option key={r}>{r}</option>)}</select>
          </div>
          <textarea required placeholder="Standard text" value={form.standardText} onChange={(e) => setForm({ ...form, standardText: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" rows={2} />
          <div className="flex gap-2">
            <button type="submit" className="flex-1 bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">{editingId ? 'Save Clause' : '+ Clause'}</button>
            {editingId && <button type="button" onClick={cancelEdit} className="border px-3 py-1.5 rounded text-sm">Cancel</button>}
          </div>
        </form>
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-50"><tr><th className="px-2 py-2" /><th className="px-2 py-2 text-left">Code</th><th className="px-2 py-2 text-left">Title</th><th className="px-2 py-2 text-left">Risk</th><th className="px-2 py-2" /></tr></thead>
          <tbody className="divide-y">
            {clauses.length === 0 ? <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">No clauses.</td></tr> : clauses.map((c) => (
              <tr key={c.id}>
                <td className="px-2 py-2"><input type="checkbox" checked={selectedCodes.includes(c.code)} disabled={!c.isApproved} onChange={() => toggle(c.code)} /></td>
                <td className="px-2 py-2 font-mono text-xs">{c.code}</td>
                <td className="px-2 py-2">{c.title}</td>
                <td className="px-2 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${RISK[c.riskLevel]}`}>{c.riskLevel}</span></td>
                <td className="px-2 py-2 text-right space-x-2 whitespace-nowrap"><button onClick={() => editClause(c)} className="text-indigo-600 text-xs hover:underline">edit</button>{c.isApproved ? <span className="text-xs text-green-600">approved</span> : <button onClick={async () => { await clmApi.approveClause(c.id); load(); }} className="text-indigo-600 text-xs hover:underline">approve</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3">
        <button onClick={assemble} disabled={!selectedCodes.length} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm disabled:opacity-40">Assemble from {selectedCodes.length} clause(s)</button>
        {assembly && (
          <div className="border rounded-lg p-3 space-y-2">
            <p className="text-xs text-gray-500">{assembly.clauseCount} clauses{assembly.highRiskClauses?.length ? ` · high-risk: ${assembly.highRiskClauses.join(', ')}` : ''}</p>
            <pre className="text-xs whitespace-pre-wrap bg-gray-50 p-2 rounded max-h-96 overflow-auto">{assembly.body}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

function DeviationsTab() {
  const [deviations, setDeviations] = useState<any[]>([]);
  const [form, setForm] = useState({ contractId: '', clauseCode: '', proposedText: '', riskLevel: 'MEDIUM' });
  useEffect(() => { load(); }, []);
  async function load() { setDeviations(unwrap(await clmApi.listDeviations())); }
  async function record(e: React.FormEvent) {
    e.preventDefault();
    try { const r = await clmApi.recordDeviation(form); const d = r.data?.data ?? r.data; if (!d.deviation) alert('No deviation — matches standard'); setForm({ contractId: '', clauseCode: '', proposedText: '', riskLevel: 'MEDIUM' }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function review(id: string, decision: 'APPROVE' | 'REJECT') {
    try { await clmApi.reviewDeviation(id, decision); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={record} className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="Contract ID" value={form.contractId} onChange={(e) => setForm({ ...form, contractId: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono" />
        <input required placeholder="Clause code" value={form.clauseCode} onChange={(e) => setForm({ ...form, clauseCode: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input required placeholder="Proposed text" value={form.proposedText} onChange={(e) => setForm({ ...form, proposedText: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">Record</button>
      </form>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-2 py-2 text-left">Clause</th><th className="px-2 py-2 text-left">Risk</th><th className="px-2 py-2 text-left">Status</th><th className="px-2 py-2" /></tr></thead>
        <tbody className="divide-y">
          {deviations.length === 0 ? <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No deviations.</td></tr> : deviations.map((d) => (
            <tr key={d.id}>
              <td className="px-2 py-2 font-mono text-xs">{d.clauseCode}</td>
              <td className="px-2 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${RISK[d.riskLevel]}`}>{d.riskLevel}</span></td>
              <td className="px-2 py-2">{d.status}</td>
              <td className="px-2 py-2 text-right whitespace-nowrap">{d.status === 'PENDING' && <><button onClick={() => review(d.id, 'APPROVE')} className="text-green-600 text-xs hover:underline mr-2">approve</button><button onClick={() => review(d.id, 'REJECT')} className="text-red-500 text-xs hover:underline">reject</button></>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RenewalsTab() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { load(); }, []);
  async function load() { const r = await clmApi.renewalAlerts(today); setData(r.data?.data ?? r.data); }
  async function renew(id: string) {
    const newEnd = prompt('New end date (YYYY-MM-DD)?');
    if (!newEnd) return;
    try { await clmApi.renew(id, newEnd); alert('Renewal drafted'); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      {data && <p className="text-sm text-gray-500">{data.count} contract(s) approaching expiry as of {today}</p>}
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Contract</th><th className="px-3 py-2 text-left">Counterparty</th><th className="px-3 py-2 text-left">End Date</th><th className="px-3 py-2 text-right">Days</th><th className="px-3 py-2 text-left">Bucket</th><th className="px-3 py-2" /></tr></thead>
        <tbody className="divide-y">
          {(data?.alerts ?? []).length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No upcoming renewals.</td></tr> : data.alerts.map((a: any) => (
            <tr key={a.contractId}>
              <td className="px-3 py-2"><span className="font-mono text-xs">{a.contractNumber}</span> {a.title}</td>
              <td className="px-3 py-2">{a.counterpartyName ?? '—'}</td>
              <td className="px-3 py-2 text-xs">{a.endDate}</td>
              <td className="px-3 py-2 text-right">{a.daysToExpiry}</td>
              <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${BUCKET[a.bucket]}`}>{a.bucket === 'OVERDUE' ? 'OVERDUE' : `≤${a.bucket}d`}</span></td>
              <td className="px-3 py-2 text-right"><button onClick={() => renew(a.contractId)} className="text-indigo-600 text-xs hover:underline">renew</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = ['Clause Library', 'Deviations', 'Renewals'];

export default function ClmPage() {
  const [tab, setTab] = useState('Clause Library');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Contract Lifecycle Management</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Procurement Contracts parity — approved clause library with template assembly, deviation
          management routed to legal, e-signature envelopes, and 90/60/30-day renewal alerts.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Clause Library' && <ClausesTab />}
      {tab === 'Deviations' && <DeviationsTab />}
      {tab === 'Renewals' && <RenewalsTab />}
    </div>
  );
}
