import { useState } from 'react';
import { Gauge, Play, AlertTriangle } from 'lucide-react';
import { manufacturingApi } from '../../api/manufacturing';

const unwrap = (res: any) => res.data?.data ?? res.data;
const num = (v: any) => Number(v) || 0;

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
};

const hoursLabel = (mins: number) => `${(num(mins) / 60).toFixed(1)}h`;

// Utilization → cell colour.
const cellColor = (pct: number) => {
  if (pct > 100) return 'bg-red-100 text-red-800 border-red-200';
  if (pct >= 85) return 'bg-amber-100 text-amber-800 border-amber-200';
  if (pct > 0) return 'bg-green-100 text-green-800 border-green-200';
  return 'bg-gray-50 text-gray-400 border-gray-100';
};

export default function CrpPage() {
  const today = new Date();
  const [from, setFrom] = useState(today.toISOString().slice(0, 10));
  const [to, setTo] = useState(addDays(today, 90));
  const [bucket, setBucket] = useState('week');
  const [includePlanned, setIncludePlanned] = useState(true);
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await manufacturingApi.getCapacityPlan({ from, to, bucket, includePlanned });
      setPlan(unwrap(res));
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? 'Failed to run capacity plan');
      setPlan(null);
    } finally {
      setLoading(false);
    }
  };

  const cellFor = (wc: any, period: string) =>
    wc.cells.find((c: any) => c.period === period);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Capacity Requirements Planning</h1>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Work-center load from planned and open production orders vs available capacity
          </p>
        </div>
        <div className="flex items-end gap-2 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bucket</label>
            <select value={bucket} onChange={(e) => setBucket(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm">
              <option value="week">Weekly</option>
              <option value="month">Monthly</option>
            </select>
          </div>
          <label className="flex items-center gap-2 px-2 py-2 text-sm text-gray-700 select-none">
            <input type="checkbox" checked={includePlanned} onChange={(e) => setIncludePlanned(e.target.checked)} />
            Include planned
          </label>
          <button onClick={run} disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            <Play className="h-4 w-4" /> {loading ? 'Running...' : 'Run CRP'}
          </button>
        </div>
      </div>

      {msg && <div className="p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">{msg}</div>}

      {plan && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Overall Utilization</p>
              <p className={`text-2xl font-bold mt-1 ${plan.summary.utilizationPct > 100 ? 'text-red-600' : 'text-gray-900'}`}>
                {plan.summary.utilizationPct}%
              </p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Total Load</p>
              <p className="text-2xl font-bold mt-1">{hoursLabel(plan.summary.totalLoadMinutes)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Available</p>
              <p className="text-2xl font-bold mt-1">{hoursLabel(plan.summary.totalAvailableMinutes)}</p>
            </div>
            <div className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">Overloaded Cells</p>
              <p className={`text-2xl font-bold mt-1 ${plan.summary.overloadedCells > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {plan.summary.overloadedCells}
              </p>
            </div>
          </div>

          {plan.summary.bottleneckWorkCenters.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-red-700 mb-1">
                <AlertTriangle className="h-4 w-4" /> Bottleneck work centers
              </div>
              <div className="flex flex-wrap gap-2">
                {plan.summary.bottleneckWorkCenters.map((b: any) => (
                  <span key={b.workCenterId} className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800">
                    {b.workCenterName} — {b.utilizationPct}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Load heatmap */}
          <div className="bg-white rounded-xl border overflow-x-auto">
            {plan.workCenters.length === 0 ? (
              <div className="p-8 text-center text-gray-400">
                No load in this window. Run MRP and release forecasts, or schedule production orders.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium sticky left-0 bg-gray-50">Work Center</th>
                    {plan.periods.map((p: string) => (
                      <th key={p} className="text-center px-3 py-2 text-xs text-gray-500 font-medium whitespace-nowrap">{p}</th>
                    ))}
                    <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Util.</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {plan.workCenters.map((wc: any) => (
                    <tr key={wc.workCenterId}>
                      <td className="px-4 py-2 font-medium text-gray-900 sticky left-0 bg-white whitespace-nowrap">{wc.workCenterName}</td>
                      {plan.periods.map((period: string) => {
                        const cell = cellFor(wc, period);
                        if (!cell) return <td key={period} className="px-3 py-2 text-center text-gray-300">·</td>;
                        return (
                          <td key={period} className="px-2 py-2 text-center">
                            <div className={`rounded-md border px-2 py-1 text-xs ${cellColor(cell.utilizationPct)}`}
                              title={`${hoursLabel(cell.loadMinutes)} / ${hoursLabel(cell.availableMinutes)}${cell.overloaded ? ` · over by ${hoursLabel(cell.overloadMinutes)}` : ''}`}>
                              <div className="font-semibold">{cell.utilizationPct}%</div>
                              <div className="opacity-75">{hoursLabel(cell.loadMinutes)}</div>
                            </div>
                          </td>
                        );
                      })}
                      <td className={`px-4 py-2 text-right font-semibold ${wc.utilizationPct > 100 ? 'text-red-600' : 'text-gray-700'}`}>
                        {wc.utilizationPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {!plan && !loading && (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-400">
          Choose a window and run CRP to see the work-center load profile.
        </div>
      )}
    </div>
  );
}
