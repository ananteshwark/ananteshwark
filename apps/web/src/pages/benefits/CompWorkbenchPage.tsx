import { useState, useEffect } from 'react';
import { compWorkbenchApi } from '../../api/compWorkbench';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const AWARD_TYPES = ['MERIT', 'BONUS', 'EQUITY'];
const STATUS_STYLE: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  HR_REVIEW: 'bg-amber-100 text-amber-700',
  FINANCE_REVIEW: 'bg-purple-100 text-purple-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

function BudgetsTab({ cycleId }: { cycleId: string }) {
  const [budgets, setBudgets] = useState<any[]>([]);
  const [form, setForm] = useState({ orgUnitId: '', awardType: 'MERIT', budgetAmount: 0 });

  useEffect(() => { if (cycleId) load(); }, [cycleId]);
  async function load() { setBudgets(unwrap(await compWorkbenchApi.listBudgets(cycleId))); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await compWorkbenchApi.createBudget({ cycleId, ...form }); setForm({ orgUnitId: '', awardType: 'MERIT', budgetAmount: 0 }); load(); }
    catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <div><label className="text-xs text-gray-500">Org Unit ID</label><input required value={form.orgUnitId} onChange={(e) => setForm({ ...form, orgUnitId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Award Type</label><select value={form.awardType} onChange={(e) => setForm({ ...form, awardType: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">{AWARD_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div><label className="text-xs text-gray-500">Budget Amount</label><input type="number" required value={form.budgetAmount} onChange={(e) => setForm({ ...form, budgetAmount: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Envelope</button>
      </form>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Org Unit</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-right">Budget</th><th className="px-3 py-2 text-right">Allocated</th><th className="px-3 py-2 text-right">Remaining</th></tr></thead>
          <tbody className="divide-y">
            {budgets.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No budget envelopes.</td></tr> : budgets.map((b) => (
              <tr key={b.id}>
                <td className="px-3 py-2 font-mono text-xs">{b.orgUnitId?.slice(0, 8)}</td>
                <td className="px-3 py-2">{b.awardType}</td>
                <td className="px-3 py-2 text-right">{money(b.budgetAmount)}</td>
                <td className="px-3 py-2 text-right">{money(b.allocatedAmount)}</td>
                <td className="px-3 py-2 text-right font-medium">{money(Number(b.budgetAmount) - Number(b.allocatedAmount))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AwardsTab({ cycleId }: { cycleId: string }) {
  const [budgets, setBudgets] = useState<any[]>([]);
  const [awards, setAwards] = useState<any[]>([]);
  const [form, setForm] = useState({ budgetId: '', employeeId: '', awardType: 'MERIT', currentSalary: 0, performanceRating: '', amount: 0 });
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => { if (cycleId) load(); }, [cycleId]);
  async function load() {
    setBudgets(unwrap(await compWorkbenchApi.listBudgets(cycleId)));
    setAwards(unwrap(await compWorkbenchApi.listAwards(cycleId)));
  }
  function resetForm() { setForm({ budgetId: '', employeeId: '', awardType: 'MERIT', currentSalary: 0, performanceRating: '', amount: 0 }); setEditingId(null); }
  function startEdit(a: any) {
    setEditingId(a.id);
    setForm({ budgetId: a.budgetId ?? '', employeeId: a.employeeId ?? '', awardType: a.awardType ?? 'MERIT', currentSalary: Number(a.currentSalary ?? 0), performanceRating: a.performanceRating ?? '', amount: Number(a.amount ?? 0) });
  }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingId) await compWorkbenchApi.updateAward(editingId, form.amount);
      else await compWorkbenchApi.proposeAward({ cycleId, ...form });
      resetForm(); load();
    }
    catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function act(fn: () => Promise<any>) {
    try { await fn(); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-6 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <div><label className="text-xs text-gray-500">Budget</label><select required value={form.budgetId} onChange={(e) => setForm({ ...form, budgetId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm"><option value="">—</option>{budgets.map((b) => <option key={b.id} value={b.id}>{b.awardType} · {b.orgUnitId?.slice(0, 6)}</option>)}</select></div>
        <div><label className="text-xs text-gray-500">Employee ID</label><input required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Type</label><select value={form.awardType} onChange={(e) => setForm({ ...form, awardType: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">{AWARD_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div><label className="text-xs text-gray-500">Rating</label><input value={form.performanceRating} onChange={(e) => setForm({ ...form, performanceRating: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Amount</label><input type="number" required value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div className="flex gap-1">
          <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">{editingId ? 'Save' : 'Propose'}</button>
          {editingId && <button type="button" onClick={resetForm} className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm">Cancel</button>}
        </div>
      </form>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Employee</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-left">Rating</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">
            {awards.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No awards.</td></tr> : awards.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2 font-mono text-xs">{a.employeeId?.slice(0, 8)}</td>
                <td className="px-3 py-2">{a.awardType}</td>
                <td className="px-3 py-2 text-right">{money(a.amount)}</td>
                <td className="px-3 py-2 text-xs">{a.performanceRating ?? '—'}</td>
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_STYLE[a.status]}`}>{a.status}</span></td>
                <td className="px-3 py-2"><div className="flex gap-2">
                  {(a.status === 'DRAFT' || a.status === 'REJECTED') && <button onClick={() => startEdit(a)} className="text-indigo-600 text-xs hover:underline">edit</button>}
                  {(a.status === 'DRAFT' || a.status === 'REJECTED') && <button onClick={() => act(() => compWorkbenchApi.submit(a.id))} className="text-blue-600 text-xs hover:underline">submit</button>}
                  {['SUBMITTED', 'HR_REVIEW', 'FINANCE_REVIEW'].includes(a.status) && <button onClick={() => act(() => compWorkbenchApi.approve(a.id))} className="text-green-600 text-xs hover:underline">approve</button>}
                  {['SUBMITTED', 'HR_REVIEW', 'FINANCE_REVIEW'].includes(a.status) && <button onClick={() => act(() => compWorkbenchApi.reject(a.id, prompt('Reason?') ?? undefined))} className="text-red-500 text-xs hover:underline">reject</button>}
                  {a.status === 'APPROVED' && !a.assignmentChangeId && <button onClick={() => act(() => compWorkbenchApi.execute(a.id, prompt('Assignment change ID?') ?? ''))} className="text-indigo-600 text-xs hover:underline">execute</button>}
                  {a.assignmentChangeId && <span className="text-xs text-gray-400">executed</span>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TotalCompTab() {
  const [form, setForm] = useState({ employeeId: '', baseSalary: 0, employerBenefits: 0 });
  const [result, setResult] = useState<any>(null);
  async function run() {
    if (!form.employeeId) return;
    try { const r = await compWorkbenchApi.totalComp(form); setResult(r.data?.data ?? r.data); }
    catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-gray-50 grid grid-cols-4 gap-2 items-end">
        <div><label className="text-xs text-gray-500">Employee ID</label><input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Base Salary</label><input type="number" value={form.baseSalary} onChange={(e) => setForm({ ...form, baseSalary: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Employer Benefits</label><input type="number" value={form.employerBenefits} onChange={(e) => setForm({ ...form, employerBenefits: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <button onClick={run} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Build Statement</button>
      </div>
      {result && (
        <div className="grid grid-cols-4 gap-3">
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Base Salary</p><p className="text-xl font-bold">{money(result.baseSalary)}</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Merit</p><p className="text-xl font-bold">{money(result.meritIncrease)}</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Bonus</p><p className="text-xl font-bold">{money(result.bonus)}</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Equity</p><p className="text-xl font-bold">{money(result.equityValue)}</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Employer Benefits</p><p className="text-xl font-bold">{money(result.employerBenefits)}</p></div>
          <div className="border rounded-lg p-3 bg-indigo-50"><p className="text-xs text-gray-500">Total Cash</p><p className="text-xl font-bold text-indigo-700">{money(result.totalCash)}</p></div>
          <div className="border rounded-lg p-3 bg-green-50 col-span-2"><p className="text-xs text-gray-500">Total Compensation</p><p className="text-2xl font-bold text-green-700">{money(result.totalCompensation)}</p></div>
        </div>
      )}
    </div>
  );
}

const TABS = ['Budget Envelopes', 'Award Worksheet', 'Total Comp Statement'];

export default function CompWorkbenchPage() {
  const [tab, setTab] = useState('Budget Envelopes');
  const [cycleId, setCycleId] = useState('');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Compensation Workbench</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Compensation parity — budget envelopes per org unit, budget-gated award worksheets,
          manager → HR → finance approval routing, salary-change execution, and total compensation statements.
        </p>
      </div>
      <div className="flex items-end gap-3">
        <div><label className="text-xs text-gray-500">Cycle ID</label><input value={cycleId} onChange={(e) => setCycleId(e.target.value)} placeholder="merit cycle id" className="w-72 border rounded px-2 py-1 text-sm font-mono" /></div>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {!cycleId && tab !== 'Total Comp Statement' && <p className="text-sm text-gray-400">Enter a cycle ID to begin.</p>}
      {tab === 'Budget Envelopes' && cycleId && <BudgetsTab cycleId={cycleId} />}
      {tab === 'Award Worksheet' && cycleId && <AwardsTab cycleId={cycleId} />}
      {tab === 'Total Comp Statement' && <TotalCompTab />}
    </div>
  );
}
