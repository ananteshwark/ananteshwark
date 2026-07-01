import { useState, useEffect } from 'react';
import { extensibilityApi } from '../../api/extensibility';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

function ObjectsTab() {
  const [objects, setObjects] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [apiName, setApiName] = useState('');
  const [fields, setFields] = useState('code:string:req, value:number');
  const [recJson, setRecJson] = useState('{"code":"A1","value":100}');

  useEffect(() => { load(); }, []);
  async function load() { setObjects(unwrap(await extensibilityApi.listObjects())); }
  async function select(o: any) { setSelected(o); setRecords(unwrap(await extensibilityApi.listRecords(o.id))); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const parsed = fields.split(',').map((f) => { const [name, type, req] = f.trim().split(':'); return { name, label: name, type, required: req === 'req' }; });
    try { await extensibilityApi.createObject({ name, apiName, fields: parsed }); setName(''); setApiName(''); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function addRecord() {
    let data: any = {};
    try { data = JSON.parse(recJson); } catch { alert('Invalid JSON'); return; }
    try { await extensibilityApi.createRecord(selected.id, data); select(selected); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="space-y-3">
        <form onSubmit={create} className="bg-gray-50 p-3 rounded-lg space-y-2">
          <input required placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" />
          <input required placeholder="API name" value={apiName} onChange={(e) => setApiName(e.target.value)} className="w-full border rounded px-2 py-1 text-sm font-mono" />
          <input placeholder="fields name:type:req" value={fields} onChange={(e) => setFields(e.target.value)} className="w-full border rounded px-2 py-1 text-xs font-mono" />
          <button type="submit" className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Object</button>
        </form>
        <ul className="border rounded-lg divide-y text-sm">
          {objects.length === 0 ? <li className="px-3 py-4 text-center text-gray-400">No custom objects.</li> : objects.map((o) => (
            <li key={o.id} className={`px-3 py-2 cursor-pointer ${selected?.id === o.id ? 'bg-indigo-50' : ''}`} onClick={() => select(o)}>
              <span className="font-medium">{o.name}</span> <span className="text-xs text-gray-400 font-mono">{o.apiName}</span>{o.sourcePack && <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded ml-1">{o.sourcePack}</span>}
            </li>
          ))}
        </ul>
      </div>
      <div className="col-span-2 space-y-3">
        {selected ? (
          <>
            <h3 className="font-semibold">{selected.name} <span className="text-xs text-gray-400">({(selected.fields ?? []).map((f: any) => `${f.name}:${f.type}${f.required ? '*' : ''}`).join(', ')})</span></h3>
            <div className="flex gap-2 items-center">
              <input value={recJson} onChange={(e) => setRecJson(e.target.value)} className="flex-1 border rounded px-2 py-1 text-sm font-mono" />
              <button onClick={addRecord} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Record</button>
            </div>
            <table className="w-full text-sm border rounded-lg overflow-hidden">
              <thead className="bg-gray-50"><tr>{(selected.listViewColumns ?? []).map((c: string) => <th key={c} className="px-3 py-2 text-left">{c}</th>)}</tr></thead>
              <tbody className="divide-y">
                {records.length === 0 ? <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">No records.</td></tr> : records.map((r) => (
                  <tr key={r.id}>{(selected.listViewColumns ?? []).map((c: string) => <td key={c} className="px-3 py-2">{String(r.data?.[c] ?? '')}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </>
        ) : <p className="text-sm text-gray-400">Select an object.</p>}
      </div>
    </div>
  );
}

function MarketplaceTab() {
  const [packs, setPacks] = useState<any[]>([]);
  useEffect(() => { load(); }, []);
  async function load() { setPacks(unwrap(await extensibilityApi.marketplace())); }
  async function install(key: string) {
    try { const r = await extensibilityApi.install(key); const d = r.data?.data ?? r.data; alert(`Installed: created ${d.created.join(', ') || 'none'}${d.skipped.length ? `; skipped ${d.skipped.join(', ')}` : ''}`); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="grid grid-cols-4 gap-3">
      {packs.map((p) => (
        <div key={p.key} className="border rounded-lg p-4 space-y-2">
          <p className="font-semibold">{p.name}</p>
          <p className="text-xs text-gray-400">{p.vertical} · {p.objectCount} object(s)</p>
          <button onClick={() => install(p.key)} className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Install</button>
        </div>
      ))}
    </div>
  );
}

const TABS = ['Custom Objects', 'Marketplace'];

export default function ExtensibilityPage() {
  const [tab, setTab] = useState('Custom Objects');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Extensibility Platform</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Extensibility Framework parity — tenant-defined custom objects with typed fields, dynamic
          records validated against required/type + custom validation rules, list-view/sidebar UI metadata, and a
          vertical marketplace (retail, construction, healthcare, nonprofit).
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Custom Objects' && <ObjectsTab />}
      {tab === 'Marketplace' && <MarketplaceTab />}
    </div>
  );
}
