import { useState, useEffect } from 'react';
import { biApi } from '../../api/bi';
import { predictiveApi } from '../../api/predictive';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

const SAMPLE = JSON.stringify([
  { account: 'Sales', costCenter: 'CC1', period: '2026-06', amount: 5000 },
  { account: 'Sales', costCenter: 'CC2', period: '2026-06', amount: 3000 },
  { account: 'COGS', costCenter: 'CC1', period: '2026-06', amount: 2000 },
], null, 0);

function BuilderTab() {
  const [areas, setAreas] = useState<any[]>([]);
  const [areaCode, setAreaCode] = useState('');
  const [dims, setDims] = useState<string[]>([]);
  const [measures, setMeasures] = useState<{ key: string; agg: string }[]>([]);
  const [rowsJson, setRowsJson] = useState(SAMPLE);
  const [result, setResult] = useState<any>(null);
  const [reportName, setReportName] = useState('');

  useEffect(() => { biApi.listSubjectAreas().then((r) => setAreas(unwrap(r))); }, []);
  const area = areas.find((a) => a.code === areaCode);
  async function seed() { try { await biApi.seed(); setAreas(unwrap(await biApi.listSubjectAreas())); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  function toggleDim(k: string) { setDims(dims.includes(k) ? dims.filter((d) => d !== k) : [...dims, k]); }
  function toggleMeasure(k: string, agg: string) { setMeasures(measures.some((m) => m.key === k) ? measures.filter((m) => m.key !== k) : [...measures, { key: k, agg }]); }
  async function preview() {
    let rows: any[] = [];
    try { rows = JSON.parse(rowsJson); } catch { alert('Invalid JSON rows'); return; }
    try { const r = await biApi.preview({ dimensions: dims, measures }, rows); setResult(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function save() {
    if (!reportName || !areaCode) return;
    try { await biApi.createReport({ name: reportName, subjectAreaCode: areaCode, dimensions: dims, measures, visibility: 'SHARED' }); alert('Report saved'); setReportName(''); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-3">
      {areas.length === 0 && <button onClick={seed} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Seed Subject Areas</button>}
      <div className="flex items-end gap-2">
        <div><label className="text-xs text-gray-500">Subject Area</label><select value={areaCode} onChange={(e) => { setAreaCode(e.target.value); setDims([]); setMeasures([]); }} className="w-64 border rounded px-2 py-1 text-sm"><option value="">— select —</option>{areas.map((a) => <option key={a.code} value={a.code}>{a.pillar} · {a.name}</option>)}</select></div>
      </div>
      {area && (
        <div className="grid grid-cols-2 gap-4">
          <div className="border rounded-lg p-3">
            <p className="text-sm font-semibold mb-1">Dimensions</p>
            {area.dimensions.map((d: any) => <label key={d.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={dims.includes(d.key)} onChange={() => toggleDim(d.key)} /> {d.label}</label>)}
          </div>
          <div className="border rounded-lg p-3">
            <p className="text-sm font-semibold mb-1">Measures</p>
            {area.measures.map((m: any) => <label key={m.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={measures.some((x) => x.key === m.key)} onChange={() => toggleMeasure(m.key, m.defaultAgg)} /> {m.label} <span className="text-xs text-gray-400">({m.defaultAgg})</span></label>)}
          </div>
        </div>
      )}
      {area && (
        <>
          <div><label className="text-xs text-gray-500">Sample data (JSON rows)</label><textarea value={rowsJson} onChange={(e) => setRowsJson(e.target.value)} className="w-full border rounded px-2 py-1 text-xs font-mono" rows={3} /></div>
          <div className="flex items-end gap-2">
            <button onClick={preview} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Run Preview</button>
            <input placeholder="Report name" value={reportName} onChange={(e) => setReportName(e.target.value)} className="border rounded px-2 py-1 text-sm" />
            <button onClick={save} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Save (shared)</button>
          </div>
        </>
      )}
      {result && (
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-50"><tr>{Object.keys(result.rows[0] ?? {}).map((k) => <th key={k} className="px-3 py-2 text-left">{k}</th>)}</tr></thead>
          <tbody className="divide-y">
            {result.rows.map((row: any, i: number) => <tr key={i}>{Object.keys(result.rows[0] ?? {}).map((k) => <td key={k} className="px-3 py-2">{String(row[k])}</td>)}</tr>)}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TilesTab() {
  const [tiles, setTiles] = useState<any[]>([]);
  const [computed, setComputed] = useState<Record<string, any>>({});
  const [form, setForm] = useState({ title: '', measure: 'value', agg: 'SUM', target: 0 });
  useEffect(() => { load(); }, []);
  async function load() { setTiles(unwrap(await biApi.listTiles())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await biApi.createTile({ ...form, subjectAreaCode: 'CRM_PIPE' }); setForm({ title: '', measure: 'value', agg: 'SUM', target: 0 }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function compute(id: string) {
    const rows = [{ value: 600 }, { value: 500 }];
    try { const r = await biApi.computeTile(id, rows); setComputed({ ...computed, [id]: r.data?.data ?? r.data }); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Measure" value={form.measure} onChange={(e) => setForm({ ...form, measure: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input type="number" placeholder="Target" value={form.target} onChange={(e) => setForm({ ...form, target: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" />
        <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">+ KPI Tile</button>
      </form>
      <div className="grid grid-cols-4 gap-3">
        {tiles.length === 0 ? <p className="text-sm text-gray-400 col-span-4">No tiles.</p> : tiles.map((t) => {
          const c = computed[t.id];
          return (
            <div key={t.id} className="border rounded-lg p-3 cursor-pointer" onClick={() => compute(t.id)}>
              <p className="text-xs text-gray-500">{t.title}</p>
              <p className="text-2xl font-bold">{c ? c.value : '—'}</p>
              {c && c.status !== 'NONE' && <p className={`text-xs ${c.status === 'ON_TARGET' ? 'text-green-600' : 'text-red-600'}`}>{c.attainmentPct}% of {c.target}</p>}
              {!c && <p className="text-xs text-gray-400">click to compute</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const BAND: Record<string, string> = { LOW: 'bg-green-100 text-green-700', MEDIUM: 'bg-amber-100 text-amber-700', HIGH: 'bg-red-100 text-red-700' };

function PredictiveTab() {
  const [churn, setChurn] = useState({ customerId: 'CUST-1', daysSinceLastOrder: 200, openSupportTickets: 4, npsScore: 3, contractDaysToExpiry: 20 });
  const [churnResult, setChurnResult] = useState<any>(null);
  const [series, setSeries] = useState('100:120, 100:80, 100:110');
  const [demand, setDemand] = useState<any>(null);

  async function runChurn() {
    try {
      const r = await predictiveApi.churn(churn.customerId, { daysSinceLastOrder: churn.daysSinceLastOrder, openSupportTickets: churn.openSupportTickets, npsScore: churn.npsScore, contractDaysToExpiry: churn.contractDaysToExpiry });
      setChurnResult(r.data?.data ?? r.data);
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function runDemand() {
    const parsed = series.split(',').map((p) => { const [forecast, actual] = p.trim().split(':').map(Number); return { forecast, actual }; });
    try { const r = await predictiveApi.demandAccuracy(parsed); setDemand(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="border rounded-lg p-4 space-y-2">
        <h3 className="text-sm font-semibold">Customer Churn Risk</h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-gray-500">Days since last order<input type="number" value={churn.daysSinceLastOrder} onChange={(e) => setChurn({ ...churn, daysSinceLastOrder: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></label>
          <label className="text-xs text-gray-500">Open tickets<input type="number" value={churn.openSupportTickets} onChange={(e) => setChurn({ ...churn, openSupportTickets: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></label>
          <label className="text-xs text-gray-500">NPS (0-10)<input type="number" value={churn.npsScore} onChange={(e) => setChurn({ ...churn, npsScore: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></label>
          <label className="text-xs text-gray-500">Contract days to expiry<input type="number" value={churn.contractDaysToExpiry} onChange={(e) => setChurn({ ...churn, contractDaysToExpiry: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></label>
        </div>
        <button onClick={runChurn} className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Score Churn</button>
        {churnResult && (
          <div className="text-center pt-2">
            <p className="text-3xl font-bold">{churnResult.score}</p>
            <span className={`text-xs px-2 py-1 rounded ${BAND[churnResult.band]}`}>{churnResult.band} RISK</span>
            <ul className="text-xs text-gray-500 mt-2 text-left">{(churnResult.factors ?? []).map((f: any) => <li key={f.factor}>{f.factor}: +{f.contribution}</li>)}</ul>
          </div>
        )}
      </div>
      <div className="border rounded-lg p-4 space-y-2">
        <h3 className="text-sm font-semibold">Demand Forecast Accuracy</h3>
        <label className="text-xs text-gray-500">Series (forecast:actual, …)<input value={series} onChange={(e) => setSeries(e.target.value)} className="w-full border rounded px-2 py-1 text-sm font-mono text-xs" /></label>
        <button onClick={runDemand} className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Compute Accuracy</button>
        {demand && (
          <div className="grid grid-cols-3 gap-2 pt-2">
            <div className="border rounded p-2 text-center"><p className="text-xs text-gray-500">MAPE</p><p className="text-lg font-bold">{demand.mape}%</p></div>
            <div className="border rounded p-2 text-center"><p className="text-xs text-gray-500">Accuracy</p><p className="text-lg font-bold">{demand.accuracyPct}%</p></div>
            <div className="border rounded p-2 text-center"><p className="text-xs text-gray-500">Bias</p><p className="text-sm font-bold">{demand.bias}</p><p className="text-[10px] text-gray-400">{demand.biasDirection}</p></div>
          </div>
        )}
      </div>
    </div>
  );
}

const TABS = ['Report Builder', 'KPI Tiles', 'Predictive'];

export default function BiPage() {
  const [tab, setTab] = useState('Report Builder');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Analytics & BI</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle OTBI parity — dimensional subject areas per pillar, a drag-and-select report builder (dimensions,
          measures, filters, sort) with save/share and preview, scheduled delivery, and KPI tiles with targets.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Report Builder' && <BuilderTab />}
      {tab === 'KPI Tiles' && <TilesTab />}
      {tab === 'Predictive' && <PredictiveTab />}
    </div>
  );
}
