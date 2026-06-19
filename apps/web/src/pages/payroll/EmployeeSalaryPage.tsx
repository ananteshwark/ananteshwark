import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { payrollApi } from '../../api/payroll';

interface ResolvedComponent {
  code: string;
  name: string;
  type: string;
  amount: number;
}

interface EmployeeSalary {
  id: string;
  employeeId: string;
  employeeCode?: string;
  employeeName?: string;
  ctc: number;
  effectiveFrom: string;
  components?: ResolvedComponent[];
}

interface Structure {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);

export default function EmployeeSalaryPage() {
  const [salaries, setSalaries] = useState<EmployeeSalary[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [structures, setStructures] = useState<Structure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({ employeeId: '', structureId: '', ctc: 0, effectiveFrom: '2026-01-01' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [salRes, empRes, structRes] = await Promise.all([
        payrollApi.getSalaries(),
        payrollApi.getEmployees({ limit: 100 }),
        payrollApi.getStructures(),
      ]);
      setSalaries(salRes.data?.data ?? salRes.data ?? []);
      const empData = empRes.data?.data ?? empRes.data;
      setEmployees(empData?.items ?? empData ?? []);
      setStructures(structRes.data?.data ?? structRes.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load salaries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await payrollApi.assignSalary({
        employeeId: form.employeeId,
        structureId: form.structureId || undefined,
        ctc: Number(form.ctc),
        effectiveFrom: form.effectiveFrom,
      });
      setShowModal(false);
      setForm({ employeeId: '', structureId: '', ctc: 0, effectiveFrom: '2026-01-01' });
      fetchData();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Failed to assign salary');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Employee Salaries</h1>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" /> Assign Salary
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Annual CTC</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Effective From</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Breakdown</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {salaries.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No salaries assigned</td></tr>
              )}
              {salaries.map((s) => (
                <>
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{s.employeeName ?? '—'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500">{s.employeeCode ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{fmt(s.ctc)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{s.effectiveFrom}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <button className="text-indigo-600 hover:underline" onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                        {expanded === s.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                  {expanded === s.id && (
                    <tr key={`${s.id}-detail`}>
                      <td colSpan={5} className="px-6 py-4 bg-gray-50">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {(s.components ?? []).map((c) => (
                            <div key={c.code} className="flex justify-between bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
                              <span className="text-gray-600">{c.name}</span>
                              <span className="font-medium text-gray-900">{fmt(c.amount)}/mo</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Assign Salary</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                <select required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select employee</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>{emp.employeeCode} - {emp.firstName} {emp.lastName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Salary Structure (optional)</label>
                <select value={form.structureId} onChange={(e) => setForm({ ...form, structureId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Standard default</option>
                  {structures.map((s) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Annual CTC (₹)</label>
                <input type="number" required min="0" value={form.ctc} onChange={(e) => setForm({ ...form, ctc: Number(e.target.value) })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="1200000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Effective From</label>
                <input type="date" required value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {submitting ? 'Saving...' : 'Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
