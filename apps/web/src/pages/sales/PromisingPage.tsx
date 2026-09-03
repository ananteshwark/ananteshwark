import { useState, useEffect } from 'react';
import { salesApi } from '../../api/sales';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const SOURCE_TYPES = ['ORGANIZATION', 'VENDOR', 'MAKE'];

export default function PromisingPage() {
  const [tab, setTab] = useState<'promise' | 'rules'>('promise');
  const [promiseForm, setPromiseForm] = useState({ itemId: '', itemCode: '', quantity: 100, requiredDate: '' });
  const [result, setResult] = useState<any>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [ruleForm, setRuleForm] = useState({ itemId: '', sourceType: 'VENDOR', rank: 1, allocationPct: 100, leadTimeDays: 0 });

  useEffect(() => { if (tab === 'rules') loadRules(); }, [tab]);
  async function loadRules() { setRules(unwrap(await salesApi.listSourcingRules())); }

  async function runPromise() {
    if (!promiseForm.itemId) return;
    try {
      const res = await salesApi.orderPromise({ ...promiseForm, requiredDate: promiseForm.requiredDate || undefined, itemCode: promiseForm.itemCode || undefined });
      setResult(res.data?.data ?? res.data);
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function createRule(e: React.FormEvent) {
    e.preventDefault();
    await salesApi.createSourcingRule(ruleForm);
    setRuleForm({ itemId: '', sourceType: 'VENDOR', rank: 1, allocationPct: 100, leadTimeDays: 0 });
    loadRules();
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Global Order Promising</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle GOP parity — date-based ATP/CTP using on-hand stock plus scheduled PO receipts, with
          ranked multi-source sourcing rules and allocation.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {(['promise', 'rules'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t === 'promise' ? 'Promise (ATP/CTP)' : 'Sourcing Rules'}</button>
        ))}
      </div>

      {tab === 'promise' && (
        <div className="space-y-4">
          <div className="border rounded-lg p-4 bg-gray-50 grid grid-cols-5 gap-3 items-end">
            <div><label className="text-xs text-gray-500">Item ID</label><input value={promiseForm.itemId} onChange={(e) => setPromiseForm({ ...promiseForm, itemId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
            <div><label className="text-xs text-gray-500">Item Code (for PO match)</label><input value={promiseForm.itemCode} onChange={(e) => setPromiseForm({ ...promiseForm, itemCode: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
            <div><label className="text-xs text-gray-500">Quantity</label><input type="number" value={promiseForm.quantity} onChange={(e) => setPromiseForm({ ...promiseForm, quantity: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
            <div><label className="text-xs text-gray-500">Required Date</label><input type="date" value={promiseForm.requiredDate} onChange={(e) => setPromiseForm({ ...promiseForm, requiredDate: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
            <button onClick={runPromise} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Promise</button>
          </div>
          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">On Hand (avail)</p><p className="text-2xl font-bold">{result.onHand}</p></div>
                <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Promise Date</p><p className="text-lg font-bold">{result.promiseDate ?? '—'}</p></div>
                <div className={`border rounded-lg p-3 ${result.canPromiseByRequiredDate ? 'bg-green-50' : 'bg-red-50'}`}><p className="text-xs text-gray-500">By Required Date?</p><p className={`text-lg font-bold ${result.canPromiseByRequiredDate ? 'text-green-600' : 'text-red-600'}`}>{result.canPromiseByRequiredDate ? 'YES' : 'NO'}</p></div>
                <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Shortfall</p><p className={`text-2xl font-bold ${result.shortfall > 0 ? 'text-red-600' : ''}`}>{result.shortfall}</p></div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 text-sm font-medium">Supply Timeline</div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-right">Supply</th><th className="px-3 py-2 text-right">Cumulative</th></tr></thead>
                  <tbody className="divide-y">
                    {result.timeline.map((t: any, i: number) => (
                      <tr key={i} className={t.cumulative >= result.requestedQty ? 'bg-green-50' : ''}>
                        <td className="px-3 py-2">{t.date}</td>
                        <td className="px-3 py-2 text-right">{t.supply}</td>
                        <td className="px-3 py-2 text-right font-medium">{t.cumulative}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'rules' && (
        <div className="space-y-3">
          <form onSubmit={createRule} className="grid grid-cols-6 gap-2 bg-gray-50 p-3 rounded-lg items-end">
            <div className="col-span-2"><label className="text-xs text-gray-500">Item ID</label><input required value={ruleForm.itemId} onChange={(e) => setRuleForm({ ...ruleForm, itemId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
            <div><label className="text-xs text-gray-500">Source</label><select value={ruleForm.sourceType} onChange={(e) => setRuleForm({ ...ruleForm, sourceType: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">{SOURCE_TYPES.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div><label className="text-xs text-gray-500">Rank</label><input type="number" value={ruleForm.rank} onChange={(e) => setRuleForm({ ...ruleForm, rank: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
            <div><label className="text-xs text-gray-500">Alloc %</label><input type="number" value={ruleForm.allocationPct} onChange={(e) => setRuleForm({ ...ruleForm, allocationPct: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
            <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Rule</button>
          </form>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-left">Source</th><th className="px-3 py-2 text-right">Rank</th><th className="px-3 py-2 text-right">Alloc %</th><th className="px-3 py-2 text-right">Lead</th><th className="px-3 py-2" /></tr></thead>
              <tbody className="divide-y">
                {rules.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No sourcing rules.</td></tr> : rules.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{r.itemId?.slice(0, 8)}</td>
                    <td className="px-3 py-2"><span className="text-xs px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">{r.sourceType}</span></td>
                    <td className="px-3 py-2 text-right">{r.rank}</td>
                    <td className="px-3 py-2 text-right">{r.allocationPct}%</td>
                    <td className="px-3 py-2 text-right">{r.leadTimeDays}d</td>
                    <td className="px-3 py-2"><button onClick={() => salesApi.deleteSourcingRule(r.id).then(loadRules)} className="text-red-500 text-xs hover:underline">Del</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
