import { useState, useEffect } from 'react';
import { serviceDeskApi } from '../../api/serviceDesk';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const now = '2026-06-30T10:00:00Z';
const SLA_STATE: Record<string, string> = { IMMINENT: 'bg-amber-100 text-amber-700', BREACHED: 'bg-red-100 text-red-700' };
const ART_STATUS: Record<string, string> = { DRAFT: 'bg-gray-100 text-gray-600', PUBLISHED: 'bg-green-100 text-green-700', ARCHIVED: 'bg-gray-100 text-gray-400' };

function KbTab() {
  const [results, setResults] = useState<any[]>([]);
  const [term, setTerm] = useState('');
  const [form, setForm] = useState({ title: '', body: '', category: '', visibility: 'PUBLIC' });
  useEffect(() => { search(); }, []);
  async function search() { setResults(unwrap(await serviceDeskApi.searchArticles(term))); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { const r = await serviceDeskApi.createArticle(form); const a = r.data?.data ?? r.data; await serviceDeskApi.publishArticle(a.id); setForm({ title: '', body: '', category: '', visibility: 'PUBLIC' }); search(); }
    catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="grid grid-cols-2 gap-6">
      <form onSubmit={create} className="bg-gray-50 p-3 rounded-lg space-y-2">
        <h3 className="font-semibold text-sm">New Article (auto-published)</h3>
        <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
        <textarea required placeholder="Body" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" rows={3} />
        <div className="flex gap-2">
          <input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="flex-1 border rounded px-2 py-1 text-sm" />
          <select value={form.visibility} onChange={(e) => setForm({ ...form, visibility: e.target.value })} className="border rounded px-2 py-1 text-sm">{['PUBLIC', 'INTERNAL'].map((v) => <option key={v}>{v}</option>)}</select>
        </div>
        <button type="submit" className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Publish Article</button>
      </form>
      <div className="space-y-2">
        <div className="flex gap-2">
          <input placeholder="Search…" value={term} onChange={(e) => setTerm(e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm" />
          <button onClick={search} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Search</button>
        </div>
        <ul className="border rounded-lg divide-y text-sm">
          {results.length === 0 ? <li className="px-3 py-4 text-center text-gray-400">No articles.</li> : results.map((a) => (
            <li key={a.id} className="px-3 py-2">
              <div className="flex justify-between"><span className="font-medium">{a.title}</span><span className={`text-xs px-1.5 py-0.5 rounded ${ART_STATUS[a.status]}`}>{a.status}</span></div>
              <p className="text-xs text-gray-500">{a.category} · {a.visibility} · 👍 {a.helpfulCount} 👎 {a.notHelpfulCount}</p>
              <div className="mt-1 flex gap-2"><button onClick={async () => { await serviceDeskApi.rateArticle(a.id, true); search(); }} className="text-green-600 text-xs hover:underline">helpful</button><button onClick={async () => { await serviceDeskApi.rateArticle(a.id, false); search(); }} className="text-red-500 text-xs hover:underline">not helpful</button></div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function EmailTab() {
  const [rules, setRules] = useState<any[]>([]);
  const [ruleForm, setRuleForm] = useState({ keyword: '', category: '', setPriority: 'HIGH', priorityOrder: 10 });
  const [email, setEmail] = useState({ subject: '', body: '', customerId: '' });
  const [created, setCreated] = useState<any>(null);
  useEffect(() => { load(); }, []);
  async function load() { setRules(unwrap(await serviceDeskApi.listRules())); }
  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    try { await serviceDeskApi.createRule(ruleForm); setRuleForm({ keyword: '', category: '', setPriority: 'HIGH', priorityOrder: 10 }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    try { const r = await serviceDeskApi.emailToTicket(email); setCreated(r.data?.data ?? r.data); setEmail({ subject: '', body: '', customerId: '' }); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-3">
        <form onSubmit={addRule} className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg items-end">
          <input required placeholder="Keyword" value={ruleForm.keyword} onChange={(e) => setRuleForm({ ...ruleForm, keyword: e.target.value })} className="border rounded px-2 py-1 text-sm" />
          <input placeholder="Category" value={ruleForm.category} onChange={(e) => setRuleForm({ ...ruleForm, category: e.target.value })} className="border rounded px-2 py-1 text-sm" />
          <select value={ruleForm.setPriority} onChange={(e) => setRuleForm({ ...ruleForm, setPriority: e.target.value })} className="border rounded px-2 py-1 text-sm">{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((p) => <option key={p}>{p}</option>)}</select>
          <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">+ Rule</button>
        </form>
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-50"><tr><th className="px-2 py-2 text-left">Order</th><th className="px-2 py-2 text-left">Keyword</th><th className="px-2 py-2 text-left">Category</th><th className="px-2 py-2 text-left">Priority</th></tr></thead>
          <tbody className="divide-y">
            {rules.length === 0 ? <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No rules.</td></tr> : rules.map((r) => (
              <tr key={r.id}><td className="px-2 py-2">{r.priorityOrder}</td><td className="px-2 py-2 font-mono text-xs">{r.keyword}</td><td className="px-2 py-2">{r.category ?? '—'}</td><td className="px-2 py-2">{r.setPriority ?? '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={submitEmail} className="bg-gray-50 p-3 rounded-lg space-y-2">
        <h3 className="font-semibold text-sm">Simulate Inbound Email</h3>
        <input required placeholder="Subject" value={email.subject} onChange={(e) => setEmail({ ...email, subject: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
        <textarea placeholder="Body" value={email.body} onChange={(e) => setEmail({ ...email, body: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" rows={3} />
        <button type="submit" className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Create Ticket from Email</button>
        {created && <div className="border rounded p-2 text-xs bg-white"><p className="font-mono">{created.ticketNumber}</p><p>Priority {created.priority} · {created.category ?? 'uncategorized'}{created.assignedToUserId ? ` · assigned ${created.assignedToUserId}` : ''}</p></div>}
      </form>
    </div>
  );
}

function SlaTab() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { load(); }, []);
  async function load() { const r = await serviceDeskApi.escalationCandidates(now, 60); setData(r.data?.data ?? r.data); }
  async function escalate(id: string) {
    const mgr = prompt('Manager user ID?'); if (!mgr) return;
    try { const r = await serviceDeskApi.escalate(id, mgr); const d = r.data?.data ?? r.data; alert(`Escalated to ${mgr}, priority now ${d.newPriority}`); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      {data && <p className="text-sm text-gray-500">{data.count} ticket(s) with imminent/breached SLA as of {now}</p>}
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Ticket</th><th className="px-3 py-2 text-left">Priority</th><th className="px-3 py-2 text-right">Min to Due</th><th className="px-3 py-2 text-left">State</th><th className="px-3 py-2" /></tr></thead>
        <tbody className="divide-y">
          {(data?.candidates ?? []).length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No SLA escalations pending.</td></tr> : data.candidates.map((c: any) => (
            <tr key={c.ticketId}>
              <td className="px-3 py-2 font-mono text-xs">{c.ticketNumber}</td>
              <td className="px-3 py-2">{c.priority}</td>
              <td className="px-3 py-2 text-right">{c.minutesToDue}</td>
              <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${SLA_STATE[c.state]}`}>{c.state}</span></td>
              <td className="px-3 py-2 text-right"><button onClick={() => escalate(c.ticketId)} className="text-indigo-600 text-xs hover:underline">escalate</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = ['Knowledge Base', 'Email-to-Ticket', 'SLA Escalation'];

export default function ServiceDeskPage() {
  const [tab, setTab] = useState('Knowledge Base');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Service Desk</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Fusion Service parity — knowledge base with ratings and self-service deflection,
          email-to-ticket keyword routing, and SLA-breach escalation automation.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Knowledge Base' && <KbTab />}
      {tab === 'Email-to-Ticket' && <EmailTab />}
      {tab === 'SLA Escalation' && <SlaTab />}
    </div>
  );
}
