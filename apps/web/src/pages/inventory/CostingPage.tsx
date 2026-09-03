import { useState, useEffect } from 'react';
import { inventoryApi } from '../../api/inventory';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const VAR_STYLES: Record<string, string> = {
  PPV: 'bg-orange-100 text-orange-700', MUV: 'bg-blue-100 text-blue-700',
  LRV: 'bg-purple-100 text-purple-700', SUV: 'bg-pink-100 text-pink-700', REVALUATION: 'bg-green-100 text-green-700',
};

function StandardCostTab() {
  const [costs, setCosts] = useState<any[]>([]);
  const [form, setForm] = useState({ itemId: '', standardCost: 0, effectiveFrom: new Date().toISOString().slice(0, 10) });
  const [wac, setWac] = useState({ currentQty: 10, currentAvg: 5, receiptQty: 10, receiptUnitCost: 7 });
  const [wacResult, setWacResult] = useState<any>(null);

  useEffect(() => { load(); }, []);
  async function load() { setCosts(unwrap(await inventoryApi.listStandardCosts())); }
  async function set(e: React.FormEvent) {
    e.preventDefault();
    await inventoryApi.setStandardCost(form);
    setForm({ itemId: '', standardCost: 0, effectiveFrom: new Date().toISOString().slice(0, 10) });
    load();
  }
  async function preview() {
    const res = await inventoryApi.wacPreview(wac);
    setWacResult(res.data?.data ?? res.data);
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-gray-50">
        <h3 className="font-medium text-sm mb-2">Weighted Average Cost preview</h3>
        <div className="flex gap-2 items-end flex-wrap">
          <div><label className="text-xs text-gray-500">On-hand Qty</label><input type="number" value={wac.currentQty} onChange={(e) => setWac({ ...wac, currentQty: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm w-24" /></div>
          <div><label className="text-xs text-gray-500">Current Avg</label><input type="number" value={wac.currentAvg} onChange={(e) => setWac({ ...wac, currentAvg: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm w-24" /></div>
          <div><label className="text-xs text-gray-500">Receipt Qty</label><input type="number" value={wac.receiptQty} onChange={(e) => setWac({ ...wac, receiptQty: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm w-24" /></div>
          <div><label className="text-xs text-gray-500">Receipt Cost</label><input type="number" value={wac.receiptUnitCost} onChange={(e) => setWac({ ...wac, receiptUnitCost: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm w-24" /></div>
          <button onClick={preview} className="bg-gray-200 px-3 py-1 rounded text-sm">Compute</button>
          {wacResult && <span className="text-sm self-center">→ <b>{wacResult.newQty}</b> @ <b>{money(wacResult.newAvgCost)}</b> = {money(wacResult.newTotalValue)}</span>}
        </div>
      </div>

      <form onSubmit={set} className="flex gap-2 items-end bg-gray-50 p-3 rounded-lg">
        <div className="flex-1"><label className="text-xs text-gray-500">Item ID</label><input required value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Standard Cost</label><input type="number" required value={form.standardCost} onChange={(e) => setForm({ ...form, standardCost: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Effective From</label><input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} className="border rounded px-2 py-1 text-sm" /></div>
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Set</button>
      </form>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Standard Cost</th><th className="px-3 py-2 text-left">Effective From</th></tr></thead>
          <tbody className="divide-y">
            {costs.length === 0 ? <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-400">No standard costs.</td></tr> : costs.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50"><td className="px-3 py-2 font-mono text-xs">{c.itemId?.slice(0, 8)}</td><td className="px-3 py-2 text-right">{money(c.standardCost)}</td><td className="px-3 py-2">{c.effectiveFrom}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CostUpdateTab() {
  const [updates, setUpdates] = useState<any[]>([]);
  const [form, setForm] = useState({ itemId: '', newStandard: 0, effectiveDate: new Date().toISOString().slice(0, 10) });

  useEffect(() => { load(); }, []);
  async function load() { setUpdates(unwrap(await inventoryApi.listCostUpdates())); }
  async function run(e: React.FormEvent) {
    e.preventDefault();
    try {
      await inventoryApi.runCostUpdate(form);
      setForm({ itemId: '', newStandard: 0, effectiveDate: new Date().toISOString().slice(0, 10) });
      load();
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={run} className="flex gap-2 items-end bg-gray-50 p-3 rounded-lg">
        <div className="flex-1"><label className="text-xs text-gray-500">Item ID</label><input required value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">New Standard</label><input type="number" required value={form.newStandard} onChange={(e) => setForm({ ...form, newStandard: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Effective</label><input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} className="border rounded px-2 py-1 text-sm" /></div>
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Run Update</button>
      </form>
      <p className="text-xs text-gray-500">Revaluation = (new − old standard) × on-hand qty, posted to GL automatically.</p>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Old</th><th className="px-3 py-2 text-right">New</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Revaluation</th><th className="px-3 py-2 text-left">Status</th></tr></thead>
          <tbody className="divide-y">
            {updates.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No cost updates.</td></tr> : updates.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{u.itemId?.slice(0, 8)}</td>
                <td className="px-3 py-2 text-right">{money(u.oldStandard)}</td>
                <td className="px-3 py-2 text-right">{money(u.newStandard)}</td>
                <td className="px-3 py-2 text-right">{u.qtyOnHand}</td>
                <td className={`px-3 py-2 text-right font-medium ${u.revaluationAmount < 0 ? 'text-red-600' : 'text-green-600'}`}>{money(u.revaluationAmount)}</td>
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${u.status === 'POSTED' ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>{u.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VarianceTab() {
  const [dash, setDash] = useState<any>(null);
  const [variances, setVariances] = useState<any[]>([]);
  const [ppvForm, setPpvForm] = useState({ itemId: '', quantity: 0, actualUnitCost: 0, date: new Date().toISOString().slice(0, 10) });

  useEffect(() => { load(); }, []);
  async function load() {
    const d = await inventoryApi.costVarianceDashboard();
    setDash(d.data?.data ?? d.data);
    setVariances(unwrap(await inventoryApi.listCostVariances()));
  }
  async function recordPpv(e: React.FormEvent) {
    e.preventDefault();
    await inventoryApi.recordPpv(ppvForm);
    setPpvForm({ itemId: '', quantity: 0, actualUnitCost: 0, date: new Date().toISOString().slice(0, 10) });
    load();
  }

  return (
    <div className="space-y-4">
      {dash && (
        <div className="grid grid-cols-4 gap-3">
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Total Variance</p><p className={`text-2xl font-bold ${dash.totalVariance < 0 ? 'text-red-600' : 'text-green-600'}`}>{money(dash.totalVariance)}</p></div>
          <div className="border rounded-lg p-3 col-span-3"><p className="text-xs text-gray-500 mb-1">By Type</p><div className="flex gap-3 flex-wrap">{dash.byType.map((t: any) => <span key={t.varianceType} className={`text-xs px-2 py-1 rounded ${VAR_STYLES[t.varianceType]}`}>{t.varianceType}: {money(t.amount)}</span>)}</div></div>
        </div>
      )}
      <form onSubmit={recordPpv} className="flex gap-2 items-end bg-gray-50 p-3 rounded-lg">
        <div className="flex-1"><label className="text-xs text-gray-500">Item ID (PPV)</label><input required value={ppvForm.itemId} onChange={(e) => setPpvForm({ ...ppvForm, itemId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Qty</label><input type="number" required value={ppvForm.quantity || ''} onChange={(e) => setPpvForm({ ...ppvForm, quantity: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm w-24" /></div>
        <div><label className="text-xs text-gray-500">Actual Cost</label><input type="number" required value={ppvForm.actualUnitCost || ''} onChange={(e) => setPpvForm({ ...ppvForm, actualUnitCost: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm w-28" /></div>
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Record PPV</button>
      </form>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Std</th><th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Variance</th><th className="px-3 py-2 text-left">Date</th></tr></thead>
          <tbody className="divide-y">
            {variances.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No variances.</td></tr> : variances.map((v) => (
              <tr key={v.id} className="hover:bg-gray-50">
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${VAR_STYLES[v.varianceType]}`}>{v.varianceType}</span></td>
                <td className="px-3 py-2 font-mono text-xs">{v.itemId?.slice(0, 8)}</td>
                <td className="px-3 py-2 text-right">{money(v.standardCost)}</td>
                <td className="px-3 py-2 text-right">{money(v.actualCost)}</td>
                <td className="px-3 py-2 text-right">{v.quantity}</td>
                <td className={`px-3 py-2 text-right font-medium ${v.varianceAmount < 0 ? 'text-red-600' : 'text-green-600'}`}>{money(v.varianceAmount)}</td>
                <td className="px-3 py-2 text-xs">{v.varianceDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TABS = ['Standard Cost & WAC', 'Cost Update', 'Variance Analysis'];

export default function CostingPage() {
  const [tab, setTab] = useState('Standard Cost & WAC');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Cost Accounting</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Cost Management parity — weighted-average cost roll, standard cost with effective dates,
          purchase price variance, period-end cost update revaluation (auto-posts JE), and variance analysis.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Standard Cost & WAC' && <StandardCostTab />}
      {tab === 'Cost Update' && <CostUpdateTab />}
      {tab === 'Variance Analysis' && <VarianceTab />}
    </div>
  );
}
