import { useState } from 'react';
import { evmApi } from '../../api/evm';

const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const idx = (n: any) => (n == null ? '—' : Number(n).toFixed(2));
const idxColor = (n: any) => (n == null ? 'text-gray-400' : Number(n) >= 1 ? 'text-green-600' : 'text-red-600');

function BaselineTab({ projectId }: { projectId: string }) {
  const [lines, setLines] = useState('t1:6000, t2:4000');
  async function create() {
    const parsed = lines.split(',').map((l) => { const [taskId, plannedValue] = l.trim().split(':'); return { taskId, plannedValue: Number(plannedValue) }; });
    try { const r = await evmApi.createBaseline(projectId, { lines: parsed }); const d = r.data?.data ?? r.data; alert(`Baseline v${d.baseline.version} · BAC ${money(d.baseline.bac)}`); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 bg-gray-50 p-3 rounded-lg">
        <div className="flex-1"><label className="text-xs text-gray-500">Baseline lines (task:plannedValue, …)</label><input value={lines} onChange={(e) => setLines(e.target.value)} className="w-full border rounded px-2 py-1 text-sm font-mono text-xs" /></div>
        <button onClick={create} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Establish PMB</button>
      </div>
      <p className="text-xs text-gray-400">The Performance Measurement Baseline (PMB) freezes the budget at completion (BAC) as the sum of task planned values.</p>
    </div>
  );
}

function MetricsTab({ projectId }: { projectId: string }) {
  const [period, setPeriod] = useState('2026-06');
  const [metrics, setMetrics] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [form, setForm] = useState({ taskId: 't1', pctScheduled: 50, pctComplete: 40, actualCost: 500 });

  async function load() {
    try {
      setMetrics((await evmApi.metrics(projectId, period)).data?.data ?? null);
      setTasks((await evmApi.taskMeasurements(projectId, period)).data?.data ?? []);
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function record(e: React.FormEvent) {
    e.preventDefault();
    try { await evmApi.measure(projectId, { ...form, period }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div><label className="text-xs text-gray-500">Period</label><input value={period} onChange={(e) => setPeriod(e.target.value)} className="w-28 border rounded px-2 py-1 text-sm" /></div>
        <button onClick={load} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Load Metrics</button>
      </div>
      <form onSubmit={record} className="grid grid-cols-5 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="Task ID" value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono" />
        <div><label className="text-xs text-gray-500">% Scheduled</label><input type="number" value={form.pctScheduled} onChange={(e) => setForm({ ...form, pctScheduled: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">% Complete</label><input type="number" value={form.pctComplete} onChange={(e) => setForm({ ...form, pctComplete: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Actual Cost</label><input type="number" value={form.actualCost} onChange={(e) => setForm({ ...form, actualCost: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <button type="submit" className="bg-gray-700 text-white px-2 py-1 rounded text-sm">Record</button>
      </form>
      {metrics && (
        <>
          <div className="grid grid-cols-6 gap-2">
            {[['PV', metrics.pv], ['EV', metrics.ev], ['AC', metrics.ac], ['BAC', metrics.bac], ['EAC', metrics.eac], ['VAC', metrics.vac]].map(([k, v]) => (
              <div key={k as string} className="border rounded-lg p-2"><p className="text-xs text-gray-500">{k}</p><p className="text-sm font-bold">{money(v)}</p></div>
            ))}
          </div>
          <div className="flex gap-6 text-sm">
            <span>SPI: <strong className={idxColor(metrics.spi)}>{idx(metrics.spi)}</strong></span>
            <span>CPI: <strong className={idxColor(metrics.cpi)}>{idx(metrics.cpi)}</strong></span>
            <span>SV: <strong className={metrics.scheduleVariance >= 0 ? 'text-green-600' : 'text-red-600'}>{money(metrics.scheduleVariance)}</strong></span>
            <span>CV: <strong className={metrics.costVariance >= 0 ? 'text-green-600' : 'text-red-600'}>{money(metrics.costVariance)}</strong></span>
            <span>% Complete: <strong>{metrics.pctComplete}%</strong></span>
          </div>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Task</th><th className="px-3 py-2 text-right">PV</th><th className="px-3 py-2 text-right">EV</th><th className="px-3 py-2 text-right">AC</th><th className="px-3 py-2 text-right">SPI</th><th className="px-3 py-2 text-right">CPI</th></tr></thead>
            <tbody className="divide-y">
              {tasks.map((t) => (
                <tr key={t.id}><td className="px-3 py-2 font-mono text-xs">{t.taskId}</td><td className="px-3 py-2 text-right">{money(t.plannedValue)}</td><td className="px-3 py-2 text-right">{money(t.earnedValue)}</td><td className="px-3 py-2 text-right">{money(t.actualCost)}</td><td className={`px-3 py-2 text-right ${idxColor(t.spi)}`}>{idx(t.spi)}</td><td className={`px-3 py-2 text-right ${idxColor(t.cpi)}`}>{idx(t.cpi)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function SCurveTab({ projectId }: { projectId: string }) {
  const [data, setData] = useState<any>(null);
  async function load() { try { const r = await evmApi.sCurve(projectId); setData(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  return (
    <div className="space-y-3">
      <button onClick={load} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Load S-Curve</button>
      {data && (
        <>
          <div className="flex gap-6 text-sm">
            <span>BAC: <strong>{money(data.bac)}</strong></span>
            <span>Latest CPI: <strong className={idxColor(data.latestCpi)}>{idx(data.latestCpi)}</strong></span>
            <span>Forecast at Completion: <strong>{money(data.forecastAtCompletion)}</strong></span>
          </div>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Period</th><th className="px-3 py-2 text-right">Cum PV</th><th className="px-3 py-2 text-right">Cum EV</th><th className="px-3 py-2 text-right">Cum AC</th><th className="px-3 py-2 text-right">SV</th><th className="px-3 py-2 text-right">CV</th></tr></thead>
            <tbody className="divide-y">
              {(data.series ?? []).length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No measurements yet.</td></tr> : data.series.map((s: any) => (
                <tr key={s.period}><td className="px-3 py-2">{s.period}</td><td className="px-3 py-2 text-right">{money(s.cumulativePV)}</td><td className="px-3 py-2 text-right">{money(s.cumulativeEV)}</td><td className="px-3 py-2 text-right">{money(s.cumulativeAC)}</td><td className={`px-3 py-2 text-right ${s.scheduleVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{money(s.scheduleVariance)}</td><td className={`px-3 py-2 text-right ${s.costVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{money(s.costVariance)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

const TABS = ['Baseline (PMB)', 'Metrics', 'S-Curve'];

export default function EvmPage() {
  const [tab, setTab] = useState('Baseline (PMB)');
  const [projectId, setProjectId] = useState('');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Earned Value Management</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Project Performance Reporting parity — establish a PMB baseline, compute PV/EV/AC with SPI/CPI
          per task and project, forecast EAC/VAC, and view the cumulative S-curve with forecast-at-completion.
        </p>
      </div>
      <div><label className="text-xs text-gray-500">Project ID</label><input value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-80 border rounded px-2 py-1 text-sm font-mono" placeholder="project uuid" /></div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {!projectId ? <p className="text-sm text-gray-400">Enter a project ID to begin.</p> : (
        <>
          {tab === 'Baseline (PMB)' && <BaselineTab projectId={projectId} />}
          {tab === 'Metrics' && <MetricsTab projectId={projectId} />}
          {tab === 'S-Curve' && <SCurveTab projectId={projectId} />}
        </>
      )}
    </div>
  );
}
