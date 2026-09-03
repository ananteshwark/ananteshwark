import { useState, useEffect } from 'react';
import { Radar, RefreshCw, ShieldAlert } from 'lucide-react';
import { aiAnomaliesApi } from '../../api/aiAnomalies';

const SEVERITY_COLORS: Record<string, string> = {
  HIGH: 'bg-red-100 text-red-700',
  MEDIUM: 'bg-amber-100 text-amber-700',
  LOW: 'bg-gray-100 text-gray-600',
};

const MODULE_LABELS: Record<string, string> = {
  expenses: 'Expenses', procurement: 'Procurement', sales: 'Sales',
  finance: 'Finance', payroll: 'Payroll', crm: 'CRM',
};

export default function AnomaliesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState('');

  const load = () => {
    setLoading(true);
    aiAnomaliesApi.scan(moduleFilter ? [moduleFilter] : undefined)
      .then(r => setData(r.data?.data ?? r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [moduleFilter]);

  const findings = data?.findings ?? [];
  const coverage = data?.coverage ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Radar className="h-6 w-6 text-blue-600" /> AI Anomaly Detection
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Statistical screening across every module — outliers, duplicates, and volume spikes
          </p>
        </div>
        <div className="flex gap-2">
          <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All modules</option>
            {Object.entries(MODULE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <RefreshCw className="h-4 w-4" /> Rescan
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {coverage.map((c: any) => (
          <div key={c.module} className={`rounded-xl border p-3 ${c.available ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
            <p className="text-xs font-medium text-gray-500">{MODULE_LABELS[c.module] ?? c.module}</p>
            <p className="text-lg font-bold">{data?.summary?.[c.module] ?? 0}</p>
            <p className="text-[10px] text-gray-400">{c.checks.length} check{c.checks.length === 1 ? '' : 's'}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Scanning…</div>
        ) : findings.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <ShieldAlert className="h-10 w-10 mx-auto mb-2 text-green-400" />
            No anomalies detected across the scanned modules.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Severity', 'Module', 'Check', 'Finding', 'Detail'].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {findings.map((f: any, i: number) => (
                <tr key={`${f.subjectId}-${f.check}-${i}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SEVERITY_COLORS[f.severity]}`}>{f.severity}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{MODULE_LABELS[f.module] ?? f.module}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{f.check}</td>
                  <td className="px-4 py-2 font-medium max-w-[280px]">{f.title}</td>
                  <td className="px-4 py-2 text-gray-500 max-w-[280px]">{f.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
