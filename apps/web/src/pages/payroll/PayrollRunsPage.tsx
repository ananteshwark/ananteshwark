import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { payrollApi } from '../../api/payroll';

interface PayrollRun {
  id: string;
  name: string;
  payPeriodMonth: number;
  payPeriodYear: number;
  runType: string;
  status: string;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  totalEmployerCost: number;
  employeeCount: number;
}

const statusBadge: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PROCESSING: 'bg-amber-100 text-amber-800',
  PROCESSED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-indigo-100 text-indigo-800',
  PAID: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function PayrollRunsPage() {
  const navigate = useNavigate();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const now = new Date();
  const [form, setForm] = useState({ payPeriodMonth: now.getMonth() + 1, payPeriodYear: now.getFullYear(), runType: 'REGULAR' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchRuns = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await payrollApi.getRuns();
      const data = res.data?.data ?? res.data;
      setRuns(data?.items ?? data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load runs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRuns();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await payrollApi.createRun({
        payPeriodMonth: Number(form.payPeriodMonth),
        payPeriodYear: Number(form.payPeriodYear),
        runType: form.runType,
      });
      setShowModal(false);
      fetchRuns();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Failed to create run');
    } finally {
      setSubmitting(false);
    }
  };

  const runAction = async (id: string, action: 'process' | 'approve' | 'markPaid' | 'cancel') => {
    setBusyId(id);
    setError(null);
    try {
      if (action === 'process') await payrollApi.processRun(id);
      else if (action === 'approve') await payrollApi.approveRun(id);
      else if (action === 'markPaid') await payrollApi.markPaid(id);
      else if (action === 'cancel') await payrollApi.cancelRun(id);
      fetchRuns();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? `Failed to ${action}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Payroll Runs</h1>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
          <Plus className="w-4 h-4" /> New Run
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600 mb-4">{error}</p>}

      {!loading && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Emp</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gross</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {runs.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No payroll runs</td></tr>
              )}
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-indigo-600 cursor-pointer hover:underline" onClick={() => navigate(`/payroll/runs/${r.id}`)}>
                    {MONTHS[r.payPeriodMonth - 1]} {r.payPeriodYear}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{r.runType}</td>
                  <td className="px-4 py-3 text-sm text-center text-gray-700">{r.employeeCount}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900">{fmt(r.totalGross)}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{fmt(r.totalNet)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge[r.status] ?? 'bg-gray-100 text-gray-700'}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    {(r.status === 'DRAFT' || r.status === 'PROCESSED') && (
                      <button disabled={busyId === r.id} onClick={() => runAction(r.id, 'process')} className="text-xs text-blue-600 hover:underline disabled:opacity-50">Process</button>
                    )}
                    {r.status === 'PROCESSED' && (
                      <button disabled={busyId === r.id} onClick={() => runAction(r.id, 'approve')} className="text-xs text-indigo-600 hover:underline disabled:opacity-50">Approve</button>
                    )}
                    {r.status === 'APPROVED' && (
                      <button disabled={busyId === r.id} onClick={() => runAction(r.id, 'markPaid')} className="text-xs text-green-600 hover:underline disabled:opacity-50">Mark Paid</button>
                    )}
                    {(r.status === 'DRAFT' || r.status === 'PROCESSED') && (
                      <button disabled={busyId === r.id} onClick={() => runAction(r.id, 'cancel')} className="text-xs text-red-600 hover:underline disabled:opacity-50">Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">New Payroll Run</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                  <select value={form.payPeriodMonth} onChange={(e) => setForm({ ...form, payPeriodMonth: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {MONTHS.map((m, i) => (<option key={m} value={i + 1}>{m}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                  <input type="number" value={form.payPeriodYear} onChange={(e) => setForm({ ...form, payPeriodYear: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Run Type</label>
                <select value={form.runType} onChange={(e) => setForm({ ...form, runType: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="REGULAR">Regular</option>
                  <option value="OFF_CYCLE">Off Cycle</option>
                  <option value="BONUS">Bonus</option>
                  <option value="ARREARS">Arrears</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {submitting ? 'Creating...' : 'Create Run'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
