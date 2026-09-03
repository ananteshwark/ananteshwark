import { useState, useEffect } from 'react';
import { spendAnalysisApi } from '../../api/spendAnalysis';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function CubeTab() {
  const [groupBy, setGroupBy] = useState('supplier');
  const [cube, setCube] = useState<any>(null);
  useEffect(() => { load(); }, [groupBy]);
  async function load() { const r = await spendAnalysisApi.cube(groupBy); setCube(r.data?.data ?? r.data); }
  async function rebuild() {
    try { const r = await spendAnalysisApi.rebuild(); const d = r.data?.data ?? r.data; alert(`Rebuilt ${d.rebuilt} cube cell(s) from POs`); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label className="text-xs text-gray-500">Group by</label>
        <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="border rounded px-2 py-1 text-sm">{['supplier', 'category', 'costCenter', 'period'].map((t) => <option key={t}>{t}</option>)}</select>
        <button onClick={rebuild} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Rebuild from POs</button>
      </div>
      {cube && (
        <>
          <div className="flex gap-4 text-sm">
            <span>Committed: <strong>{money(cube.totalCommitted)}</strong></span>
            <span>Actual: <strong>{money(cube.totalActual)}</strong></span>
          </div>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left capitalize">{cube.groupBy}</th><th className="px-3 py-2 text-right">Committed</th><th className="px-3 py-2 text-right">Actual</th></tr></thead>
            <tbody className="divide-y">
              {(cube.groups ?? []).length === 0 ? <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-400">No spend. Rebuild from POs.</td></tr> : cube.groups.map((g: any) => (
                <tr key={g.key}><td className="px-3 py-2 font-medium">{g.key}</td><td className="px-3 py-2 text-right">{money(g.committed)}</td><td className="px-3 py-2 text-right">{money(g.actual)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function SavingsTab() {
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState({ description: '', marketPrice: 0, negotiatedPrice: 0, quantity: 1, period: '2026-06', source: 'NEGOTIATION' });
  useEffect(() => { load(); }, []);
  async function load() { const r = await spendAnalysisApi.savings(); setData(r.data?.data ?? r.data); }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try { await spendAnalysisApi.logSavings(form); setForm({ ...form, description: '', marketPrice: 0, negotiatedPrice: 0, quantity: 1 }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={add} className="grid grid-cols-6 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="col-span-2 border rounded px-2 py-1 text-sm" />
        <input type="number" placeholder="Market" value={form.marketPrice} onChange={(e) => setForm({ ...form, marketPrice: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" />
        <input type="number" placeholder="Negotiated" value={form.negotiatedPrice} onChange={(e) => setForm({ ...form, negotiatedPrice: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" />
        <input type="number" placeholder="Qty" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" />
        <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">Log</button>
      </form>
      {data && (
        <>
          <p className="text-sm">Total savings: <strong className="text-green-700">{money(data.totalSavings)}</strong> across {data.count} entries</p>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-left">Period</th><th className="px-3 py-2 text-right">Market</th><th className="px-3 py-2 text-right">Negotiated</th><th className="px-3 py-2 text-right">Savings</th></tr></thead>
            <tbody className="divide-y">
              {(data.records ?? []).length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No savings logged.</td></tr> : data.records.map((r: any) => (
                <tr key={r.id}><td className="px-3 py-2">{r.description ?? '—'}</td><td className="px-3 py-2">{r.period}</td><td className="px-3 py-2 text-right">{money(r.marketPrice)}</td><td className="px-3 py-2 text-right">{money(r.negotiatedPrice)}</td><td className="px-3 py-2 text-right text-green-700 font-medium">{money(r.savingsAmount)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function MaverickTab() {
  const [approved, setApproved] = useState('');
  const [data, setData] = useState<any>(null);
  async function run() {
    const ids = approved.split(',').map((s) => s.trim()).filter(Boolean);
    try { const r = await spendAnalysisApi.maverick(ids); setData(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div className="flex-1"><label className="text-xs text-gray-500">Approved vendor IDs (comma-separated, blank = skip vendor check)</label><input value={approved} onChange={(e) => setApproved(e.target.value)} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <button onClick={run} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Detect</button>
      </div>
      {data && (
        <>
          <p className="text-sm">Flagged: <strong className="text-red-600">{data.flaggedCount}</strong> · Maverick spend: <strong>{money(data.maverickSpend)}</strong></p>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">PO</th><th className="px-3 py-2 text-left">Vendor</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-left">Reasons</th></tr></thead>
            <tbody className="divide-y">
              {(data.flagged ?? []).length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-green-600">No maverick spend detected.</td></tr> : data.flagged.map((f: any) => (
                <tr key={f.poId}><td className="px-3 py-2 font-mono text-xs">{f.poNumber}</td><td className="px-3 py-2">{f.vendorName ?? f.vendorId}</td><td className="px-3 py-2 text-right">{money(f.total)}</td><td className="px-3 py-2">{f.reasons.map((r: string) => <span key={r} className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded mr-1">{r}</span>)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

const TABS = ['Spend Cube', 'Savings', 'Maverick Spend'];

export default function SpendAnalysisPage() {
  const [tab, setTab] = useState('Spend Cube');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Spend Analysis</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Procurement Analytics parity — a spend cube (committed vs actual by supplier/category/cost
          center/period), negotiated-vs-market savings tracking, and maverick-spend detection.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Spend Cube' && <CubeTab />}
      {tab === 'Savings' && <SavingsTab />}
      {tab === 'Maverick Spend' && <MaverickTab />}
    </div>
  );
}
