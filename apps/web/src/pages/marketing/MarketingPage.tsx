import { useState, useEffect } from 'react';
import { marketingApi } from '../../api/marketing';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const now = '2026-06-30T10:00:00Z';
const CSTATUS: Record<string, string> = { DRAFT: 'bg-gray-100 text-gray-600', SCHEDULED: 'bg-blue-100 text-blue-700', SENT: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700' };
const GRADE: Record<string, string> = { A: 'bg-green-100 text-green-700', B: 'bg-blue-100 text-blue-700', C: 'bg-amber-100 text-amber-700', D: 'bg-gray-100 text-gray-500' };

function CampaignsTab() {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [roi, setRoi] = useState<any>(null);
  const [form, setForm] = useState({ name: '', channel: 'EMAIL', cost: 0 });
  const [leads, setLeads] = useState('');

  useEffect(() => { load(); }, []);
  async function load() { setCampaigns(unwrap(await marketingApi.listCampaigns())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await marketingApi.createCampaign(form); setForm({ name: '', channel: 'EMAIL', cost: 0 }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function select(c: any) {
    setSelected(c);
    setStats((await marketingApi.stats(c.id)).data?.data ?? null);
    setRoi((await marketingApi.roi(c.id)).data?.data ?? null);
  }
  async function act(fn: () => Promise<any>) { try { await fn(); await load(); if (selected) await select(campaigns.find((x) => x.id === selected.id) ?? selected); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function addLeads() {
    const ids = leads.split(',').map((s) => s.trim()).filter(Boolean);
    if (!ids.length) return;
    await act(() => marketingApi.addMembers(selected.id, ids)); setLeads('');
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="space-y-3">
        <form onSubmit={create} className="bg-gray-50 p-3 rounded-lg space-y-2">
          <input required placeholder="Campaign name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
          <div className="flex gap-2">
            <select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} className="flex-1 border rounded px-2 py-1 text-sm">{['EMAIL', 'SMS'].map((c) => <option key={c}>{c}</option>)}</select>
            <input type="number" placeholder="Cost" value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} className="w-24 border rounded px-2 py-1 text-sm" />
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Campaign</button>
        </form>
        <ul className="border rounded-lg divide-y text-sm">
          {campaigns.length === 0 ? <li className="px-3 py-4 text-center text-gray-400">No campaigns.</li> : campaigns.map((c) => (
            <li key={c.id} className={`px-3 py-2 cursor-pointer ${selected?.id === c.id ? 'bg-indigo-50' : ''}`} onClick={() => select(c)}>
              <div className="flex justify-between"><span className="font-medium">{c.name}</span><span className={`text-xs px-1.5 py-0.5 rounded ${CSTATUS[c.status]}`}>{c.status}</span></div>
              <span className="text-xs text-gray-400">{c.channel} · cost {money(c.cost)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="col-span-2 space-y-3">
        {selected ? (
          <>
            <div className="flex gap-2 items-center">
              <h3 className="font-semibold">{selected.name}</h3>
              {selected.status === 'DRAFT' && <><input placeholder="lead ids (csv)" value={leads} onChange={(e) => setLeads(e.target.value)} className="border rounded px-2 py-1 text-xs" /><button onClick={addLeads} className="text-indigo-600 text-xs hover:underline">add members</button><button onClick={() => act(() => marketingApi.schedule(selected.id, now))} className="text-blue-600 text-xs hover:underline">schedule</button></>}
              {(selected.status === 'SCHEDULED' || selected.status === 'DRAFT') && <button onClick={() => act(() => marketingApi.send(selected.id, now))} className="text-green-600 text-xs hover:underline">send</button>}
            </div>
            {stats && (
              <div className="grid grid-cols-4 gap-3">
                <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Sent</p><p className="text-xl font-bold">{stats.sent}/{stats.total}</p></div>
                <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Open Rate</p><p className="text-xl font-bold">{stats.openRate}%</p></div>
                <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Click Rate</p><p className="text-xl font-bold">{stats.clickRate}%</p></div>
                <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Converted</p><p className="text-xl font-bold">{stats.converted}</p></div>
              </div>
            )}
            {roi && (
              <div className="border rounded-lg p-3 flex gap-6 text-sm">
                <span>Cost: <strong>{money(roi.cost)}</strong></span>
                <span>Revenue: <strong>{money(roi.revenue)}</strong></span>
                <span>Conv. Rate: <strong>{roi.conversionRate}%</strong></span>
                <span>ROI: <strong className={roi.roiPct >= 0 ? 'text-green-600' : 'text-red-600'}>{roi.roiPct == null ? '—' : `${roi.roiPct}%`}</strong></span>
              </div>
            )}
          </>
        ) : <p className="text-sm text-gray-400">Select a campaign.</p>}
      </div>
    </div>
  );
}

function LeadsTab() {
  const [top, setTop] = useState<any[]>([]);
  const [form, setForm] = useState({ leadId: '', behavior: 'FORM_FILL' });
  useEffect(() => { load(); }, []);
  async function load() { setTop(unwrap(await marketingApi.topLeads(20))); }
  async function record(e: React.FormEvent) {
    e.preventDefault();
    try { await marketingApi.behavior({ ...form, at: now }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={record} className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="Lead ID" value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono" />
        <select value={form.behavior} onChange={(e) => setForm({ ...form, behavior: e.target.value })} className="border rounded px-2 py-1 text-sm">{['EMAIL_OPEN', 'EMAIL_CLICK', 'PAGE_VISIT', 'FORM_FILL', 'DEMO_REQUEST', 'UNSUBSCRIBE'].map((b) => <option key={b}>{b}</option>)}</select>
        <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">Record Behavior</button>
      </form>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Lead</th><th className="px-3 py-2 text-right">Score</th><th className="px-3 py-2 text-left">Grade</th><th className="px-3 py-2 text-right">Activities</th></tr></thead>
        <tbody className="divide-y">
          {top.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No scored leads.</td></tr> : top.map((l) => (
            <tr key={l.id}><td className="px-3 py-2 font-mono text-xs">{l.leadId}</td><td className="px-3 py-2 text-right font-bold">{l.score}</td><td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${GRADE[l.grade]}`}>{l.grade}</span></td><td className="px-3 py-2 text-right">{(l.behaviors ?? []).length}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NurtureTab() {
  const [flows, setFlows] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', triggerBehavior: 'FORM_FILL', steps: '0:SEND_EMAIL, 3:SEND_EMAIL, 7:NOTIFY_SALES' });
  useEffect(() => { load(); }, []);
  async function load() { setFlows(unwrap(await marketingApi.listFlows())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const steps = form.steps.split(',').map((s, i) => { const [delayDays, action] = s.trim().split(':'); return { order: i + 1, delayDays: Number(delayDays), action }; });
    try { await marketingApi.createFlow({ name: form.name, triggerBehavior: form.triggerBehavior, steps }); setForm({ name: '', triggerBehavior: 'FORM_FILL', steps: '0:SEND_EMAIL, 3:SEND_EMAIL, 7:NOTIFY_SALES' }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="Flow name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <select value={form.triggerBehavior} onChange={(e) => setForm({ ...form, triggerBehavior: e.target.value })} className="border rounded px-2 py-1 text-sm">{['EMAIL_OPEN', 'PAGE_VISIT', 'FORM_FILL', 'DEMO_REQUEST'].map((b) => <option key={b}>{b}</option>)}</select>
        <input placeholder="steps delay:action" value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono text-xs" />
        <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">+ Flow</button>
      </form>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Trigger</th><th className="px-3 py-2 text-left">Steps</th></tr></thead>
        <tbody className="divide-y">
          {flows.length === 0 ? <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-400">No nurture flows.</td></tr> : flows.map((f) => (
            <tr key={f.id}><td className="px-3 py-2 font-medium">{f.name}</td><td className="px-3 py-2 font-mono text-xs">{f.triggerBehavior}</td><td className="px-3 py-2 text-xs">{(f.steps ?? []).map((s: any) => `+${s.delayDays}d ${s.action}`).join(' → ')}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = ['Campaigns', 'Lead Scoring', 'Nurture Flows'];

export default function MarketingPage() {
  const [tab, setTab] = useState('Campaigns');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Marketing Automation</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Eloqua/Responsys parity — email/SMS campaigns with engagement tracking, behavioral lead
          scoring with A–D grades, nurture flows, and campaign ROI attribution.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Campaigns' && <CampaignsTab />}
      {tab === 'Lead Scoring' && <LeadsTab />}
      {tab === 'Nurture Flows' && <NurtureTab />}
    </div>
  );
}
