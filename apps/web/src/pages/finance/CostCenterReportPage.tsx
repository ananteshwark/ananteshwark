import { useState, useEffect } from 'react';
import { Target, Play } from 'lucide-react';
import { controllingApi } from '../../api/controlling';

export default function CostCenterReportPage() {
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [rows, setRows] = useState<any[]>([]);
  const [cycles, setCycles] = useState<any[]>([]);
  const [selectedCycle, setSelectedCycle] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    controllingApi.costCenterReport(period)
      .then(res => setRows(res.data?.data ?? res.data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
    controllingApi.listCycles()
      .then(res => setCycles(res.data?.data ?? res.data ?? []))
      .catch(() => {});
  };

  useEffect(() => { load(); }, [period]);

  const runCycle = async () => {
    if (!selectedCycle) return;
    setMsg(null);
    try {
      await controllingApi.runCycle(selectedCycle, period);
      setMsg('Allocation cycle posted successfully');
      load();
    } catch {
      setMsg('Failed to run allocation cycle');
    }
  };

  const maxVal = Math.max(1, ...rows.map(r => Math.max(Number(r.budget) || 0, Number(r.actual) || 0)));

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Cost Center Report</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">Actual vs budget by cost center</p>
        </div>
        <div className="flex items-end gap-2">
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          {cycles.length > 0 && (
            <>
              <select value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Select allocation cycle...</option>
                {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={runCycle} disabled={!selectedCycle}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50">
                <Play className="h-4 w-4" /> Run
              </button>
            </>
          )}
        </div>
      </div>

      {msg && <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg text-sm">{msg}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cost Center</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Code</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Budget</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actual</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Variance</th>
                <th className="px-4 py-3 font-medium text-gray-600 w-1/3">Budget vs Actual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-gray-400">No cost center data for this period</td></tr>
              ) : rows.map((r, i) => {
                const budget = Number(r.budget) || 0;
                const actual = Number(r.actual) || 0;
                const variance = budget - actual;
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{r.code}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{budget.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{actual.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right font-medium ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {variance.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="relative h-4 bg-gray-100 rounded">
                        <div className="absolute top-0 left-0 h-4 bg-blue-200 rounded" style={{ width: `${(budget / maxVal) * 100}%` }} />
                        <div className={`absolute top-0 left-0 h-4 rounded ${actual > budget ? 'bg-red-400' : 'bg-blue-600'}`} style={{ width: `${(actual / maxVal) * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
