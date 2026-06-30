import { useState } from 'react';
import { forecastingApi } from '../../api/forecasting';

const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function RollupTab() {
  const [period, setPeriod] = useState('2026-Q2');
  const [data, setData] = useState<any>(null);
  const [winRate, setWinRate] = useState<any>(null);
  const [acc, setAcc] = useState<any>(null);

  async function load() {
    try {
      const r = await forecastingApi.rollup(period); setData(r.data?.data ?? r.data);
      const w = await forecastingApi.winRate(period); setWinRate(w.data?.data ?? w.data);
      const a = await forecastingApi.accuracy(period); setAcc(a.data?.data ?? a.data);
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function snapshot() {
    try { await forecastingApi.snapshot(period, '2026-06-30'); alert('Forecast snapshot saved'); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div><label className="text-xs text-gray-500">Period (YYYY-Qn)</label><input value={period} onChange={(e) => setPeriod(e.target.value)} className="w-32 border rounded px-2 py-1 text-sm" /></div>
        <button onClick={load} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Load</button>
        <button onClick={snapshot} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Snapshot</button>
      </div>
      {data && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Team Commit</p><p className="text-xl font-bold">{money(data.teamCommit)}</p></div>
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Team Best Case</p><p className="text-xl font-bold">{money(data.teamBestCase)}</p></div>
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Weighted Pipeline</p><p className="text-xl font-bold">{money(data.teamWeightedPipeline)}</p></div>
          </div>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Owner</th><th className="px-3 py-2 text-right">Commit</th><th className="px-3 py-2 text-right">Best Case</th><th className="px-3 py-2 text-right">Wtd Pipeline</th><th className="px-3 py-2 text-right">Mgr Forecast</th></tr></thead>
            <tbody className="divide-y">
              {(data.owners ?? []).length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No forecast data for this period.</td></tr> : data.owners.map((o: any) => (
                <tr key={o.ownerId}>
                  <td className="px-3 py-2 font-mono text-xs">{o.ownerId}</td>
                  <td className="px-3 py-2 text-right">{money(o.commit)}</td>
                  <td className="px-3 py-2 text-right">{money(o.bestCase)}</td>
                  <td className="px-3 py-2 text-right">{money(o.weightedPipeline)}</td>
                  <td className="px-3 py-2 text-right font-medium">{o.managerForecast == null ? '—' : money(o.managerForecast)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-2 gap-4">
            {acc && (
              <div className="border rounded-lg p-3">
                <p className="text-sm font-semibold mb-1">Accuracy</p>
                <p className="text-xs text-gray-500">Committed {money(acc.committed)} · Actual {money(acc.actual)} · Variance <span className={acc.variance >= 0 ? 'text-green-600' : 'text-red-600'}>{money(acc.variance)}</span></p>
                {acc.accuracyPct != null && <p className="text-2xl font-bold mt-1">{acc.accuracyPct}%</p>}
              </div>
            )}
            {winRate && (
              <div className="border rounded-lg p-3">
                <p className="text-sm font-semibold mb-1">Win Rate</p>
                <p className="text-2xl font-bold">{winRate.winRatePct ?? '—'}%</p>
                <p className="text-xs text-gray-500">{winRate.won} won · {winRate.lost} lost</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CategorizeTab() {
  const [form, setForm] = useState({ opportunityId: '', category: 'COMMIT', period: '' });
  const [ovForm, setOvForm] = useState({ ownerId: '', period: '2026-Q2', overrideAmount: 0 });
  async function assign(e: React.FormEvent) {
    e.preventDefault();
    try { await forecastingApi.assignCategory(form); alert('Category assigned'); setForm({ opportunityId: '', category: 'COMMIT', period: '' }); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function override(e: React.FormEvent) {
    e.preventDefault();
    try { await forecastingApi.setOverride(ovForm); alert('Override set'); setOvForm({ ownerId: '', period: '2026-Q2', overrideAmount: 0 }); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="grid grid-cols-2 gap-6">
      <form onSubmit={assign} className="bg-gray-50 p-4 rounded-lg space-y-2">
        <h3 className="font-semibold text-sm">Assign Forecast Category</h3>
        <input required placeholder="Opportunity ID" value={form.opportunityId} onChange={(e) => setForm({ ...form, opportunityId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">{['COMMIT', 'BEST_CASE', 'PIPELINE', 'OMITTED'].map((c) => <option key={c}>{c}</option>)}</select>
        <input placeholder="Period (blank = from close date)" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
        <button type="submit" className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Assign</button>
      </form>
      <form onSubmit={override} className="bg-gray-50 p-4 rounded-lg space-y-2">
        <h3 className="font-semibold text-sm">Manager Override</h3>
        <input required placeholder="Owner ID" value={ovForm.ownerId} onChange={(e) => setOvForm({ ...ovForm, ownerId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" />
        <input placeholder="Period" value={ovForm.period} onChange={(e) => setOvForm({ ...ovForm, period: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
        <input type="number" placeholder="Override amount" value={ovForm.overrideAmount} onChange={(e) => setOvForm({ ...ovForm, overrideAmount: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" />
        <button type="submit" className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Set Override</button>
      </form>
    </div>
  );
}

const TABS = ['Roll-up & Accuracy', 'Categorize'];

export default function ForecastingPage() {
  const [tab, setTab] = useState('Roll-up & Accuracy');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Sales Forecasting</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Sales forecasting parity — Commit/Best-Case/Pipeline/Omitted categories, manager roll-up by
          quarter with override, forecast accuracy vs actual bookings, and win-rate analysis.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Roll-up & Accuracy' && <RollupTab />}
      {tab === 'Categorize' && <CategorizeTab />}
    </div>
  );
}
