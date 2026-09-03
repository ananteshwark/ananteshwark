import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { hrApi } from '../../api/hr';

interface Exit {
  id: string;
  employeeId: string;
  employeeCode?: string;
  employeeName?: string;
  lastWorkingDate: string;
  reason: string;
  status: string;
  rehireEligible?: boolean | null;
  notes?: string | null;
}

interface ChecklistItem {
  id: string;
  item: string;
  assignedDept?: string | null;
  status: string;
}

interface Fnf {
  id: string;
  pendingSalary: number;
  leaveEncashment: number;
  gratuity: number;
  deductions: number;
  netAmount: number;
  status: string;
}

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
}

const REASONS = ['RESIGNATION', 'RETIREMENT', 'TERMINATION', 'OTHER'];
const STATUSES = ['INITIATED', 'IN_CLEARANCE', 'SETTLED', 'COMPLETED'];

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);

export default function ExitManagementPage() {
  const [exits, setExits] = useState<Exit[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ employeeId: '', lastWorkingDate: '', reason: 'RESIGNATION', notes: '' });
  const [submitting, setSubmitting] = useState(false);

  const [detail, setDetail] = useState<any | null>(null);
  const [fnfForm, setFnfForm] = useState({ pendingSalary: 0, leaveEncashment: 0, gratuity: 0, deductions: 0 });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [exitRes, empRes] = await Promise.all([
        hrApi.getExits(),
        hrApi.getEmployees({ limit: 100 }),
      ]);
      setExits(exitRes.data?.data ?? exitRes.data ?? []);
      const empData = empRes.data?.data ?? empRes.data;
      setEmployees(empData?.items ?? empData ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load exits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const openDetail = async (id: string) => {
    try {
      const res = await hrApi.getExit(id);
      const d = res.data?.data ?? res.data;
      setDetail(d);
      const fnf: Fnf | null = d?.fnf ?? null;
      setFnfForm({
        pendingSalary: fnf?.pendingSalary ?? 0,
        leaveEncashment: fnf?.leaveEncashment ?? 0,
        gratuity: fnf?.gratuity ?? 0,
        deductions: fnf?.deductions ?? 0,
      });
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load exit detail');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await hrApi.createExit(form);
      setShowCreate(false);
      setForm({ employeeId: '', lastWorkingDate: '', reason: 'RESIGNATION', notes: '' });
      fetchData();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to create exit');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleChecklist = async (item: ChecklistItem) => {
    const next = item.status === 'CLEARED' ? 'PENDING' : 'CLEARED';
    await hrApi.updateExitChecklistItem(item.id, { status: next });
    if (detail) openDetail(detail.id);
  };

  const updateStatus = async (status: string) => {
    if (!detail) return;
    await hrApi.updateExit(detail.id, { status });
    openDetail(detail.id);
    fetchData();
  };

  const computeFnf = async () => {
    if (!detail) return;
    try {
      await hrApi.computeFnf(detail.id, fnfForm);
      openDetail(detail.id);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to compute F&F');
    }
  };

  const approveFnf = async () => {
    if (!detail) return;
    try {
      await hrApi.approveFnf(detail.id);
      openDetail(detail.id);
      fetchData();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to approve F&F');
    }
  };

  const payFnf = async () => {
    if (!detail) return;
    try {
      await hrApi.payFnf(detail.id);
      openDetail(detail.id);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to mark F&F paid');
    }
  };

  const fnfNet = fnfForm.pendingSalary + fnfForm.leaveEncashment + fnfForm.gratuity - fnfForm.deductions;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Exit Management</h1>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
          <Plus className="w-4 h-4" /> New Exit
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600 mb-3">{error}</p>}

      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Working Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {exits.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No exit requests</td></tr>
              )}
              {exits.map((ex) => (
                <tr key={ex.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{ex.employeeName || ex.employeeId}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{ex.lastWorkingDate}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{ex.reason}</td>
                  <td className="px-4 py-3 text-sm"><span className="px-2 py-1 rounded-full bg-gray-100 text-gray-700 text-xs">{ex.status}</span></td>
                  <td className="px-4 py-3 text-sm text-right">
                    <button className="text-indigo-600 hover:underline" onClick={() => openDetail(ex.id)}>Manage</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">New Exit Request</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                <select required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select employee</option>
                  {employees.map((emp) => (<option key={emp.id} value={emp.id}>{emp.employeeCode} - {emp.firstName} {emp.lastName}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Working Date</label>
                <input type="date" required value={form.lastWorkingDate} onChange={(e) => setForm({ ...form, lastWorkingDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <select value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {REASONS.map((r) => (<option key={r} value={r}>{r}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">{submitting ? 'Saving...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setDetail(null)}>
          <div className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b sticky top-0 bg-white">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{detail.employeeName || detail.employeeId}</h2>
                <p className="text-sm text-gray-500">{detail.reason} · LWD {detail.lastWorkingDate}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="px-6 py-4 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={detail.status} onChange={(e) => updateStatus(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Clearance Checklist</h3>
                <div className="space-y-2">
                  {(detail.checklist ?? []).map((item: ChecklistItem) => (
                    <label key={item.id} className="flex items-center gap-3 p-2 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" checked={item.status === 'CLEARED'} onChange={() => toggleChecklist(item)}
                        className="h-4 w-4 text-indigo-600 rounded" />
                      <span className="text-sm text-gray-900 flex-1">{item.item}</span>
                      {item.assignedDept && <span className="text-xs text-gray-400">{item.assignedDept}</span>}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Full &amp; Final Settlement</h3>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ['pendingSalary', 'Pending Salary'],
                    ['leaveEncashment', 'Leave Encashment'],
                    ['gratuity', 'Gratuity'],
                    ['deductions', 'Deductions'],
                  ] as const).map(([key, label]) => (
                    <div key={key}>
                      <label className="block text-xs text-gray-500 mb-1">{label}</label>
                      <input type="number" value={(fnfForm as any)[key]}
                        onChange={(e) => setFnfForm({ ...fnfForm, [key]: Number(e.target.value) })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-3 px-1">
                  <span className="text-sm text-gray-600">Net Settlement</span>
                  <span className="text-lg font-semibold text-gray-900">{fmt(fnfNet)}</span>
                </div>
                {detail.fnf && <p className="text-xs text-gray-500 mt-1">Current status: {detail.fnf.status}</p>}
                <div className="flex gap-2 mt-3">
                  <button onClick={computeFnf} className="px-3 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Save F&amp;F</button>
                  <button onClick={approveFnf} disabled={!detail.fnf || detail.fnf.status !== 'DRAFT'}
                    className="px-3 py-2 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">Approve</button>
                  <button onClick={payFnf} disabled={!detail.fnf || detail.fnf.status !== 'APPROVED'}
                    className="px-3 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">Mark Paid</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
