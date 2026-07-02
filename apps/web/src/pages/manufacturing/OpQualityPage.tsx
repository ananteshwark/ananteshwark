import { useState, useEffect } from 'react';
import { opQualityApi } from '../../api/opQuality';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

function PlansTab() {
  const [opId, setOpId] = useState('');
  const [plans, setPlans] = useState<any[]>([]);
  const emptyForm = { characteristicName: '', specMin: '', specMax: '', uom: '', isRequired: true, blockOnFail: true };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    if (!opId) return;
    setPlans(unwrap(await opQualityApi.listPlans(opId)));
  }
  useEffect(() => { if (opId) load(); }, [opId]);

  function editPlan(p: any) {
    setEditingId(p.id);
    setForm({ characteristicName: p.characteristicName ?? '', specMin: p.specMin != null ? String(p.specMin) : '', specMax: p.specMax != null ? String(p.specMax) : '', uom: p.uom ?? '', isRequired: !!p.isRequired, blockOnFail: !!p.blockOnFail });
  }
  function cancelEdit() { setEditingId(null); setForm(emptyForm); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const payload = { routingOperationId: opId, characteristicName: form.characteristicName, specMin: form.specMin ? Number(form.specMin) : undefined, specMax: form.specMax ? Number(form.specMax) : undefined, uom: form.uom || undefined, isRequired: form.isRequired, blockOnFail: form.blockOnFail };
    try {
      if (editingId) await opQualityApi.updatePlan(editingId, payload);
      else await opQualityApi.createPlan(payload);
      cancelEdit(); load();
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <label className="text-sm text-gray-600">Routing Operation ID:</label>
        <input value={opId} onChange={(e) => setOpId(e.target.value)} className="border rounded px-2 py-1 text-sm font-mono w-80" />
        <button onClick={load} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Load</button>
      </div>
      {opId && (
        <form onSubmit={create} className="grid grid-cols-6 gap-2 bg-gray-50 p-3 rounded-lg items-end">
          <div className="col-span-2"><label className="text-xs text-gray-500">Characteristic</label><input required value={form.characteristicName} onChange={(e) => setForm({ ...form, characteristicName: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Spec Min</label><input type="number" value={form.specMin} onChange={(e) => setForm({ ...form, specMin: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Spec Max</label><input type="number" value={form.specMax} onChange={(e) => setForm({ ...form, specMax: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={form.blockOnFail} onChange={(e) => setForm({ ...form, blockOnFail: e.target.checked })} /> Block</label>
          <div className="flex gap-1">
            <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">{editingId ? 'Save' : '+ Plan'}</button>
            {editingId && <button type="button" onClick={cancelEdit} className="border px-3 py-1.5 rounded text-sm">Cancel</button>}
          </div>
        </form>
      )}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Characteristic</th><th className="px-3 py-2 text-right">Min</th><th className="px-3 py-2 text-right">Max</th><th className="px-3 py-2 text-left">Required</th><th className="px-3 py-2 text-left">Block</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">
            {plans.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">{opId ? 'No plans for this operation.' : 'Enter an operation ID.'}</td></tr> : plans.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2 font-medium">{p.characteristicName}</td>
                <td className="px-3 py-2 text-right">{p.specMin ?? '—'}</td>
                <td className="px-3 py-2 text-right">{p.specMax ?? '—'}</td>
                <td className="px-3 py-2">{p.isRequired ? '✓' : '—'}</td>
                <td className="px-3 py-2">{p.blockOnFail ? '🔒' : '—'}</td>
                <td className="px-3 py-2 space-x-2 text-right"><button onClick={() => editPlan(p)} className="text-indigo-600 text-xs hover:underline">Edit</button><button onClick={async () => { await opQualityApi.deletePlan(p.id); load(); }} className="text-red-500 text-xs hover:underline">Del</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CollectTab() {
  const [form, setForm] = useState({ productionOrderId: '', routingOperationId: '', workCenterId: '', char: '', value: '' });
  const [result, setResult] = useState<any>(null);

  async function collect() {
    if (!form.productionOrderId || !form.routingOperationId || !form.char) return;
    try {
      const res = await opQualityApi.collect({
        productionOrderId: form.productionOrderId, routingOperationId: form.routingOperationId, workCenterId: form.workCenterId || undefined,
        measurements: [{ characteristicName: form.char, measuredValue: form.value ? Number(form.value) : null }],
      });
      setResult(res.data?.data ?? res.data);
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-gray-50 grid grid-cols-5 gap-2 items-end">
        <div><label className="text-xs text-gray-500">Prod Order ID</label><input value={form.productionOrderId} onChange={(e) => setForm({ ...form, productionOrderId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Operation ID</label><input value={form.routingOperationId} onChange={(e) => setForm({ ...form, routingOperationId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Characteristic</label><input value={form.char} onChange={(e) => setForm({ ...form, char: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Measured Value</label><input type="number" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <button onClick={collect} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Collect</button>
      </div>
      {result && (
        <div className={`border rounded-lg p-4 ${result.canProceed ? 'bg-green-50' : 'bg-red-50'}`}>
          <p className="font-medium">{result.canProceed ? '✓ Operation may proceed' : '🔒 Move BLOCKED'}</p>
          {result.blockedBy?.length > 0 && <p className="text-sm text-red-600">Blocked by: {result.blockedBy.join(', ')}</p>}
          <table className="w-full text-sm mt-2">
            <thead><tr className="text-left text-gray-500 text-xs"><th className="py-1">Characteristic</th><th className="py-1">Value</th><th className="py-1">Verdict</th></tr></thead>
            <tbody>
              {result.results.map((r: any, i: number) => (
                <tr key={i} className="border-t"><td className="py-1">{r.characteristicName}{r.required && <span className="text-red-400">*</span>}</td><td className="py-1">{r.measuredValue ?? '—'}</td><td className="py-1"><span className={r.verdict === 'PASS' ? 'text-green-600' : 'text-red-600'}>{r.verdict}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FpyTab() {
  const [wc, setWc] = useState('');
  const [fpy, setFpy] = useState<any>(null);
  async function load() {
    const res = await opQualityApi.firstPassYield(wc ? { workCenterId: wc } : {});
    setFpy(res.data?.data ?? res.data);
  }
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <input value={wc} onChange={(e) => setWc(e.target.value)} placeholder="Work Center ID (optional)" className="border rounded px-2 py-1 text-sm font-mono w-72" />
        <button onClick={load} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Compute FPY</button>
      </div>
      {fpy && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">First-Pass Yield</p><p className="text-2xl font-bold text-indigo-600">{fpy.firstPassYieldPct}%</p></div>
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Passed First</p><p className="text-2xl font-bold">{fpy.operationsPassedFirst}</p></div>
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Total Ops</p><p className="text-2xl font-bold">{fpy.operationsTotal}</p></div>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 text-sm font-medium">By Work Center</div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Work Center</th><th className="px-3 py-2 text-right">FPY</th><th className="px-3 py-2 text-right">Passed/Total</th></tr></thead>
              <tbody className="divide-y">
                {(fpy.byWorkCenter ?? []).length === 0 ? <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">No data.</td></tr> : fpy.byWorkCenter.map((w: any) => (
                  <tr key={w.workCenterId}><td className="px-3 py-2 font-mono text-xs">{w.workCenterId?.slice(0, 8)}</td><td className="px-3 py-2 text-right font-medium">{w.firstPassYieldPct}%</td><td className="px-3 py-2 text-right">{w.firstPass}/{w.total}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = ['Quality Plans', 'Collect & Gate', 'First-Pass Yield'];

export default function OpQualityPage() {
  const [tab, setTab] = useState('Quality Plans');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Quality at Operations</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Quality at Operations parity — quality plans per routing operation, in-process measurement
          collection that blocks the move on required failures, and first-pass yield tracking by work center.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Quality Plans' && <PlansTab />}
      {tab === 'Collect & Gate' && <CollectTab />}
      {tab === 'First-Pass Yield' && <FpyTab />}
    </div>
  );
}
