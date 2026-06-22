import { useState, useEffect } from 'react';
import { Clock, Play } from 'lucide-react';
import { timeEvalApi } from '../../api/timeEvaluation';

export default function TimeEvaluationPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    timeEvalApi.report(month, year)
      .then(res => setRows(res.data?.data ?? res.data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [month, year]);

  const runEval = async () => {
    setRunning(true);
    setSummary(null);
    try {
      const res = await timeEvalApi.run(month, year);
      const r = res.data?.data ?? res.data;
      setSummary(`Evaluated ${r?.totalEvaluated ?? 0} records — ${r?.totalAbsent ?? 0} absent, ${r?.totalLopDays ?? 0} LOP days, ${r?.totalOtHours ?? 0} OT hours`);
      load();
    } catch {
      setSummary('Evaluation failed');
    } finally {
      setRunning(false);
    }
  };

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Time Evaluation</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">Process attendance into late / overtime / LOP for payroll</p>
        </div>
        <div className="flex items-end gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={runEval} disabled={running} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
            <Play className="h-4 w-4" /> {running ? 'Running...' : 'Run Evaluation'}
          </button>
        </div>
      </div>

      {summary && <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">{summary}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Days Worked</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Working Hrs</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Late Days</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">OT Hours</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Absent</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">LOP Days</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No evaluation data — run evaluation for this month</td></tr>
              ) : rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{r.employeeName}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{r.daysWorked}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{r.totalWorkingHours}</td>
                  <td className={`px-4 py-3 text-right ${r.lateDays > 0 ? 'text-yellow-600 font-medium' : 'text-gray-400'}`}>{r.lateDays}</td>
                  <td className={`px-4 py-3 text-right ${r.overtimeHours > 0 ? 'text-purple-600 font-medium' : 'text-gray-400'}`}>{r.overtimeHours}</td>
                  <td className={`px-4 py-3 text-right ${r.absentDays > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{r.absentDays}</td>
                  <td className={`px-4 py-3 text-right ${r.lopDays > 0 ? 'text-red-600 font-medium' : 'text-gray-400'}`}>{r.lopDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
