import { useState } from 'react';
import { projectBillingApi } from '../../api/projectBilling';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

function BudgetTab({ projectId }: { projectId: string }) {
  const [bva, setBva] = useState<any>(null);
  const [lines, setLines] = useState('task1:1000, task2:500');
  async function createBudget() {
    const parsed = lines.split(',').map((l) => { const [taskId, budgetAmount] = l.trim().split(':'); return { taskId, budgetAmount: Number(budgetAmount) }; });
    try { await projectBillingApi.createBudget(projectId, { lines: parsed }); alert('Budget created'); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function load() { if (!projectId) return; try { const r = await projectBillingApi.budgetVsActual(projectId); setBva(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 bg-gray-50 p-3 rounded-lg">
        <div className="flex-1"><label className="text-xs text-gray-500">Budget lines (task:amount, …)</label><input value={lines} onChange={(e) => setLines(e.target.value)} className="w-full border rounded px-2 py-1 text-sm font-mono text-xs" /></div>
        <button onClick={createBudget} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Create Budget</button>
        <button onClick={load} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Budget vs Actual</button>
      </div>
      {bva && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Budget</p><p className="text-xl font-bold">{money(bva.totalBudget)}</p></div>
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Actual</p><p className="text-xl font-bold">{money(bva.totalActual)}</p></div>
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Variance</p><p className={`text-xl font-bold ${bva.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{money(bva.variance)}</p></div>
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">EAC</p><p className="text-xl font-bold">{money(bva.eac)}</p></div>
          </div>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Task</th><th className="px-3 py-2 text-right">Budget</th><th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Variance</th><th className="px-3 py-2 text-right">EAC</th></tr></thead>
            <tbody className="divide-y">
              {(bva.tasks ?? []).map((t: any, i: number) => (
                <tr key={i}><td className="px-3 py-2 font-mono text-xs">{t.taskId ?? '—'}</td><td className="px-3 py-2 text-right">{money(t.budget)}</td><td className="px-3 py-2 text-right">{money(t.actual)}</td><td className="px-3 py-2 text-right">{money(t.variance)}</td><td className="px-3 py-2 text-right">{money(t.eac)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function TmTab({ projectId }: { projectId: string }) {
  const [range, setRange] = useState({ fromDate: '2026-06-01', toDate: '2026-06-30' });
  const [inv, setInv] = useState<any>(null);
  async function gen() {
    try { const r = await projectBillingApi.tmInvoice(projectId, range.fromDate, range.toDate); setInv(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2 bg-gray-50 p-3 rounded-lg">
        <div><label className="text-xs text-gray-500">From</label><input type="date" value={range.fromDate} onChange={(e) => setRange({ ...range, fromDate: e.target.value })} className="border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">To</label><input type="date" value={range.toDate} onChange={(e) => setRange({ ...range, toDate: e.target.value })} className="border rounded px-2 py-1 text-sm" /></div>
        <button onClick={gen} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Generate T&M Invoice</button>
      </div>
      {inv && (
        <div className="border rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm"><span>Labor</span><span className="font-medium">{money(inv.laborTotal)}</span></div>
          <div className="flex justify-between text-sm"><span>Expenses</span><span className="font-medium">{money(inv.expenseTotal)}</span></div>
          <div className="flex justify-between text-lg font-bold border-t pt-2"><span>Total</span><span>{money(inv.total)}</span></div>
          <table className="w-full text-xs border rounded overflow-hidden mt-2">
            <thead className="bg-gray-50"><tr><th className="px-2 py-1 text-left">Type</th><th className="px-2 py-1 text-left">Detail</th><th className="px-2 py-1 text-right">Hours</th><th className="px-2 py-1 text-right">Amount</th></tr></thead>
            <tbody className="divide-y">
              {[...(inv.labor ?? []), ...(inv.expenses ?? [])].map((l: any, i: number) => (
                <tr key={i}><td className="px-2 py-1">{l.type}</td><td className="px-2 py-1">{l.employeeId ?? l.description}</td><td className="px-2 py-1 text-right">{l.hours ?? '—'}</td><td className="px-2 py-1 text-right">{money(l.amount)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RevRecTab({ projectId }: { projectId: string }) {
  const [history, setHistory] = useState<any[]>([]);
  const [poc, setPoc] = useState({ period: '2026-06', contractValue: 100000, costToDate: 50000, estimatedTotalCost: 100000 });
  async function load() { if (!projectId) return; setHistory(unwrap(await projectBillingApi.history(projectId))); }
  async function recognizePoc() {
    try { await projectBillingApi.recognizePoc(projectId, poc); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <div><label className="text-xs text-gray-500">Period</label><input value={poc.period} onChange={(e) => setPoc({ ...poc, period: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Contract</label><input type="number" value={poc.contractValue} onChange={(e) => setPoc({ ...poc, contractValue: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Cost to Date</label><input type="number" value={poc.costToDate} onChange={(e) => setPoc({ ...poc, costToDate: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Est. Total Cost</label><input type="number" value={poc.estimatedTotalCost} onChange={(e) => setPoc({ ...poc, estimatedTotalCost: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <button onClick={recognizePoc} className="bg-indigo-600 text-white px-2 py-1.5 rounded text-sm">Recognize POC</button>
      </div>
      <button onClick={load} className="text-indigo-600 text-xs hover:underline">refresh history</button>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Period</th><th className="px-3 py-2 text-left">Method</th><th className="px-3 py-2 text-right">POC%</th><th className="px-3 py-2 text-right">Recognized</th><th className="px-3 py-2 text-right">Cumulative</th></tr></thead>
        <tbody className="divide-y">
          {history.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No recognition entries.</td></tr> : history.map((h) => (
            <tr key={h.id}><td className="px-3 py-2">{h.period}</td><td className="px-3 py-2 text-xs">{h.method}</td><td className="px-3 py-2 text-right">{h.pocPct}%</td><td className="px-3 py-2 text-right font-medium">{money(h.recognizedAmount)}</td><td className="px-3 py-2 text-right">{money(h.cumulativeRecognized)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = ['Budget vs Actual', 'T&M Billing', 'Revenue Recognition'];

export default function ProjectBillingPage() {
  const [tab, setTab] = useState('Budget vs Actual');
  const [projectId, setProjectId] = useState('');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Project Billing & Revenue</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Project Costing/Billing parity — budgets by task/resource with baseline+revisions, budget-vs-
          actual with EAC, T&M billing from time and expenses, fixed-price schedules, and revenue recognition (POC / completed-contract / milestone).
        </p>
      </div>
      <div><label className="text-xs text-gray-500">Project ID</label><input value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-80 border rounded px-2 py-1 text-sm font-mono" placeholder="project uuid" /></div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {!projectId ? <p className="text-sm text-gray-400">Enter a project ID to begin.</p> : (
        <>
          {tab === 'Budget vs Actual' && <BudgetTab projectId={projectId} />}
          {tab === 'T&M Billing' && <TmTab projectId={projectId} />}
          {tab === 'Revenue Recognition' && <RevRecTab projectId={projectId} />}
        </>
      )}
    </div>
  );
}
