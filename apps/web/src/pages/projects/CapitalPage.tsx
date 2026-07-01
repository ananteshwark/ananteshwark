import { useState } from 'react';
import { projectCapitalApi } from '../../api/projectCapital';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const TREAT: Record<string, string> = { CAPITALIZE: 'bg-green-100 text-green-700', EXPENSE: 'bg-amber-100 text-amber-700' };

export default function CapitalPage() {
  const [projectId, setProjectId] = useState('');
  const [config, setConfig] = useState({ isCapital: true, cipAccountCode: '1550', defaultTreatment: 'CAPITALIZE' });
  const [rule, setRule] = useState({ taskId: '', treatment: 'CAPITALIZE' });
  const [accum, setAccum] = useState({ taskId: '', period: '2026-06', amount: 0 });
  const [summary, setSummary] = useState<any>(null);
  const [entries, setEntries] = useState<any[]>([]);
  const [assets, setAssets] = useState('Server:70, Network:30');

  async function load() {
    if (!projectId) return;
    try {
      setSummary((await projectCapitalApi.cipSummary(projectId)).data?.data ?? null);
      setEntries(unwrap(await projectCapitalApi.entries(projectId)));
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function saveConfig() { try { await projectCapitalApi.setConfig(projectId, config); alert('Config saved'); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function saveRule() { try { await projectCapitalApi.setRule(projectId, rule); alert('Rule saved'); setRule({ taskId: '', treatment: 'CAPITALIZE' }); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function doAccum(e: React.FormEvent) { e.preventDefault(); try { await projectCapitalApi.accumulate(projectId, accum); setAccum({ taskId: '', period: '2026-06', amount: 0 }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function transfer() {
    const parsed = assets.split(',').map((a) => { const [assetName, splitPct] = a.trim().split(':'); return { assetName, splitPct: Number(splitPct) }; });
    try { const r = await projectCapitalApi.transfer(projectId, parsed); const d = r.data?.data ?? r.data; alert(`Transferred ${money(d.totalTransferred)} to ${d.assets.map((a: any) => `${a.assetName} (${money(a.amount)})`).join(', ')}`); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Capital Projects & CIP</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Project Costing (Capital) parity — tag a project as capital with capitalize/expense rules per
          task, accumulate costs into CIP, and transfer CIP to in-service fixed assets split across multiple assets.
        </p>
      </div>
      <div className="flex items-end gap-2">
        <div><label className="text-xs text-gray-500">Project ID</label><input value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-80 border rounded px-2 py-1 text-sm font-mono" placeholder="project uuid" /></div>
        <button onClick={load} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Load</button>
      </div>
      {projectId && (
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="border rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold">Capital Config</h3>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={config.isCapital} onChange={(e) => setConfig({ ...config, isCapital: e.target.checked })} /> Capital project</label>
              <div className="flex gap-2">
                <input placeholder="CIP account" value={config.cipAccountCode} onChange={(e) => setConfig({ ...config, cipAccountCode: e.target.value })} className="flex-1 border rounded px-2 py-1 text-sm" />
                <select value={config.defaultTreatment} onChange={(e) => setConfig({ ...config, defaultTreatment: e.target.value })} className="border rounded px-2 py-1 text-sm">{['CAPITALIZE', 'EXPENSE'].map((t) => <option key={t}>{t}</option>)}</select>
              </div>
              <button onClick={saveConfig} className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Save Config</button>
            </div>
            <div className="border rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold">Task Rule</h3>
              <div className="flex gap-2">
                <input placeholder="Task ID" value={rule.taskId} onChange={(e) => setRule({ ...rule, taskId: e.target.value })} className="flex-1 border rounded px-2 py-1 text-sm font-mono" />
                <select value={rule.treatment} onChange={(e) => setRule({ ...rule, treatment: e.target.value })} className="border rounded px-2 py-1 text-sm">{['CAPITALIZE', 'EXPENSE'].map((t) => <option key={t}>{t}</option>)}</select>
                <button onClick={saveRule} className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">Set</button>
              </div>
            </div>
            <form onSubmit={doAccum} className="border rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold">Accumulate Cost</h3>
              <div className="grid grid-cols-3 gap-2">
                <input placeholder="Task ID" value={accum.taskId} onChange={(e) => setAccum({ ...accum, taskId: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono" />
                <input placeholder="Period" value={accum.period} onChange={(e) => setAccum({ ...accum, period: e.target.value })} className="border rounded px-2 py-1 text-sm" />
                <input type="number" placeholder="Amount" value={accum.amount} onChange={(e) => setAccum({ ...accum, amount: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" />
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Accumulate</button>
            </form>
          </div>
          <div className="space-y-3">
            {summary && (
              <div className="grid grid-cols-2 gap-2">
                {[['In CIP', summary.inCip], ['Transferred', summary.transferred], ['Total Capitalized', summary.totalCapitalized], ['Expensed', summary.expensed]].map(([k, v]) => (
                  <div key={k as string} className="border rounded-lg p-2"><p className="text-xs text-gray-500">{k}</p><p className="text-lg font-bold">{money(v)}</p></div>
                ))}
              </div>
            )}
            <div className="border rounded-lg p-3 space-y-2">
              <h3 className="text-sm font-semibold">Transfer CIP → In-Service</h3>
              <input placeholder="Asset:pct, …" value={assets} onChange={(e) => setAssets(e.target.value)} className="w-full border rounded px-2 py-1 text-sm font-mono text-xs" />
              <button onClick={transfer} className="w-full bg-green-600 text-white px-3 py-1.5 rounded text-sm">Transfer to Assets</button>
            </div>
            <table className="w-full text-sm border rounded-lg overflow-hidden">
              <thead className="bg-gray-50"><tr><th className="px-2 py-2 text-left">Period</th><th className="px-2 py-2 text-left">Task</th><th className="px-2 py-2 text-right">Amount</th><th className="px-2 py-2 text-left">Treatment</th><th className="px-2 py-2 text-left">Status</th></tr></thead>
              <tbody className="divide-y">
                {entries.length === 0 ? <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-400">No CIP entries.</td></tr> : entries.map((e) => (
                  <tr key={e.id}><td className="px-2 py-2">{e.period}</td><td className="px-2 py-2 font-mono text-xs">{e.taskId ?? '—'}</td><td className="px-2 py-2 text-right">{money(e.amount)}</td><td className="px-2 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${TREAT[e.treatment]}`}>{e.treatment}</span></td><td className="px-2 py-2 text-xs">{e.status}{e.assetRef ? ` → ${e.assetRef}` : ''}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
