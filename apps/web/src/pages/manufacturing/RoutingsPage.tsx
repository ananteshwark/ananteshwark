import { useState, useEffect } from 'react';
import { Plus, Trash2, Gauge } from 'lucide-react';
import { manufacturingApi } from '../../api/manufacturing';
import { inventoryApi } from '../../api/inventory';

type Tab = 'routings' | 'capacity';

function CreateRoutingModal({ items, workCenters, onClose, onCreated }: { items: any[]; workCenters: any[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ itemId: items[0]?.id || '', version: '1.0', description: '' });
  const [ops, setOps] = useState<any[]>([
    { sequence: 10, workCenterId: workCenters[0]?.id || '', description: '', setupMinutes: '0', runMinutesPerUnit: '0', yieldPercent: '100' },
  ]);
  const [saving, setSaving] = useState(false);

  const addOp = () => setOps(p => [...p, { sequence: (p[p.length - 1]?.sequence ?? 0) + 10, workCenterId: workCenters[0]?.id || '', description: '', setupMinutes: '0', runMinutesPerUnit: '0', yieldPercent: '100' }]);
  const removeOp = (i: number) => setOps(p => p.filter((_, idx) => idx !== i));
  const setOp = (i: number, k: string, v: string) => setOps(p => p.map((o, idx) => idx === i ? { ...o, [k]: v } : o));

  const save = async () => {
    setSaving(true);
    try {
      await manufacturingApi.createRouting({
        ...form,
        operations: ops.map(o => ({
          sequence: parseInt(o.sequence, 10),
          workCenterId: o.workCenterId,
          description: o.description,
          setupMinutes: parseInt(o.setupMinutes || '0', 10),
          runMinutesPerUnit: parseFloat(o.runMinutesPerUnit || '0'),
          yieldPercent: parseFloat(o.yieldPercent || '100'),
        })),
      });
      onCreated();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">New Routing</h2>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Item</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.itemId}
              onChange={e => setForm(p => ({ ...p, itemId: e.target.value }))}>
              {items.map((i: any) => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Version</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.version}
              onChange={e => setForm(p => ({ ...p, version: e.target.value }))} />
          </div>
        </div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">Operations</span>
          <button onClick={addOp} className="text-xs text-blue-600 flex items-center gap-1"><Plus className="h-3 w-3" /> Add</button>
        </div>
        <div className="space-y-2">
          {ops.map((o, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end border rounded-lg p-2">
              <div className="col-span-1">
                <label className="block text-[10px] text-gray-400">Seq</label>
                <input className="w-full border rounded px-2 py-1 text-xs" value={o.sequence} onChange={e => setOp(i, 'sequence', e.target.value)} />
              </div>
              <div className="col-span-3">
                <label className="block text-[10px] text-gray-400">Work Center</label>
                <select className="w-full border rounded px-2 py-1 text-xs" value={o.workCenterId} onChange={e => setOp(i, 'workCenterId', e.target.value)}>
                  {workCenters.map((w: any) => <option key={w.id} value={w.id}>{w.code}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] text-gray-400">Setup (min)</label>
                <input className="w-full border rounded px-2 py-1 text-xs" value={o.setupMinutes} onChange={e => setOp(i, 'setupMinutes', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] text-gray-400">Run/unit (min)</label>
                <input className="w-full border rounded px-2 py-1 text-xs" value={o.runMinutesPerUnit} onChange={e => setOp(i, 'runMinutesPerUnit', e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] text-gray-400">Yield %</label>
                <input className="w-full border rounded px-2 py-1 text-xs" value={o.yieldPercent} onChange={e => setOp(i, 'yieldPercent', e.target.value)} />
              </div>
              <div className="col-span-2 flex justify-end">
                <button onClick={() => removeOp(i)} className="text-red-500 p-1"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving || !form.itemId || ops.length === 0}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">{saving ? 'Saving...' : 'Create Routing'}</button>
        </div>
      </div>
    </div>
  );
}

export default function RoutingsPage() {
  const [tab, setTab] = useState<Tab>('routings');
  const [routings, setRoutings] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [capacity, setCapacity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [range, setRange] = useState({ fromDate: today, toDate: today });

  const itemName = (id: string) => { const i = items.find(x => x.id === id); return i ? `${i.code} — ${i.name}` : id; };
  const wcCode = (id: string) => workCenters.find(w => w.id === id)?.code ?? id;

  const load = () => {
    setLoading(true);
    Promise.all([
      manufacturingApi.getRoutings(),
      inventoryApi.getItems({ limit: 200 }),
      manufacturingApi.getWorkCenters(),
    ]).then(([r1, r2, r3]) => {
      setRoutings(r1.data?.data ?? r1.data ?? []);
      setItems(r2.data?.items ?? r2.data?.data?.items ?? []);
      setWorkCenters(r3.data?.data ?? r3.data ?? []);
    }).finally(() => setLoading(false));
  };

  const loadCapacity = () => {
    manufacturingApi.getCapacityLoad(range).then(r => setCapacity(r.data?.data ?? r.data ?? []));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === 'capacity') loadCapacity(); }, [tab]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Routing & Capacity</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manufacturing routings and work center capacity load</p>
        </div>
        {tab === 'routings' && (
          <button onClick={() => setShowCreate(true)} disabled={items.length === 0 || workCenters.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            <Plus className="h-4 w-4" /> New Routing
          </button>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([['routings', 'Routings'], ['capacity', 'Capacity Load']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as Tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{label}</button>
        ))}
      </div>

      {tab === 'routings' && (
        <div className="bg-white rounded-xl border">
          {loading ? <div className="p-8 text-center text-gray-400">Loading...</div> : routings.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No routings yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>{['Item', 'Version', 'Operations', 'Active'].map(h => <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y">
                {routings.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-2 font-medium">{itemName(r.itemId)}</td>
                    <td className="px-4 py-2 text-gray-500">{r.version}</td>
                    <td className="px-4 py-2">
                      <div className="space-y-0.5">
                        {(r.operations ?? []).map((o: any) => (
                          <div key={o.id ?? o.sequence} className="text-xs text-gray-600">
                            <span className="font-mono">{o.sequence}</span> · {wcCode(o.workCenterId)} · setup {o.setupMinutes}m · run {o.runMinutesPerUnit}m/u · yield {o.yieldPercent}%
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{r.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'capacity' && (
        <div className="space-y-4">
          <div className="flex items-end gap-3 bg-white rounded-xl border p-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={range.fromDate} onChange={e => setRange(p => ({ ...p, fromDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={range.toDate} onChange={e => setRange(p => ({ ...p, toDate: e.target.value }))} />
            </div>
            <button onClick={loadCapacity} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm"><Gauge className="h-4 w-4" /> Calculate</button>
          </div>
          <div className="bg-white rounded-xl border">
            {capacity.length === 0 ? <div className="p-8 text-center text-gray-400">No capacity data.</div> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>{['Work Center', 'Available (min)', 'Scheduled (min)', 'Load %', 'Status'].map(h => <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y">
                  {capacity.map((c: any) => (
                    <tr key={c.workCenterId} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{c.code} — {c.name}</td>
                      <td className="px-4 py-2 text-right">{c.availableMinutes?.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">{c.scheduledMinutes?.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full ${c.overloaded ? 'bg-red-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, c.loadPercent)}%` }} />
                          </div>
                          <span>{c.loadPercent}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs ${c.overloaded ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>{c.overloaded ? 'Overloaded' : 'OK'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <CreateRoutingModal items={items} workCenters={workCenters} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}
