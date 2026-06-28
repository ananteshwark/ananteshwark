import { useState, useEffect } from 'react';
import { headcountApi } from '../../api/headcount';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const SEV: Record<string, string> = { OK: 'bg-green-100 text-green-700', WARN: 'bg-amber-100 text-amber-700', BLOCK: 'bg-red-100 text-red-700' };
const SCEN_STATUS: Record<string, string> = { DRAFT: 'bg-gray-100 text-gray-600', FINALIZED: 'bg-green-100 text-green-700', DISCARDED: 'bg-red-100 text-red-700' };

function BudgetsTab() {
  const [budgets, setBudgets] = useState<any[]>([]);
  const [form, setForm] = useState({ positionId: '', fiscalYear: new Date().getFullYear(), approvedFte: 1, salaryMin: 0, salaryMax: 0 });
  const [check, setCheck] = useState<any>(null);
  const [checkForm, setCheckForm] = useState({ positionId: '', fiscalYear: new Date().getFullYear(), requestedFte: 1 });

  useEffect(() => { load(); }, []);
  async function load() { setBudgets(unwrap(await headcountApi.listBudgets())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await headcountApi.createBudget(form); setForm({ positionId: '', fiscalYear: new Date().getFullYear(), approvedFte: 1, salaryMin: 0, salaryMax: 0 }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function runCheck() {
    if (!checkForm.positionId) return;
    try { const r = await headcountApi.check(checkForm.positionId, checkForm.fiscalYear, checkForm.requestedFte); setCheck(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid grid-cols-6 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <div className="col-span-2"><label className="text-xs text-gray-500">Position ID</label><input required value={form.positionId} onChange={(e) => setForm({ ...form, positionId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Fiscal Year</label><input type="number" value={form.fiscalYear} onChange={(e) => setForm({ ...form, fiscalYear: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Approved FTE</label><input type="number" step="0.5" value={form.approvedFte} onChange={(e) => setForm({ ...form, approvedFte: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Salary Max</label><input type="number" value={form.salaryMax} onChange={(e) => setForm({ ...form, salaryMax: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Budget</button>
      </form>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Position</th><th className="px-3 py-2 text-right">FY</th><th className="px-3 py-2 text-right">Approved FTE</th><th className="px-3 py-2 text-right">Salary Range</th></tr></thead>
        <tbody className="divide-y">
          {budgets.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No budgets.</td></tr> : budgets.map((b) => (
            <tr key={b.id}><td className="px-3 py-2 font-mono text-xs">{b.positionId?.slice(0, 8)}</td><td className="px-3 py-2 text-right">{b.fiscalYear}</td><td className="px-3 py-2 text-right">{b.approvedFte}</td><td className="px-3 py-2 text-right text-xs">{money(b.salaryMin)}–{money(b.salaryMax)}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
        <h3 className="font-semibold text-sm">Headcount Control Check</h3>
        <div className="grid grid-cols-4 gap-2 items-end">
          <div className="col-span-2"><label className="text-xs text-gray-500">Position ID</label><input value={checkForm.positionId} onChange={(e) => setCheckForm({ ...checkForm, positionId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
          <div><label className="text-xs text-gray-500">Fiscal Year</label><input type="number" value={checkForm.fiscalYear} onChange={(e) => setCheckForm({ ...checkForm, fiscalYear: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <button onClick={runCheck} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Check</button>
        </div>
        {check && (
          <div className="flex items-center gap-3 text-sm">
            <span className={`text-xs px-2 py-1 rounded font-medium ${SEV[check.severity]}`}>{check.severity}</span>
            <span>{check.message}</span>
            <span className="text-gray-400">({check.filled}/{check.approvedFte} FTE, remaining {check.remaining})</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ScenariosTab() {
  const [scenarios, setScenarios] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', scenarioType: 'RESTRUCTURE' });
  const [selected, setSelected] = useState<string>('');
  const [change, setChange] = useState({ positionId: '', action: 'ADD', deltaFte: 1 });
  const [projection, setProjection] = useState<any>(null);

  useEffect(() => { load(); }, []);
  async function load() { setScenarios(unwrap(await headcountApi.listScenarios())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await headcountApi.createScenario(form); setForm({ name: '', scenarioType: 'RESTRUCTURE' }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function addChange() {
    if (!selected) return;
    try { await headcountApi.addChange(selected, change); setChange({ positionId: '', action: 'ADD', deltaFte: 1 }); project(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function project() {
    if (!selected) return;
    try { const r = await headcountApi.projection(selected); setProjection(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function act(fn: () => Promise<any>) { try { await fn(); load(); project(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-3">
        <form onSubmit={create} className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-lg items-end">
          <div><label className="text-xs text-gray-500">Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Type</label><select value={form.scenarioType} onChange={(e) => setForm({ ...form, scenarioType: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">{['RESTRUCTURE', 'REDUCTION', 'EXPANSION', 'MERGER'].map((t) => <option key={t}>{t}</option>)}</select></div>
          <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Scenario</button>
        </form>
        <ul className="border rounded-lg divide-y text-sm">
          {scenarios.length === 0 ? <li className="px-3 py-4 text-center text-gray-400">No scenarios.</li> : scenarios.map((s) => (
            <li key={s.id} className={`px-3 py-2 cursor-pointer ${selected === s.id ? 'bg-indigo-50' : ''}`} onClick={() => { setSelected(s.id); setProjection(null); headcountApi.projection(s.id).then((r) => setProjection(r.data?.data ?? r.data)); }}>
              <div className="flex justify-between items-center">
                <span className="font-medium">{s.name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${SCEN_STATUS[s.status]}`}>{s.status}</span>
              </div>
              <span className="text-xs text-gray-400">{s.scenarioType}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-3">
        {selected ? (
          <>
            <div className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg items-end">
              <div><label className="text-xs text-gray-500">Position ID</label><input value={change.positionId} onChange={(e) => setChange({ ...change, positionId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
              <div><label className="text-xs text-gray-500">Action</label><select value={change.action} onChange={(e) => setChange({ ...change, action: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">{['ADD', 'REMOVE', 'ADJUST'].map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><label className="text-xs text-gray-500">Δ FTE</label><input type="number" step="0.5" value={change.deltaFte} onChange={(e) => setChange({ ...change, deltaFte: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
              <button onClick={addChange} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Change</button>
            </div>
            {projection && (
              <div className="space-y-2">
                <div className="flex gap-4 text-sm">
                  <span>Baseline: <strong>{projection.baselineTotal}</strong></span>
                  <span>Projected: <strong>{projection.projectedTotal}</strong></span>
                  <span>Net: <strong className={projection.netChange >= 0 ? 'text-green-600' : 'text-red-600'}>{projection.netChange >= 0 ? '+' : ''}{projection.netChange}</strong></span>
                </div>
                <table className="w-full text-sm border rounded-lg overflow-hidden">
                  <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Position</th><th className="px-3 py-2 text-right">Baseline</th><th className="px-3 py-2 text-right">Δ</th><th className="px-3 py-2 text-right">Projected</th></tr></thead>
                  <tbody className="divide-y">
                    {(projection.lines ?? []).map((l: any) => (
                      <tr key={l.positionId}><td className="px-3 py-2 text-xs">{l.title ?? l.positionId?.slice(0, 8)}</td><td className="px-3 py-2 text-right">{l.baseline}</td><td className="px-3 py-2 text-right">{l.delta}</td><td className="px-3 py-2 text-right font-medium">{l.projected}</td></tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex gap-2">
                  <button onClick={() => act(() => headcountApi.finalize(selected))} className="text-green-600 text-xs hover:underline">finalize</button>
                  <button onClick={() => act(() => headcountApi.discard(selected))} className="text-red-500 text-xs hover:underline">discard</button>
                </div>
              </div>
            )}
          </>
        ) : <p className="text-sm text-gray-400">Select a scenario to model changes.</p>}
      </div>
    </div>
  );
}

const TABS = ['Position Budgets', 'Planning Scenarios'];

export default function HeadcountPage() {
  const [tab, setTab] = useState('Position Budgets');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Headcount Budgeting</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Position Management parity — time-phased position budgets (approved FTE, salary range),
          headcount-control validation on hires (OK/WARN/BLOCK), and non-destructive workforce planning scenarios.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Position Budgets' && <BudgetsTab />}
      {tab === 'Planning Scenarios' && <ScenariosTab />}
    </div>
  );
}
