import { useState, useEffect } from 'react';
import { payrollCostingApi } from '../../api/payrollCosting';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function RulesTab() {
  const [rules, setRules] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', componentCode: '', costCenterId: '', splitType: 'PERCENTAGE', splitValue: 0, priority: 50 });

  useEffect(() => { load(); }, []);
  async function load() { setRules(unwrap(await payrollCostingApi.listRules())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await payrollCostingApi.createRule({ ...form, componentCode: form.componentCode || null, costCenterId: form.costCenterId || null }); setForm({ name: '', componentCode: '', costCenterId: '', splitType: 'PERCENTAGE', splitValue: 0, priority: 50 }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-6 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <div><label className="text-xs text-gray-500">Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Element (blank=all)</label><input value={form.componentCode} onChange={(e) => setForm({ ...form, componentCode: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Cost Center ID</label><input value={form.costCenterId} onChange={(e) => setForm({ ...form, costCenterId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Split</label><select value={form.splitType} onChange={(e) => setForm({ ...form, splitType: e.target.value })} className="w-full border rounded px-2 py-1 text-sm"><option>PERCENTAGE</option><option>ABSOLUTE</option></select></div>
        <div><label className="text-xs text-gray-500">Value</label><input type="number" value={form.splitValue} onChange={(e) => setForm({ ...form, splitValue: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Rule</button>
      </form>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Element</th><th className="px-3 py-2 text-left">Cost Center</th><th className="px-3 py-2 text-left">Split</th><th className="px-3 py-2 text-right">Value</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">
            {rules.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No costing rules.</td></tr> : rules.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-xs">{r.componentCode ?? '(all)'}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.costCenterId?.slice(0, 8) ?? '—'}</td>
                <td className="px-3 py-2 text-xs">{r.splitType}</td>
                <td className="px-3 py-2 text-right">{r.splitValue}{r.splitType === 'PERCENTAGE' ? '%' : ''}</td>
                <td className="px-3 py-2"><button onClick={async () => { await payrollCostingApi.deleteRule(r.id); load(); }} className="text-red-500 text-xs hover:underline">Del</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReportTab() {
  const [runId, setRunId] = useState('');
  const [groupBy, setGroupBy] = useState('costCenter');
  const [report, setReport] = useState<any>(null);

  async function load() {
    const r = await payrollCostingApi.laborReport({ payrollRunId: runId || undefined, groupBy });
    setReport(r.data?.data ?? r.data);
  }
  useEffect(() => { load(); }, [groupBy]);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-end">
        <div><label className="text-xs text-gray-500">Payroll Run ID (optional)</label><input value={runId} onChange={(e) => setRunId(e.target.value)} className="border rounded px-2 py-1 text-sm font-mono w-72" /></div>
        <div><label className="text-xs text-gray-500">Group By</label><select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="border rounded px-2 py-1 text-sm"><option value="costCenter">Cost Center</option><option value="project">Project</option><option value="account">GL Account</option><option value="component">Element</option></select></div>
        <button onClick={load} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Run Report</button>
      </div>
      {report && (
        <div className="border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 text-sm font-medium flex justify-between"><span>Labor Distribution — by {report.groupBy}</span><span>Total: {money(report.total)}</span></div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">{report.groupBy}</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">%</th></tr></thead>
            <tbody className="divide-y">
              {(report.lines ?? []).length === 0 ? <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-400">No distribution data.</td></tr> : report.lines.map((l: any) => (
                <tr key={l.key}><td className="px-3 py-2 font-mono text-xs">{l.key === 'UNASSIGNED' ? <span className="text-gray-400">unassigned</span> : l.key.slice?.(0, 12) ?? l.key}</td><td className="px-3 py-2 text-right font-medium">{money(l.amount)}</td><td className="px-3 py-2 text-right">{l.pct}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const TABS = ['Costing Rules', 'Labor Report'];

export default function PayrollCostingPage() {
  const [tab, setTab] = useState('Costing Rules');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Payroll Costing</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Payroll Costing parity — distribute each payroll element's cost across cost centers /
          projects / GL accounts via costing rules (% or absolute), with labor distribution reporting.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Costing Rules' && <RulesTab />}
      {tab === 'Labor Report' && <ReportTab />}
    </div>
  );
}
