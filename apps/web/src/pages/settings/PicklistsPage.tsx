import { useEffect, useMemo, useState } from 'react';
import { picklistsApi, Picklist, PicklistOption } from '../../api/picklists';

function unwrap<T>(res: any): T {
  return (res.data?.data ?? res.data) as T;
}

export default function PicklistsPage() {
  const [picklists, setPicklists] = useState<Picklist[]>([]);
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // new picklist form
  const [showNew, setShowNew] = useState(false);
  const [npModule, setNpModule] = useState('');
  const [npKey, setNpKey] = useState('');
  const [npLabel, setNpLabel] = useState('');

  // new option form
  const [optValue, setOptValue] = useState('');
  const [optLabel, setOptLabel] = useState('');
  const [optColor, setOptColor] = useState('');

  async function load() {
    setLoading(true);
    try {
      setPicklists(unwrap<Picklist[]>(await picklistsApi.list()));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  const modules = useMemo(() => Array.from(new Set(picklists.map((p) => p.module))).sort(), [picklists]);
  const visible = useMemo(
    () => picklists.filter((p) => moduleFilter === 'all' || p.module === moduleFilter),
    [picklists, moduleFilter],
  );
  const selected = picklists.find((p) => p.id === selectedId) ?? null;

  async function refreshOne() {
    const all = unwrap<Picklist[]>(await picklistsApi.list());
    setPicklists(all);
  }

  async function createPicklist(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await picklistsApi.create({ module: npModule.trim(), key: npKey.trim(), label: npLabel.trim() });
      const created = unwrap<Picklist>(res);
      setNpModule(''); setNpKey(''); setNpLabel(''); setShowNew(false);
      await refreshOne();
      setSelectedId(created.id);
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed to create picklist'); }
  }

  async function deletePicklist(p: Picklist) {
    if (!confirm(`Delete picklist "${p.label}"? This removes all its options.`)) return;
    try { await picklistsApi.remove(p.id); if (selectedId === p.id) setSelectedId(null); await refreshOne(); }
    catch (err: any) { alert(err.response?.data?.message ?? 'Failed to delete'); }
  }

  async function addOption(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try {
      await picklistsApi.addOption(selected.id, { value: optValue.trim(), label: optLabel.trim(), color: optColor || undefined });
      setOptValue(''); setOptLabel(''); setOptColor('');
      await refreshOne();
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed to add option'); }
  }

  async function toggleOption(o: PicklistOption) {
    try { await picklistsApi.updateOption(o.id, { active: !o.active }); await refreshOne(); }
    catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  async function editOptionLabel(o: PicklistOption) {
    const label = prompt('Option label', o.label);
    if (label == null || label.trim() === '' || label === o.label) return;
    try { await picklistsApi.updateOption(o.id, { label: label.trim() }); await refreshOne(); }
    catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  async function deleteOption(o: PicklistOption) {
    if (!confirm(`Delete option "${o.label}"?`)) return;
    try { await picklistsApi.deleteOption(o.id); await refreshOne(); }
    catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  async function move(o: PicklistOption, dir: -1 | 1) {
    if (!selected) return;
    const ordered = [...selected.options].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = ordered.findIndex((x) => x.id === o.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= ordered.length) return;
    [ordered[idx], ordered[swap]] = [ordered[swap], ordered[idx]];
    try { await picklistsApi.reorder(selected.id, ordered.map((x) => x.id)); await refreshOne(); }
    catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Dropdown Options (Picklists)</h1>
        <p className="text-gray-500 text-sm mt-1">
          Centrally define and manage the dropdown option sets used across every module. Add, rename,
          reorder, activate/deactivate options, or create new picklists. Modules resolve their dropdowns
          by key, so changes here apply everywhere the picklist is used.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600">Module</label>
        <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} className="border rounded px-2 py-1 text-sm">
          <option value="all">All modules ({picklists.length})</option>
          {modules.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button onClick={() => setShowNew((s) => !s)} className="ml-auto bg-blue-600 text-white px-3 py-1.5 rounded text-sm">
          {showNew ? 'Cancel' : '+ New Picklist'}
        </button>
      </div>

      {showNew && (
        <form onSubmit={createPicklist} className="bg-gray-50 border rounded-lg p-4 grid grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Module</label>
            <input required list="module-list" value={npModule} onChange={(e) => setNpModule(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="e.g. hr" />
            <datalist id="module-list">{modules.map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Key</label>
            <input required value={npKey} onChange={(e) => setNpKey(e.target.value)} className="w-full border rounded px-2 py-1 text-sm font-mono" placeholder="e.g. employmentType" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Label</label>
            <input required value={npLabel} onChange={(e) => setNpLabel(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="e.g. Employment Type" />
          </div>
          <button type="submit" className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm">Create</button>
        </form>
      )}

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 border rounded-lg divide-y max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="px-3 py-6 text-center text-gray-400 text-sm">Loading…</div>
          ) : visible.length === 0 ? (
            <div className="px-3 py-6 text-center text-gray-400 text-sm">No picklists.</div>
          ) : visible.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between ${selectedId === p.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
            >
              <span>
                <span className="font-medium">{p.label}</span>
                <span className="block text-xs text-gray-400 font-mono">{p.module} · {p.key}</span>
              </span>
              <span className="text-xs text-gray-400">{p.options?.length ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="col-span-2">
          {!selected ? (
            <p className="text-sm text-gray-400">Select a picklist to manage its options.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-semibold">{selected.label} {selected.isSystem && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded ml-1">system</span>}</h2>
                  <p className="text-xs text-gray-400 font-mono">{selected.module} · {selected.key}</p>
                </div>
                {!selected.isSystem && (
                  <button onClick={() => deletePicklist(selected)} className="text-xs text-red-600 hover:underline">Delete picklist</button>
                )}
              </div>

              <form onSubmit={addOption} className="flex gap-2 items-end bg-gray-50 border rounded-lg p-3">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Value</label>
                  <input required value={optValue} onChange={(e) => setOptValue(e.target.value)} className="w-full border rounded px-2 py-1 text-sm font-mono" placeholder="value" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Label</label>
                  <input required value={optLabel} onChange={(e) => setOptLabel(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" placeholder="Display label" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Color</label>
                  <input type="color" value={optColor || '#ffffff'} onChange={(e) => setOptColor(e.target.value)} className="h-8 w-10 border rounded" />
                </div>
                <button type="submit" className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm">+ Add</button>
              </form>

              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left w-16">Order</th>
                    <th className="px-3 py-2 text-left">Value</th>
                    <th className="px-3 py-2 text-left">Label</th>
                    <th className="px-3 py-2 text-left w-20">Status</th>
                    <th className="px-3 py-2 text-right w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[...selected.options].sort((a, b) => a.sortOrder - b.sortOrder).map((o, i, arr) => (
                    <tr key={o.id} className={o.active ? '' : 'opacity-50'}>
                      <td className="px-3 py-2">
                        <button disabled={i === 0} onClick={() => move(o, -1)} className="text-gray-500 disabled:text-gray-200 px-1">↑</button>
                        <button disabled={i === arr.length - 1} onClick={() => move(o, 1)} className="text-gray-500 disabled:text-gray-200 px-1">↓</button>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs flex items-center gap-2">
                        {o.color && <span className="inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: o.color }} />}
                        {o.value}
                      </td>
                      <td className="px-3 py-2">{o.label}</td>
                      <td className="px-3 py-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${o.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{o.active ? 'Active' : 'Inactive'}</span>
                      </td>
                      <td className="px-3 py-2 text-right space-x-2">
                        <button onClick={() => editOptionLabel(o)} className="text-xs text-blue-600 hover:underline">Rename</button>
                        <button onClick={() => toggleOption(o)} className="text-xs text-gray-600 hover:underline">{o.active ? 'Disable' : 'Enable'}</button>
                        <button onClick={() => deleteOption(o)} className="text-xs text-red-600 hover:underline">Delete</button>
                      </td>
                    </tr>
                  ))}
                  {selected.options.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No options yet. Add one above.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
