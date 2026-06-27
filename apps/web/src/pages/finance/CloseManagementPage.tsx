import { useState, useEffect } from 'react';
import { financeApi } from '../../api/finance';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TASK_STATUS: Record<string, string> = {
  OPEN: 'bg-gray-100 text-gray-600', IN_PROGRESS: 'bg-blue-100 text-blue-700',
  PREPARED: 'bg-yellow-100 text-yellow-700', CERTIFIED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700',
};
const RECON_STATUS = TASK_STATUS;
const TASK_TYPES = ['RECONCILIATION', 'JOURNAL', 'REPORT', 'ACCRUAL', 'REVIEW', 'OTHER'];

const TASK_ACTIONS: Record<string, string[]> = {
  OPEN: ['start', 'prepare'], IN_PROGRESS: ['prepare'], PREPARED: ['certify', 'reject'], CERTIFIED: ['reopen'], REJECTED: ['prepare'],
};
const RECON_ACTIONS: Record<string, string[]> = {
  OPEN: ['prepare'], PREPARED: ['certify', 'reject'], REJECTED: ['prepare'], CERTIFIED: [],
};

export default function CloseManagementPage() {
  const [periodId, setPeriodId] = useState('');
  const [tasks, setTasks] = useState<any[]>([]);
  const [recons, setRecons] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [taskForm, setTaskForm] = useState({ title: '', taskType: 'RECONCILIATION', dueDate: '', accountId: '' });
  const [reconForm, setReconForm] = useState({ accountId: '', asOfDate: '' });
  const [tab, setTab] = useState<'tasks' | 'recons'>('tasks');

  async function load() {
    if (!periodId) return;
    setTasks(unwrap(await financeApi.listCloseTasks({ periodId })));
    setRecons(unwrap(await financeApi.listReconciliations(periodId)));
    const d = await financeApi.closeDashboard(periodId);
    setDashboard(d.data?.data ?? d.data);
  }

  useEffect(() => { if (periodId) load(); }, [periodId]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    await financeApi.createCloseTask({ periodId, ...taskForm, accountId: taskForm.accountId || undefined });
    setTaskForm({ title: '', taskType: 'RECONCILIATION', dueDate: '', accountId: '' });
    load();
  }
  async function taskAction(id: string, action: string) {
    const reason = action === 'reject' ? prompt('Reject reason:') || '' : undefined;
    await financeApi.transitionCloseTask(id, action, reason ? { reason } : {});
    load();
  }
  async function addRecon(e: React.FormEvent) {
    e.preventDefault();
    await financeApi.createReconciliation({ periodId, accountId: reconForm.accountId, asOfDate: reconForm.asOfDate || undefined });
    setReconForm({ accountId: '', asOfDate: '' });
    load();
  }
  async function addItem(id: string) {
    const desc = prompt('Item description:'); if (!desc) return;
    const amt = prompt('Amount:'); if (amt == null) return;
    await financeApi.addReconScheduleItem(id, { description: desc, amount: Number(amt) });
    load();
  }
  async function reconAct(id: string, action: string) {
    const reason = action === 'reject' ? prompt('Reject reason:') || '' : undefined;
    await financeApi.reconAction(id, action, reason ? { reason } : {});
    load();
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Financial Close Management</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle ARCS parity — close task assignment with preparer/reviewer certification, balance-sheet
          reconciliations (variance blocks sign-off), and a close calendar dashboard with breach alerts.
        </p>
      </div>

      <div className="flex gap-2 items-center">
        <label className="text-sm text-gray-600">Period ID:</label>
        <input value={periodId} onChange={(e) => setPeriodId(e.target.value)} placeholder="accounting period UUID" className="border rounded px-2 py-1 text-sm font-mono w-80" />
        <button onClick={load} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Load</button>
      </div>

      {dashboard && (
        <div className="grid grid-cols-5 gap-3">
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Completion</p><p className="text-2xl font-bold">{dashboard.completionPct}%</p><p className="text-xs text-gray-400">{dashboard.certified}/{dashboard.total} certified</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Open / In-Progress</p><p className="text-2xl font-bold">{(dashboard.statusCounts.OPEN ?? 0) + (dashboard.statusCounts.IN_PROGRESS ?? 0)}</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Prepared</p><p className="text-2xl font-bold text-yellow-600">{dashboard.statusCounts.PREPARED ?? 0}</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Overdue</p><p className={`text-2xl font-bold ${dashboard.overdue > 0 ? 'text-red-600' : ''}`}>{dashboard.overdue}</p></div>
          <div className={`border rounded-lg p-3 ${dashboard.readyToClose ? 'bg-green-50' : ''}`}><p className="text-xs text-gray-500">Ready to Close</p><p className={`text-2xl font-bold ${dashboard.readyToClose ? 'text-green-600' : 'text-gray-400'}`}>{dashboard.readyToClose ? 'YES' : 'NO'}</p></div>
        </div>
      )}

      <div className="flex gap-1 border-b">
        {(['tasks', 'recons'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t === 'tasks' ? 'Close Tasks' : 'Reconciliations'}</button>
        ))}
      </div>

      {tab === 'tasks' && (
        <div className="space-y-3">
          {periodId && (
            <form onSubmit={addTask} className="flex gap-2 items-end bg-gray-50 p-3 rounded-lg">
              <div className="flex-1"><label className="text-xs text-gray-500">Title</label><input required value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
              <div><label className="text-xs text-gray-500">Type</label><select value={taskForm.taskType} onChange={(e) => setTaskForm({ ...taskForm, taskType: e.target.value })} className="border rounded px-2 py-1 text-sm">{TASK_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
              <div><label className="text-xs text-gray-500">Due</label><input type="date" required value={taskForm.dueDate} onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })} className="border rounded px-2 py-1 text-sm" /></div>
              <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Task</button>
            </form>
          )}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Title</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Due</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Actions</th></tr></thead>
              <tbody className="divide-y">
                {tasks.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">{periodId ? 'No tasks.' : 'Enter a period ID.'}</td></tr> : tasks.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium">{t.title}</td>
                    <td className="px-3 py-2 text-xs">{t.taskType}</td>
                    <td className="px-3 py-2 text-xs">{t.dueDate}</td>
                    <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${TASK_STATUS[t.status]}`}>{t.status}</span></td>
                    <td className="px-3 py-2"><div className="flex gap-2">{(TASK_ACTIONS[t.status] ?? []).map((a) => <button key={a} onClick={() => taskAction(t.id, a)} className="text-indigo-600 text-xs hover:underline">{a}</button>)}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'recons' && (
        <div className="space-y-3">
          {periodId && (
            <form onSubmit={addRecon} className="flex gap-2 items-end bg-gray-50 p-3 rounded-lg">
              <div className="flex-1"><label className="text-xs text-gray-500">Account ID</label><input required value={reconForm.accountId} onChange={(e) => setReconForm({ ...reconForm, accountId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
              <div><label className="text-xs text-gray-500">As of date</label><input type="date" value={reconForm.asOfDate} onChange={(e) => setReconForm({ ...reconForm, asOfDate: e.target.value })} className="border rounded px-2 py-1 text-sm" /></div>
              <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Reconciliation</button>
            </form>
          )}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Account</th><th className="px-3 py-2 text-right">GL Balance</th><th className="px-3 py-2 text-right">Supporting</th><th className="px-3 py-2 text-right">Variance</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Actions</th></tr></thead>
              <tbody className="divide-y">
                {recons.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No reconciliations.</td></tr> : recons.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs">{r.accountId?.slice(0, 8)}</td>
                    <td className="px-3 py-2 text-right">{money(r.glBalance)}</td>
                    <td className="px-3 py-2 text-right">{money(r.supportingBalance)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${Number(r.variance) !== 0 ? 'text-red-600' : 'text-green-600'}`}>{money(r.variance)}</td>
                    <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${RECON_STATUS[r.status]}`}>{r.status}</span></td>
                    <td className="px-3 py-2"><div className="flex gap-2">
                      {r.status !== 'CERTIFIED' && <button onClick={() => addItem(r.id)} className="text-gray-600 text-xs hover:underline">+item</button>}
                      {r.status !== 'CERTIFIED' && <button onClick={() => financeApi.refreshReconciliation(r.id).then(load)} className="text-gray-600 text-xs hover:underline">refresh</button>}
                      {(RECON_ACTIONS[r.status] ?? []).map((a) => <button key={a} onClick={() => reconAct(r.id, a)} className="text-indigo-600 text-xs hover:underline">{a}</button>)}
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
