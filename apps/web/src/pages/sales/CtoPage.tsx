import { useEffect, useState } from 'react';
import { ctoApi, CtoMapping, CtoConfiguration } from '../../api/cto';

function unwrap<T>(res: any): T {
  return (res.data?.data ?? res.data) as T;
}

const TABS = ['Configurations', 'Option → Component Mappings'];

export default function CtoPage() {
  const [tab, setTab] = useState(TABS[0]);
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Configure-to-Order (CTO)</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle CTO parity — map configuration options to bill-of-materials changes (add / remove /
          substitute components), explode a chosen configuration into a concrete variant BOM, and
          release the configured item to a supply work order.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === TABS[0] ? <ConfigurationsTab /> : <MappingsTab />}
    </div>
  );
}

function ConfigurationsTab() {
  const [configs, setConfigs] = useState<CtoConfiguration[]>([]);
  const [modelCode, setModelCode] = useState('');
  const [options, setOptions] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [selected, setSelected] = useState<CtoConfiguration | null>(null);

  async function load() { setConfigs(unwrap<CtoConfiguration[]>(await ctoApi.listConfigurations())); }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const selectedOptions = options.split(',').map((o) => o.trim()).filter(Boolean);
    try {
      const created = unwrap<CtoConfiguration>(await ctoApi.createConfiguration({ modelCode: modelCode.trim(), selectedOptions, unitPrice: Number(unitPrice) || 0 }));
      setModelCode(''); setOptions(''); setUnitPrice('');
      await load();
      setSelected(created);
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed to configure'); }
  }

  async function release(c: CtoConfiguration) {
    try { await ctoApi.release(c.id); await load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function cancel(c: CtoConfiguration) {
    try { await ctoApi.cancel(c.id); await load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  const badge = (s: string) => ({
    CONFIGURED: 'bg-blue-100 text-blue-700', RELEASED: 'bg-green-100 text-green-700', CANCELLED: 'bg-gray-100 text-gray-500',
  } as Record<string, string>)[s] ?? 'bg-gray-100 text-gray-500';

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-3">
        <form onSubmit={create} className="bg-gray-50 border rounded-lg p-3 flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Model code</label>
            <input required value={modelCode} onChange={(e) => setModelCode(e.target.value)} className="w-full border rounded px-2 py-1 text-sm font-mono" placeholder="LAPTOP" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-gray-500 mb-1">Options (comma-sep)</label>
            <input value={options} onChange={(e) => setOptions(e.target.value)} className="w-full border rounded px-2 py-1 text-sm font-mono" placeholder="I7, RAM_EXTRA" />
          </div>
          <div className="w-28">
            <label className="block text-xs text-gray-500 mb-1">Unit price</label>
            <input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="1300" />
          </div>
          <button type="submit" className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm">Configure</button>
        </form>

        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-50"><tr>
            <th className="px-3 py-2 text-left">Config #</th>
            <th className="px-3 py-2 text-left">Variant item</th>
            <th className="px-3 py-2 text-left">Options</th>
            <th className="px-3 py-2 text-left">Status</th>
            <th className="px-3 py-2 text-left">Work order</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr></thead>
          <tbody className="divide-y">
            {configs.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No configurations yet.</td></tr>
            ) : configs.map((c) => (
              <tr key={c.id} className={selected?.id === c.id ? 'bg-blue-50' : ''}>
                <td className="px-3 py-2 font-mono text-xs cursor-pointer" onClick={() => setSelected(c)}>{c.configNumber}</td>
                <td className="px-3 py-2 font-mono text-xs">{c.variantItemCode}</td>
                <td className="px-3 py-2 text-xs">{c.selectedOptions.join(', ') || '—'}</td>
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${badge(c.status)}`}>{c.status}</span></td>
                <td className="px-3 py-2 font-mono text-xs">{c.workOrderNumber ?? '—'}</td>
                <td className="px-3 py-2 text-right space-x-2">
                  <button onClick={() => setSelected(c)} className="text-xs text-blue-600 hover:underline">BOM</button>
                  {c.status === 'CONFIGURED' && <button onClick={() => release(c)} className="text-xs text-green-600 hover:underline">Release</button>}
                  {c.status === 'CONFIGURED' && <button onClick={() => cancel(c)} className="text-xs text-red-600 hover:underline">Cancel</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="col-span-1">
        {selected ? (
          <div className="border rounded-lg p-3 space-y-2">
            <h3 className="font-semibold text-sm">Variant BOM — {selected.variantItemCode}</h3>
            <table className="w-full text-xs">
              <thead className="text-gray-400"><tr><th className="text-left py-1">Component</th><th className="text-right">Qty</th><th className="text-left pl-2">Src</th></tr></thead>
              <tbody>
                {selected.variantBom.map((c) => (
                  <tr key={c.componentCode} className="border-t">
                    <td className="py-1">{c.componentName} <span className="text-gray-400 font-mono">({c.componentCode})</span></td>
                    <td className="text-right">{c.quantity} {c.uom}</td>
                    <td className="pl-2 text-gray-400">{c.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-gray-400">Select a configuration to view its exploded BOM.</p>}
      </div>
    </div>
  );
}

function MappingsTab() {
  const [mappings, setMappings] = useState<CtoMapping[]>([]);
  const [modelCode, setModelCode] = useState('');
  const [form, setForm] = useState<Partial<CtoMapping>>({ action: 'ADD', quantity: 1, uom: 'EA' });

  async function load() { setMappings(unwrap<CtoMapping[]>(await ctoApi.listMappings(modelCode || undefined))); }
  useEffect(() => { load(); }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await ctoApi.createMapping(form);
      setForm({ action: 'ADD', quantity: 1, uom: 'EA', modelCode: form.modelCode });
      await load();
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function remove(id: string) {
    try { await ctoApi.deleteMapping(id); await load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={create} className="bg-gray-50 border rounded-lg p-3 grid grid-cols-7 gap-2 items-end text-sm">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Model</label>
          <input required value={form.modelCode ?? ''} onChange={(e) => setForm({ ...form, modelCode: e.target.value })} className="w-full border rounded px-2 py-1 font-mono" placeholder="LAPTOP" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Option (or BASE)</label>
          <input required value={form.optionCode ?? ''} onChange={(e) => setForm({ ...form, optionCode: e.target.value })} className="w-full border rounded px-2 py-1 font-mono" placeholder="BASE" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Action</label>
          <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as any })} className="w-full border rounded px-2 py-1">
            <option>ADD</option><option>REMOVE</option><option>SUBSTITUTE</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Component</label>
          <input required value={form.componentCode ?? ''} onChange={(e) => setForm({ ...form, componentCode: e.target.value, componentName: e.target.value })} className="w-full border rounded px-2 py-1 font-mono" placeholder="CPU-I7" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Qty</label>
          <input type="number" value={form.quantity ?? 1} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className="w-full border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Substitutes</label>
          <input value={form.substituteForCode ?? ''} onChange={(e) => setForm({ ...form, substituteForCode: e.target.value })} className="w-full border rounded px-2 py-1 font-mono" placeholder="CPU-I5" disabled={form.action !== 'SUBSTITUTE'} />
        </div>
        <button type="submit" className="bg-blue-600 text-white px-3 py-1.5 rounded">+ Add</button>
      </form>

      <div className="flex items-center gap-2">
        <input value={modelCode} onChange={(e) => setModelCode(e.target.value)} onBlur={load} className="border rounded px-2 py-1 text-sm font-mono" placeholder="filter by model" />
        <button onClick={load} className="text-sm text-blue-600">Filter</button>
      </div>

      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr>
          <th className="px-3 py-2 text-left">Model</th><th className="px-3 py-2 text-left">Option</th><th className="px-3 py-2 text-left">Action</th>
          <th className="px-3 py-2 text-left">Component</th><th className="px-3 py-2 text-left">Qty</th><th className="px-3 py-2 text-left">Substitutes</th><th></th>
        </tr></thead>
        <tbody className="divide-y">
          {mappings.length === 0 ? (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No mappings. Add BASE rows plus per-option changes.</td></tr>
          ) : mappings.map((m) => (
            <tr key={m.id}>
              <td className="px-3 py-2 font-mono text-xs">{m.modelCode}</td>
              <td className="px-3 py-2 font-mono text-xs">{m.optionCode}</td>
              <td className="px-3 py-2 text-xs">{m.action}</td>
              <td className="px-3 py-2 font-mono text-xs">{m.componentCode}</td>
              <td className="px-3 py-2">{m.quantity} {m.uom}</td>
              <td className="px-3 py-2 font-mono text-xs">{m.substituteForCode ?? '—'}</td>
              <td className="px-3 py-2 text-right"><button onClick={() => remove(m.id)} className="text-xs text-red-600 hover:underline">Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
