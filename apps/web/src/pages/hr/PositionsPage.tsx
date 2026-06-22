import { useState, useEffect } from 'react';
import { Briefcase, Plus, X, Users } from 'lucide-react';
import { positionsApi } from '../../api/positions';
import { hrApi } from '../../api/hr';

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-800',
  FILLED: 'bg-green-100 text-green-800',
  FROZEN: 'bg-orange-100 text-orange-800',
  CLOSED: 'bg-gray-100 text-gray-700',
};

export default function PositionsPage() {
  const [positions, setPositions] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [assignFor, setAssignFor] = useState<any | null>(null);
  const [assignEmp, setAssignEmp] = useState('');
  const [form, setForm] = useState({ positionCode: '', title: '', departmentId: '', gradeId: '', designationId: '', budgetedHeadcount: 1, description: '' });
  const [error, setError] = useState<string | null>(null);

  const unwrap = (res: any) => { const d = res.data?.data ?? res.data ?? {}; return d.items ?? d ?? []; };

  const load = () => {
    setLoading(true);
    Promise.all([
      positionsApi.list(),
      hrApi.getDepartments({ limit: 1000 }),
      hrApi.getDesignations({ limit: 500 }),
      positionsApi.listGrades(),
      positionsApi.headcountDashboard(),
      hrApi.getEmployees({ limit: 1000 }),
    ]).then(([pos, dept, desig, grd, dash, emp]) => {
      setPositions(unwrap(pos));
      setDepartments(unwrap(dept));
      setDesignations(unwrap(desig));
      setGrades(unwrap(grd));
      setDashboard(dash.data?.data ?? dash.data ?? null);
      setEmployees(unwrap(emp));
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const deptName = (id: string) => departments.find(d => d.id === id)?.name ?? '-';
  const gradeName = (id: string) => grades.find(g => g.id === id)?.name ?? '-';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload: any = { ...form, budgetedHeadcount: Number(form.budgetedHeadcount) };
      ['departmentId', 'gradeId', 'designationId'].forEach(k => { if (!payload[k]) delete payload[k]; });
      await positionsApi.create(payload);
      setShowModal(false);
      setForm({ positionCode: '', title: '', departmentId: '', gradeId: '', designationId: '', budgetedHeadcount: 1, description: '' });
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to create position');
    }
  };

  const doAssign = async () => {
    if (!assignFor || !assignEmp) return;
    try {
      await positionsApi.assign(assignFor.id, assignEmp);
      setAssignFor(null); setAssignEmp('');
      load();
    } catch { /* ignore */ }
  };

  const totalBudgeted = dashboard?.totalBudgeted ?? positions.reduce((s, p) => s + (p.budgetedHeadcount || 0), 0);
  const totalFilled = dashboard?.totalFilled ?? positions.reduce((s, p) => s + (p.filledHeadcount || 0), 0);
  const totalVacant = totalBudgeted - totalFilled;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Position Management</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">Headcount planning &amp; budgeted positions</p>
        </div>
        <button onClick={() => { setError(null); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus className="h-4 w-4" /> New Position
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Budgeted', value: totalBudgeted, color: 'text-gray-900' },
          { label: 'Filled', value: totalFilled, color: 'text-green-600' },
          { label: 'Vacant', value: totalVacant, color: 'text-orange-600' },
          { label: 'Utilization', value: totalBudgeted ? `${Math.round((totalFilled / totalBudgeted) * 100)}%` : '0%', color: 'text-blue-600' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wide">{c.label}</div>
            <div className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Title</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Department</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Grade</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Budgeted</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Filled</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Vacant</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {positions.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">No positions defined</td></tr>
              ) : positions.map(p => {
                const vacant = (p.budgetedHeadcount || 0) - (p.filledHeadcount || 0);
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.positionCode}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{p.title}</td>
                    <td className="px-4 py-3 text-gray-600">{deptName(p.departmentId)}</td>
                    <td className="px-4 py-3 text-gray-600">{gradeName(p.gradeId)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{p.budgetedHeadcount}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{p.filledHeadcount}</td>
                    <td className={`px-4 py-3 text-right font-medium ${vacant > 0 ? 'text-orange-600' : 'text-gray-400'}`}>{vacant}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] ?? 'bg-gray-100'}`}>{p.status}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {vacant > 0 && (
                        <button onClick={() => { setAssignFor(p); setAssignEmp(''); }} className="inline-flex items-center gap-1 text-blue-600 hover:underline text-xs">
                          <Users className="h-3.5 w-3.5" /> Assign
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">New Position</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submit} className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                  <input required value={form.positionCode} onChange={e => setForm(f => ({ ...f, positionCode: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Budgeted HC *</label>
                  <input required type="number" min={1} value={form.budgetedHeadcount} onChange={e => setForm(f => ({ ...f, budgetedHeadcount: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select...</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Grade</label>
                  <select value={form.gradeId} onChange={e => setForm(f => ({ ...f, gradeId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select...</option>
                    {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Designation</label>
                <select value={form.designationId} onChange={e => setForm(f => ({ ...f, designationId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {assignFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">Assign to {assignFor.title}</h2>
              <button onClick={() => setAssignFor(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                <select value={assignEmp} onChange={e => setAssignEmp(e.target.value)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select employee...</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</option>)}
                </select>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setAssignFor(null)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button onClick={doAssign} disabled={!assignEmp} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Assign</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
