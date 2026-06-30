import { useState, useEffect } from 'react';
import { supplierQualApi } from '../../api/supplierQualification';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const today = '2026-06-30';
const RESP_STATUS: Record<string, string> = {
  PASSED: 'bg-green-100 text-green-700', REVIEW: 'bg-amber-100 text-amber-700', APPROVED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700',
};
const CERT_STATUS: Record<string, string> = { VALID: 'bg-green-100 text-green-700', EXPIRING: 'bg-amber-100 text-amber-700', EXPIRED: 'bg-red-100 text-red-700' };

function QuestionnairesTab() {
  const [items, setItems] = useState<any[]>([]);
  const [responses, setResponses] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', category: '', passThresholdPct: 70 });
  const [questions, setQuestions] = useState<any[]>([{ id: 'q1', text: '', type: 'BOOLEAN', weight: 1, passValue: true }]);

  useEffect(() => { load(); }, []);
  async function load() {
    setItems(unwrap(await supplierQualApi.listQuestionnaires()));
    setResponses(unwrap(await supplierQualApi.listResponses()));
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await supplierQualApi.createQuestionnaire({ ...form, questions }); setForm({ name: '', category: '', passThresholdPct: 70 }); setQuestions([{ id: 'q1', text: '', type: 'BOOLEAN', weight: 1, passValue: true }]); load(); }
    catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  function setQ(i: number, patch: any) { setQuestions(questions.map((q, idx) => (idx === i ? { ...q, ...patch } : q))); }
  async function review(id: string, decision: 'APPROVE' | 'REJECT') {
    try { await supplierQualApi.review(id, decision); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-3">
        <form onSubmit={create} className="bg-gray-50 p-3 rounded-lg space-y-2">
          <div className="flex gap-2">
            <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="flex-1 border rounded px-2 py-1 text-sm" />
            <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-32 border rounded px-2 py-1 text-sm" />
          </div>
          {questions.map((q, i) => (
            <div key={i} className="grid grid-cols-4 gap-1 items-center">
              <input required placeholder="Question" value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} className="col-span-2 border rounded px-2 py-1 text-xs" />
              <select value={q.type} onChange={(e) => setQ(i, { type: e.target.value, passValue: e.target.value === 'BOOLEAN' ? true : e.target.value === 'NUMERIC' ? 0 : '' })} className="border rounded px-1 py-1 text-xs">{['BOOLEAN', 'NUMERIC', 'CHOICE'].map((t) => <option key={t}>{t}</option>)}</select>
              <input placeholder="pass" value={String(q.passValue)} onChange={(e) => setQ(i, { passValue: q.type === 'NUMERIC' ? Number(e.target.value) : q.type === 'BOOLEAN' ? e.target.value === 'true' : e.target.value })} className="border rounded px-1 py-1 text-xs" />
            </div>
          ))}
          <button type="button" onClick={() => setQuestions([...questions, { id: `q${questions.length + 1}`, text: '', type: 'BOOLEAN', weight: 1, passValue: true }])} className="text-indigo-600 text-xs hover:underline">+ question</button>
          <button type="submit" className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Create Questionnaire</button>
        </form>
        <ul className="border rounded-lg divide-y text-sm">
          {items.length === 0 ? <li className="px-3 py-4 text-center text-gray-400">No questionnaires.</li> : items.map((q) => (
            <li key={q.id} className="px-3 py-2"><span className="font-medium">{q.name}</span> <span className="text-xs text-gray-400">{q.category} · {q.questions?.length} Q · pass {q.passThresholdPct}%</span></li>
          ))}
        </ul>
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Responses</h3>
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-50"><tr><th className="px-2 py-2 text-left">Supplier</th><th className="px-2 py-2 text-right">Score</th><th className="px-2 py-2 text-left">Status</th><th className="px-2 py-2" /></tr></thead>
          <tbody className="divide-y">
            {responses.length === 0 ? <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No responses.</td></tr> : responses.map((r) => (
              <tr key={r.id}>
                <td className="px-2 py-2">{r.supplierId}</td>
                <td className="px-2 py-2 text-right">{r.scorePct}%</td>
                <td className="px-2 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${RESP_STATUS[r.status]}`}>{r.status}</span></td>
                <td className="px-2 py-2 text-right whitespace-nowrap">{r.status === 'REVIEW' && <><button onClick={() => review(r.id, 'APPROVE')} className="text-green-600 text-xs hover:underline mr-2">approve</button><button onClick={() => review(r.id, 'REJECT')} className="text-red-500 text-xs hover:underline">reject</button></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CertificatesTab() {
  const [supplierId, setSupplierId] = useState('');
  const [certs, setCerts] = useState<any[]>([]);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [form, setForm] = useState({ certType: '', certNumber: '', issuer: '', expiryDate: '' });

  useEffect(() => { loadExpiring(); }, []);
  async function loadExpiring() { setExpiring(unwrap(await supplierQualApi.expiring(today, 60))); }
  async function load() { if (supplierId) setCerts(unwrap(await supplierQualApi.listCertificates(supplierId, today))); }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try { await supplierQualApi.addCertificate({ supplierId, ...form }); setForm({ certType: '', certNumber: '', issuer: '', expiryDate: '' }); load(); loadExpiring(); }
    catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-3">
        <div className="flex items-end gap-2">
          <div className="flex-1"><label className="text-xs text-gray-500">Supplier ID</label><input value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
          <button onClick={load} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Load</button>
        </div>
        {supplierId && (
          <form onSubmit={add} className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-lg items-end">
            <input required placeholder="Cert type" value={form.certType} onChange={(e) => setForm({ ...form, certType: e.target.value })} className="border rounded px-2 py-1 text-sm" />
            <input type="date" required value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} className="border rounded px-2 py-1 text-sm" />
            <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">+ Cert</button>
          </form>
        )}
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-50"><tr><th className="px-2 py-2 text-left">Type</th><th className="px-2 py-2 text-left">Expiry</th><th className="px-2 py-2 text-right">Days</th><th className="px-2 py-2 text-left">Status</th></tr></thead>
          <tbody className="divide-y">
            {certs.length === 0 ? <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No certificates.</td></tr> : certs.map((c) => (
              <tr key={c.id}><td className="px-2 py-2">{c.certType}</td><td className="px-2 py-2 text-xs">{c.expiryDate}</td><td className="px-2 py-2 text-right">{c.daysToExpiry}</td><td className="px-2 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${CERT_STATUS[c.status]}`}>{c.status}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-2">
        <h3 className="font-semibold text-sm">Expiring within 60 days (all suppliers)</h3>
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-50"><tr><th className="px-2 py-2 text-left">Supplier</th><th className="px-2 py-2 text-left">Type</th><th className="px-2 py-2 text-right">Days</th><th className="px-2 py-2 text-left">Status</th></tr></thead>
          <tbody className="divide-y">
            {expiring.length === 0 ? <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">None expiring.</td></tr> : expiring.map((c) => (
              <tr key={c.id}><td className="px-2 py-2 font-mono text-xs">{c.supplierId}</td><td className="px-2 py-2">{c.certType}</td><td className="px-2 py-2 text-right">{c.daysToExpiry}</td><td className="px-2 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${CERT_STATUS[c.status]}`}>{c.status}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScorecardTab() {
  const [supplierId, setSupplierId] = useState('');
  const [trend, setTrend] = useState<any>(null);
  const [form, setForm] = useState({ period: '2026-06', onTimeDeliveryPct: 90, qualityRejectPct: 5, invoiceAccuracyPct: 95 });

  async function load() { if (supplierId) { const r = await supplierQualApi.trend(supplierId); setTrend(r.data?.data ?? r.data); } }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await supplierQualApi.upsertScorecard({ supplierId, ...form }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div><label className="text-xs text-gray-500">Supplier ID</label><input value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-72 border rounded px-2 py-1 text-sm font-mono" /></div>
        <button onClick={load} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Load Trend</button>
      </div>
      {supplierId && (
        <form onSubmit={save} className="grid grid-cols-5 gap-2 bg-gray-50 p-3 rounded-lg items-end">
          <div><label className="text-xs text-gray-500">Period</label><input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">On-Time %</label><input type="number" value={form.onTimeDeliveryPct} onChange={(e) => setForm({ ...form, onTimeDeliveryPct: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Reject %</label><input type="number" value={form.qualityRejectPct} onChange={(e) => setForm({ ...form, qualityRejectPct: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Invoice Acc %</label><input type="number" value={form.invoiceAccuracyPct} onChange={(e) => setForm({ ...form, invoiceAccuracyPct: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Save Period</button>
        </form>
      )}
      {trend && (
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Period</th><th className="px-3 py-2 text-right">On-Time</th><th className="px-3 py-2 text-right">Reject</th><th className="px-3 py-2 text-right">Invoice</th><th className="px-3 py-2 text-right">Overall</th><th className="px-3 py-2 text-right">Δ</th></tr></thead>
          <tbody className="divide-y">
            {(trend.series ?? []).map((s: any) => (
              <tr key={s.period}>
                <td className="px-3 py-2">{s.period}</td>
                <td className="px-3 py-2 text-right">{s.onTimeDeliveryPct}%</td>
                <td className="px-3 py-2 text-right">{s.qualityRejectPct}%</td>
                <td className="px-3 py-2 text-right">{s.invoiceAccuracyPct}%</td>
                <td className="px-3 py-2 text-right font-bold">{s.overallScore}</td>
                <td className={`px-3 py-2 text-right ${s.delta > 0 ? 'text-green-600' : s.delta < 0 ? 'text-red-600' : 'text-gray-400'}`}>{s.delta == null ? '—' : (s.delta > 0 ? '+' : '') + s.delta}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const TABS = ['Questionnaires', 'Certificates', 'Scorecards'];

export default function SupplierQualificationPage() {
  const [tab, setTab] = useState('Questionnaires');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Supplier Qualification & Risk</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle SQM parity — weighted qualification questionnaires with auto pass/fail scoring and review
          routing, certificate expiry tracking, and periodic supplier KPI scorecards with trend.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Questionnaires' && <QuestionnairesTab />}
      {tab === 'Certificates' && <CertificatesTab />}
      {tab === 'Scorecards' && <ScorecardTab />}
    </div>
  );
}
