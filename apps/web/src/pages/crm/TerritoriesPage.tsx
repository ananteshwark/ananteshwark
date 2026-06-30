import { useState, useEffect } from 'react';
import { territoriesApi } from '../../api/territories';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function TerritoriesTab() {
  const [items, setItems] = useState<any[]>([]);
  const [form, setForm] = useState({ code: '', name: '', ownerId: '', regions: '', industries: '', accountIds: '' });
  useEffect(() => { load(); }, []);
  async function load() { setItems(unwrap(await territoriesApi.list())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
    try { await territoriesApi.create({ code: form.code, name: form.name, ownerId: form.ownerId || undefined, regions: split(form.regions), industries: split(form.industries), accountIds: split(form.accountIds) }); setForm({ code: '', name: '', ownerId: '', regions: '', industries: '', accountIds: '' }); load(); }
    catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-6 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Owner ID" value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Regions (csv)" value={form.regions} onChange={(e) => setForm({ ...form, regions: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Industries (csv)" value={form.industries} onChange={(e) => setForm({ ...form, industries: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">+ Territory</button>
      </form>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Owner</th><th className="px-3 py-2 text-left">Coverage</th></tr></thead>
        <tbody className="divide-y">
          {items.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No territories.</td></tr> : items.map((t) => (
            <tr key={t.id}><td className="px-3 py-2 font-mono text-xs">{t.code}</td><td className="px-3 py-2">{t.name}</td><td className="px-3 py-2 font-mono text-xs">{t.ownerId ?? '—'}</td><td className="px-3 py-2 text-xs">{[...(t.regions ?? []), ...(t.industries ?? []), ...(t.accountIds ?? [])].join(', ') || '—'}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuotaAttainmentTab() {
  const [period, setPeriod] = useState('2026-Q2');
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState({ repId: '', quotaAmount: 0 });
  async function load() { try { const r = await territoriesApi.attainment(period); setData(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function setQuota(e: React.FormEvent) {
    e.preventDefault();
    try { await territoriesApi.setQuota({ repId: form.repId, period, quotaAmount: form.quotaAmount }); setForm({ repId: '', quotaAmount: 0 }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div><label className="text-xs text-gray-500">Period</label><input value={period} onChange={(e) => setPeriod(e.target.value)} className="w-32 border rounded px-2 py-1 text-sm" /></div>
        <button onClick={load} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Load Attainment</button>
      </div>
      <form onSubmit={setQuota} className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="Rep ID" value={form.repId} onChange={(e) => setForm({ ...form, repId: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono" />
        <input type="number" placeholder="Quota amount" value={form.quotaAmount} onChange={(e) => setForm({ ...form, quotaAmount: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" />
        <button type="submit" className="bg-gray-700 text-white px-2 py-1 rounded text-sm">Set Quota</button>
      </form>
      {data && (
        <>
          <div className="flex gap-4 text-sm">
            <span>Team Quota: <strong>{money(data.totalQuota)}</strong></span>
            <span>Attained: <strong>{money(data.totalAttained)}</strong></span>
            <span>Team %: <strong>{data.teamAttainmentPct ?? '—'}%</strong></span>
          </div>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Rep</th><th className="px-3 py-2 text-right">Quota</th><th className="px-3 py-2 text-right">Attained</th><th className="px-3 py-2 text-right">Gap</th><th className="px-3 py-2 text-right">Attainment</th></tr></thead>
            <tbody className="divide-y">
              {(data.reps ?? []).length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No quota/attainment data.</td></tr> : data.reps.map((r: any) => (
                <tr key={r.repId}>
                  <td className="px-3 py-2 font-mono text-xs">{r.repId}</td>
                  <td className="px-3 py-2 text-right">{money(r.quota)}</td>
                  <td className="px-3 py-2 text-right">{money(r.attained)}</td>
                  <td className="px-3 py-2 text-right">{money(r.gap)}</td>
                  <td className="px-3 py-2 text-right"><span className={`font-bold ${r.attainmentPct >= 100 ? 'text-green-600' : r.attainmentPct >= 70 ? 'text-amber-600' : 'text-red-600'}`}>{r.attainmentPct == null ? '—' : `${r.attainmentPct}%`}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

const TABS = ['Territories', 'Quotas & Attainment'];

export default function TerritoriesPage() {
  const [tab, setTab] = useState('Territories');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Territories & Quotas</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Sales territories parity — coverage-rule territories (region/industry/named account) with
          best-match assignment, rep × territory × product × quarter quotas, and real-time attainment.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Territories' && <TerritoriesTab />}
      {tab === 'Quotas & Attainment' && <QuotaAttainmentTab />}
    </div>
  );
}
