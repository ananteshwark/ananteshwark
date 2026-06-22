import { useState, useEffect } from 'react';
import { Play, ArrowRightCircle, AlertTriangle } from 'lucide-react';
import { manufacturingApi } from '../../api/manufacturing';

const TYPE_LABELS: Record<string, string> = {
  PLANNED_PRODUCTION: 'Production',
  PLANNED_PO: 'Purchase',
};
const STATUS_COLORS: Record<string, string> = {
  PLANNED: 'bg-blue-100 text-blue-700',
  CONVERTED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

export default function MrpPage() {
  const [planned, setPlanned] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [horizonDays, setHorizonDays] = useState('90');
  const [lastRun, setLastRun] = useState<any>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    manufacturingApi.getPlannedOrders()
      .then(r => setPlanned(r.data?.data ?? r.data ?? []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const runMrp = async () => {
    setRunning(true);
    try {
      const r = await manufacturingApi.runMrp({ horizonDays: parseInt(horizonDays, 10) });
      setLastRun(r.data?.data ?? r.data);
      load();
    } finally { setRunning(false); }
  };

  const convert = async (id: string) => {
    setActing(id);
    try { await manufacturingApi.convertPlannedOrder(id); load(); } finally { setActing(null); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Material Requirements Planning</h1>
          <p className="text-sm text-gray-500 mt-0.5">Net demand vs supply; planned production and purchase orders</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Horizon (days)</label>
            <input type="number" className="border rounded-lg px-3 py-2 text-sm w-28" value={horizonDays} onChange={e => setHorizonDays(e.target.value)} />
          </div>
          <button onClick={runMrp} disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            <Play className="h-4 w-4" /> {running ? 'Running...' : 'Run MRP'}
          </button>
        </div>
      </div>

      {lastRun && (
        <div className="grid grid-cols-4 gap-4">
          {[
            ['Planned Orders', lastRun.plannedOrdersCreated],
            ['Production', lastRun.plannedProduction],
            ['Purchase', lastRun.plannedPurchase],
            ['Exceptions', lastRun.exceptions],
          ].map(([label, val]) => (
            <div key={label as string} className="bg-white rounded-xl border p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-2xl font-bold mt-1">{val as number}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl border">
        {loading ? <div className="p-8 text-center text-gray-400">Loading...</div> : planned.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No planned orders. Run MRP to generate them.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>{['Item', 'Type', 'Quantity', 'Due Date', 'Source', 'Status', ''].map(h => <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {planned.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">
                    {p.itemName}
                    {p.exceptionMessage && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3 w-3" /> {p.exceptionMessage}</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${p.type === 'PLANNED_PRODUCTION' ? 'bg-purple-100 text-purple-700' : 'bg-orange-100 text-orange-700'}`}>{TYPE_LABELS[p.type] ?? p.type}</span>
                  </td>
                  <td className="px-4 py-2 text-right">{p.quantity}</td>
                  <td className="px-4 py-2 text-gray-500">{p.dueDate}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{p.sourceDemand}</td>
                  <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLORS[p.status] || ''}`}>{p.status}</span></td>
                  <td className="px-4 py-2">
                    {p.status === 'PLANNED' && (
                      <button onClick={() => convert(p.id)} disabled={acting === p.id}
                        className="flex items-center gap-1 text-xs text-green-600 border border-green-300 rounded px-2 py-1 hover:bg-green-50">
                        <ArrowRightCircle className="h-3 w-3" /> Convert
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
