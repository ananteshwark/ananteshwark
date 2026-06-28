import { useState, useEffect } from 'react';
import { opmApi } from '../../api/opm';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

const BATCH_STATUS: Record<string, string> = {
  PLANNED: 'bg-gray-100 text-gray-600', IN_PROGRESS: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-cyan-100 text-cyan-700', LAB_HOLD: 'bg-yellow-100 text-yellow-700',
  RELEASED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700', CANCELLED: 'bg-gray-100 text-gray-400',
};
const LINE_TYPES = ['INGREDIENT', 'COPRODUCT', 'BYPRODUCT'];

function FormulasTab() {
  const [formulas, setFormulas] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState({ code: '', name: '', productItemId: '', outputQuantity: 100, outputUom: 'KG', yieldPct: 100 });
  const [detail, setDetail] = useState({ lineType: 'INGREDIENT', itemId: '', quantity: 0, uom: 'KG', scrapPct: 0 });

  useEffect(() => { load(); }, []);
  async function load() { setFormulas(unwrap(await opmApi.listFormulas())); }
  async function open(id: string) { const r = await opmApi.getFormula(id); setSelected(r.data?.data ?? r.data); }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await opmApi.createFormula(form); setForm({ code: '', name: '', productItemId: '', outputQuantity: 100, outputUom: 'KG', yieldPct: 100 }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function addDetail(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    await opmApi.addDetail(selected.formula.id, detail);
    setDetail({ lineType: 'INGREDIENT', itemId: '', quantity: 0, uom: 'KG', scrapPct: 0 });
    open(selected.formula.id);
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-3">
        <form onSubmit={create} className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-lg items-end">
          <div><label className="text-xs text-gray-500">Code</label><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Product Item ID</label><input required value={form.productItemId} onChange={(e) => setForm({ ...form, productItemId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
          <div><label className="text-xs text-gray-500">Output Qty</label><input type="number" value={form.outputQuantity} onChange={(e) => setForm({ ...form, outputQuantity: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Yield %</label><input type="number" value={form.yieldPct} onChange={(e) => setForm({ ...form, yieldPct: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Formula</button>
        </form>
        <div className="border rounded-lg divide-y">
          {formulas.length === 0 ? <p className="p-3 text-gray-400 text-sm">No formulas.</p> : formulas.map((f) => (
            <div key={f.id} onClick={() => open(f.id)} className={`p-2 cursor-pointer hover:bg-gray-50 flex justify-between ${selected?.formula?.id === f.id ? 'bg-indigo-50' : ''}`}>
              <span className="text-sm"><span className="font-mono text-xs">{f.code}</span> {f.name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${f.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>{f.status}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="border rounded-lg p-3">
        {!selected ? <p className="text-gray-400 text-sm">Select a formula to manage its lines.</p> : (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="font-medium">{selected.formula.name}</h3>
              {selected.formula.status !== 'APPROVED' && <button onClick={async () => { try { await opmApi.approveFormula(selected.formula.id); open(selected.formula.id); load(); } catch (e: any) { alert(e.response?.data?.message ?? 'Failed'); } }} className="text-green-600 text-sm hover:underline">Approve</button>}
            </div>
            <table className="w-full text-sm border rounded overflow-hidden">
              <thead className="bg-gray-50"><tr><th className="px-2 py-1 text-left">Type</th><th className="px-2 py-1 text-left">Item</th><th className="px-2 py-1 text-right">Qty</th><th className="px-2 py-1 text-right">Scrap</th></tr></thead>
              <tbody className="divide-y">
                {(selected.details ?? []).map((d: any) => (
                  <tr key={d.id}><td className="px-2 py-1 text-xs">{d.lineType}</td><td className="px-2 py-1 font-mono text-xs">{d.itemId?.slice(0, 8)}</td><td className="px-2 py-1 text-right">{d.quantity} {d.uom}</td><td className="px-2 py-1 text-right">{d.scrapPct}%</td></tr>
                ))}
              </tbody>
            </table>
            <form onSubmit={addDetail} className="grid grid-cols-4 gap-1">
              <select value={detail.lineType} onChange={(e) => setDetail({ ...detail, lineType: e.target.value })} className="border rounded px-2 py-1 text-xs">{LINE_TYPES.map((t) => <option key={t}>{t}</option>)}</select>
              <input required placeholder="item ID" value={detail.itemId} onChange={(e) => setDetail({ ...detail, itemId: e.target.value })} className="border rounded px-2 py-1 text-xs font-mono" />
              <input type="number" placeholder="qty" value={detail.quantity || ''} onChange={(e) => setDetail({ ...detail, quantity: Number(e.target.value) })} className="border rounded px-2 py-1 text-xs" />
              <button type="submit" className="bg-gray-600 text-white px-2 py-1 rounded text-xs">+ Line</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function BatchesTab() {
  const [batches, setBatches] = useState<any[]>([]);
  const [formulas, setFormulas] = useState<any[]>([]);
  const [form, setForm] = useState({ formulaId: '', targetOutput: 0 });

  useEffect(() => { load(); opmApi.listFormulas().then((r) => setFormulas(unwrap(r).filter((f: any) => f.status === 'APPROVED'))); }, []);
  async function load() { setBatches(unwrap(await opmApi.listBatches())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await opmApi.createBatch(form); setForm({ formulaId: '', targetOutput: 0 }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function act(id: string, action: string) {
    try {
      if (action === 'start') await opmApi.startBatch(id);
      else if (action === 'complete') { const out = prompt('Actual output:'); if (!out) return; await opmApi.completeBatch(id, { actualOutput: Number(out) }); }
      else if (action === 'pass') await opmApi.labResult(id, { result: 'PASS' });
      else if (action === 'fail') await opmApi.labResult(id, { result: 'FAIL', note: prompt('Reason:') || '' });
      load();
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={create} className="flex gap-2 items-end bg-gray-50 p-3 rounded-lg">
        <div className="flex-1"><label className="text-xs text-gray-500">Formula (approved)</label><select required value={form.formulaId} onChange={(e) => setForm({ ...form, formulaId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm"><option value="">Select…</option>{formulas.map((f) => <option key={f.id} value={f.id}>{f.code} — {f.name}</option>)}</select></div>
        <div><label className="text-xs text-gray-500">Target Output</label><input type="number" required value={form.targetOutput || ''} onChange={(e) => setForm({ ...form, targetOutput: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm w-32" /></div>
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Create Batch</button>
      </form>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Batch</th><th className="px-3 py-2 text-right">Target</th><th className="px-3 py-2 text-right">Scale</th><th className="px-3 py-2 text-left">Lab</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">
            {batches.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No batches.</td></tr> : batches.map((b) => (
              <tr key={b.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{b.batchNumber}</td>
                <td className="px-3 py-2 text-right">{b.targetOutput}</td>
                <td className="px-3 py-2 text-right">{b.scaleFactor}×</td>
                <td className="px-3 py-2 text-xs">{b.labResult ?? '—'}</td>
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${BATCH_STATUS[b.status]}`}>{b.status}</span></td>
                <td className="px-3 py-2"><div className="flex gap-2">
                  {b.status === 'PLANNED' && <button onClick={() => act(b.id, 'start')} className="text-blue-600 text-xs hover:underline">start</button>}
                  {b.status === 'IN_PROGRESS' && <button onClick={() => act(b.id, 'complete')} className="text-cyan-600 text-xs hover:underline">complete</button>}
                  {b.status === 'LAB_HOLD' && <><button onClick={() => act(b.id, 'pass')} className="text-green-600 text-xs hover:underline">lab pass</button><button onClick={() => act(b.id, 'fail')} className="text-red-500 text-xs hover:underline">fail</button></>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TABS = ['Formulas / Recipes', 'Batches'];

export default function ProcessMfgPage() {
  const [tab, setTab] = useState('Formulas / Recipes');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Process Manufacturing</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle OPM parity — formula/recipe management with ingredients & co-/by-products, quantity-scaled
          batches (yield + scrap), and a lab-release gate before stock.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Formulas / Recipes' && <FormulasTab />}
      {tab === 'Batches' && <BatchesTab />}
    </div>
  );
}
