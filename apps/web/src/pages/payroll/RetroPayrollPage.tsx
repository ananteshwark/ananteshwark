import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { payrollApi } from '../../api/payroll';

interface ArrearsRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  fromPeriod: string;
  toPeriod: string;
  affectedMonths: number;
  oldMonthlyGross: number;
  newMonthlyGross: number;
  monthlyDifference: number;
  arrears: number;
}

interface Run {
  id: string;
  name: string;
  payPeriodMonth: number;
  payPeriodYear: number;
  status: string;
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);

const now = new Date();

export default function RetroPayrollPage() {
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<ArrearsRow[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const loadRuns = async () => {
    try {
      const res = await payrollApi.getRuns({ limit: 100 });
      const data = res.data?.data ?? res.data;
      setRuns(data?.items ?? data ?? []);
    } catch {
      /* non-fatal */
    }
  };

  useEffect(() => {
    loadRuns();
  }, []);

  const handleDetect = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await payrollApi.detectArrears(month, year);
      setRows(res.data?.data ?? res.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to detect arrears');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!selectedRun) {
      setError('Select a payroll run to apply arrears to');
      return;
    }
    setApplying(true);
    setError(null);
    setMessage(null);
    try {
      const res = await payrollApi.applyArrearsToRun(selectedRun);
      const result = res.data?.data ?? res.data;
      setMessage(
        `Applied arrears to ${result?.applied ?? 0} payslip(s), total ${fmt(result?.total ?? 0)}.`,
      );
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to apply arrears');
    } finally {
      setApplying(false);
    }
  };

  const totalArrears = rows.reduce((s, r) => s + (r.arrears ?? 0), 0);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Retro Payroll &amp; Arrears</h1>
        <p className="text-sm text-gray-500 mt-1">
          Detect salary changes that took effect in prior periods and apply arrears to a payroll run.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{new Date(2000, m - 1).toLocaleString('en', { month: 'long' })}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <button onClick={handleDetect} disabled={loading}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          <Search className="w-4 h-4" /> {loading ? 'Detecting...' : 'Detect Arrears'}
        </button>
      </div>

      {error && <p className="text-red-600 mb-3">{error}</p>}
      {message && <p className="text-green-700 mb-3">{message}</p>}

      <div className="overflow-x-auto rounded-lg border border-gray-200 mb-6">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Months</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Old (mo)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">New (mo)</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Arrears</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No arrears detected. Run a detection above.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.employeeId} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-900">{r.employeeName || '—'}</td>
                <td className="px-4 py-3 text-sm font-mono text-gray-500">{r.employeeCode || '—'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{r.fromPeriod} → {r.toPeriod}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">{r.affectedMonths}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">{fmt(r.oldMonthlyGross)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">{fmt(r.newMonthlyGross)}</td>
                <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{fmt(r.arrears)}</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="bg-gray-50 font-medium">
                <td colSpan={6} className="px-4 py-3 text-sm text-right text-gray-700">Total Arrears</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900">{fmt(totalArrears)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Apply to Payroll Run</label>
          <select value={selectedRun} onChange={(e) => setSelectedRun(e.target.value)}
            className="min-w-[280px] border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">Select a run</option>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>{r.name} ({r.status})</option>
            ))}
          </select>
        </div>
        <button onClick={handleApply} disabled={applying || !selectedRun}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50">
          {applying ? 'Applying...' : 'Apply to Run'}
        </button>
      </div>
    </div>
  );
}
