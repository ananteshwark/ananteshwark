import { useState, useEffect } from 'react';
import { grcApi } from '../../api/grc';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const SEV: Record<string, string> = { LOW: 'bg-gray-100 text-gray-600', MEDIUM: 'bg-amber-100 text-amber-700', HIGH: 'bg-orange-100 text-orange-700', CRITICAL: 'bg-red-100 text-red-700' };
const CELL = (n: number) => n >= 15 ? 'bg-red-500 text-white' : n >= 8 ? 'bg-orange-400 text-white' : n >= 4 ? 'bg-amber-300' : 'bg-green-200';

function SodTab() {
  const [rules, setRules] = useState<any[]>([]);
  const empty = { name: '', permissionA: '', permissionB: '', severity: 'CRITICAL' };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [scan, setScan] = useState<any>(null);
  useEffect(() => { load(); }, []);
  async function load() { setRules(unwrap(await grcApi.listSodRules())); }
  function edit(r: any) { setEditingId(r.id); setForm({ name: r.name ?? '', permissionA: r.permissionA ?? '', permissionB: r.permissionB ?? '', severity: r.severity ?? 'CRITICAL' }); }
  async function create(e: React.FormEvent) { e.preventDefault(); try { if (editingId) await grcApi.updateSodRule(editingId, form); else await grcApi.createSodRule(form); setForm(empty); setEditingId(null); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function runScan() {
    const demo = [
      { userId: 'alice', permissions: ['vendor:create', 'payment:approve'] },
      { userId: 'bob', permissions: ['vendor:create'] },
    ];
    try { const r = await grcApi.scan(demo); setScan(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-5 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input required placeholder="Permission A" value={form.permissionA} onChange={(e) => setForm({ ...form, permissionA: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono text-xs" />
        <input required placeholder="Permission B" value={form.permissionB} onChange={(e) => setForm({ ...form, permissionB: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono text-xs" />
        <select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="border rounded px-2 py-1 text-sm">{['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((s) => <option key={s}>{s}</option>)}</select>
        <div className="flex gap-1"><button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">{editingId ? 'Save' : '+ Rule'}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm(empty); }} className="border px-2 py-1 rounded text-sm">Cancel</button>}</div>
      </form>
      <button onClick={runScan} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Run Demo Scan</button>
      {scan && <p className="text-sm">Violations: <strong className="text-red-600">{scan.violationCount}</strong> {scan.violations.map((v: any) => `${v.userId} (${v.rule})`).join(', ')}</p>}
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Rule</th><th className="px-3 py-2 text-left">Conflict</th><th className="px-3 py-2 text-left">Severity</th><th className="px-3 py-2" /></tr></thead>
        <tbody className="divide-y">
          {rules.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No SOD rules.</td></tr> : rules.map((r) => (
            <tr key={r.id}><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2 font-mono text-xs">{r.permissionA} ✕ {r.permissionB}</td><td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${SEV[r.severity]}`}>{r.severity}</span></td><td className="px-3 py-2 text-right"><button onClick={() => edit(r)} className="text-indigo-600 text-xs hover:underline">edit</button></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ControlsTab() {
  const [controls, setControls] = useState<any[]>([]);
  const empty = { code: '', name: '', objective: '', testFrequency: 'QUARTERLY' };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => { load(); }, []);
  async function load() { setControls(unwrap(await grcApi.listControls())); }
  function edit(c: any) { setEditingId(c.id); setForm({ code: c.code ?? '', name: c.name ?? '', objective: c.objective ?? '', testFrequency: c.testFrequency ?? 'QUARTERLY' }); }
  async function create(e: React.FormEvent) { e.preventDefault(); try { if (editingId) await grcApi.updateControl(editingId, form); else await grcApi.createControl(form); setForm(empty); setEditingId(null); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function test(id: string, result: 'EFFECTIVE' | 'DEFICIENT') { try { await grcApi.testControl(id, { result, at: new Date().toISOString() }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <select value={form.testFrequency} onChange={(e) => setForm({ ...form, testFrequency: e.target.value })} className="border rounded px-2 py-1 text-sm">{['MONTHLY', 'QUARTERLY', 'ANNUAL'].map((f) => <option key={f}>{f}</option>)}</select>
        <div className="flex gap-1"><button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">{editingId ? 'Save' : '+ Control'}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm(empty); }} className="border px-2 py-1 rounded text-sm">Cancel</button>}</div>
      </form>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Frequency</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
        <tbody className="divide-y">
          {controls.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No controls.</td></tr> : controls.map((c) => (
            <tr key={c.id}>
              <td className="px-3 py-2 font-mono text-xs">{c.code}</td><td className="px-3 py-2">{c.name}</td><td className="px-3 py-2 text-xs">{c.testFrequency}</td>
              <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${c.status === 'EFFECTIVE' ? 'bg-green-100 text-green-700' : c.status === 'DEFICIENT' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>{c.status}</span></td>
              <td className="px-3 py-2 text-right whitespace-nowrap"><button onClick={() => edit(c)} className="text-indigo-600 text-xs hover:underline mr-2">edit</button><button onClick={() => test(c.id, 'EFFECTIVE')} className="text-green-600 text-xs hover:underline mr-2">effective</button><button onClick={() => test(c.id, 'DEFICIENT')} className="text-red-500 text-xs hover:underline">deficient</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskTab() {
  const [risks, setRisks] = useState<any[]>([]);
  const [heat, setHeat] = useState<any>(null);
  const empty = { title: '', category: '', likelihood: 3, impact: 3 };
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => { load(); }, []);
  async function load() { setRisks(unwrap(await grcApi.listRisks())); const h = await grcApi.heatMap(); setHeat(h.data?.data ?? h.data); }
  function edit(r: any) { setEditingId(r.id); setForm({ title: r.title ?? '', category: r.category ?? '', likelihood: Number(r.likelihood) || 3, impact: Number(r.impact) || 3 }); }
  async function create(e: React.FormEvent) { e.preventDefault(); try { if (editingId) await grcApi.updateRisk(editingId, form); else await grcApi.createRisk(form); setForm(empty); setEditingId(null); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid grid-cols-5 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="Risk title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="col-span-2 border rounded px-2 py-1 text-sm" />
        <div><label className="text-xs text-gray-500">Likelihood 1-5</label><input type="number" min={1} max={5} value={form.likelihood} onChange={(e) => setForm({ ...form, likelihood: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Impact 1-5</label><input type="number" min={1} max={5} value={form.impact} onChange={(e) => setForm({ ...form, impact: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div className="flex gap-1"><button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">{editingId ? 'Save' : '+ Risk'}</button>{editingId && <button type="button" onClick={() => { setEditingId(null); setForm(empty); }} className="border px-2 py-1 rounded text-sm">Cancel</button>}</div>
      </form>
      {heat && (
        <div>
          <p className="text-sm font-semibold mb-1">Heat Map (likelihood ↓ × impact →)</p>
          <table className="border-collapse">
            <tbody>
              {[5, 4, 3, 2, 1].map((l) => (
                <tr key={l}>
                  <td className="text-xs text-gray-400 pr-1">{l}</td>
                  {[1, 2, 3, 4, 5].map((i) => <td key={i} className={`w-10 h-10 text-center text-xs font-bold border ${CELL(l * i)}`}>{heat.grid[l - 1][i - 1] || ''}</td>)}
                </tr>
              ))}
              <tr><td /> {[1, 2, 3, 4, 5].map((i) => <td key={i} className="text-xs text-gray-400 text-center">{i}</td>)}</tr>
            </tbody>
          </table>
        </div>
      )}
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Risk</th><th className="px-3 py-2 text-right">L</th><th className="px-3 py-2 text-right">I</th><th className="px-3 py-2 text-right">Score</th><th className="px-3 py-2 text-left">Level</th><th className="px-3 py-2" /></tr></thead>
        <tbody className="divide-y">
          {risks.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No risks.</td></tr> : risks.map((r) => (
            <tr key={r.id}><td className="px-3 py-2">{r.title}</td><td className="px-3 py-2 text-right">{r.likelihood}</td><td className="px-3 py-2 text-right">{r.impact}</td><td className="px-3 py-2 text-right font-bold">{r.score}</td><td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${SEV[r.level]}`}>{r.level}</span></td><td className="px-3 py-2 text-right"><button onClick={() => edit(r)} className="text-indigo-600 text-xs hover:underline">edit</button></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = ['SOD', 'Controls', 'Risk Register'];

export default function GrcPage() {
  const [tab, setTab] = useState('SOD');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Audit & GRC</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle GRC parity — segregation-of-duties conflict matrix + violation scanning, a SOX control
          framework with test evidence, and an enterprise risk register with a 5×5 likelihood×impact heat map.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'SOD' && <SodTab />}
      {tab === 'Controls' && <ControlsTab />}
      {tab === 'Risk Register' && <RiskTab />}
    </div>
  );
}
