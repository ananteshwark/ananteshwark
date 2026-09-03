import { useState, useEffect } from 'react';
import { PackageSearch } from 'lucide-react';
import { atpApi } from '../../api/atp';

const unwrap = (res: any) => res.data?.data ?? res.data;

function AtpCheck() {
  const [form, setForm] = useState({ itemId: '', warehouseId: '', requestedQty: '1', requiredDate: '' });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await atpApi.check({
        itemId: form.itemId,
        warehouseId: form.warehouseId || undefined,
        requestedQty: parseFloat(form.requestedQty) || 0,
        requiredDate: form.requiredDate || undefined,
      });
      setResult(unwrap(res));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><PackageSearch className="h-4 w-4" /> Availability Check</h3>
      <div className="grid grid-cols-4 gap-3 mb-3">
        <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Item ID" value={form.itemId}
          onChange={e => setForm(p => ({ ...p, itemId: e.target.value }))} />
        <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Warehouse ID (optional)" value={form.warehouseId}
          onChange={e => setForm(p => ({ ...p, warehouseId: e.target.value }))} />
        <input type="number" className="border rounded-lg px-3 py-2 text-sm" placeholder="Qty" value={form.requestedQty}
          onChange={e => setForm(p => ({ ...p, requestedQty: e.target.value }))} />
        <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={form.requiredDate}
          onChange={e => setForm(p => ({ ...p, requiredDate: e.target.value }))} />
      </div>
      <button onClick={run} disabled={loading || !form.itemId}
        className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg disabled:opacity-50">
        {loading ? 'Checking...' : 'Check ATP'}
      </button>

      {result && (
        <div className="mt-4 flex items-center gap-3 text-sm flex-wrap">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
            result.status === 'AVAILABLE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {result.status}
          </span>
          <div className="bg-gray-50 rounded-lg px-3 py-2">On Hand: <strong>{result.onHandQty}</strong></div>
          <div className="bg-gray-50 rounded-lg px-3 py-2">Committed: <strong>{result.committedQty}</strong></div>
          <div className="bg-blue-50 rounded-lg px-3 py-2">Available: <strong>{result.availableQty}</strong></div>
          {result.shortfall != null && (
            <div className="bg-red-50 rounded-lg px-3 py-2 text-red-700">Shortfall: <strong>{result.shortfall}</strong></div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ATPDashboardPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    atpApi.getDashboard().then(r => setRows(unwrap(r) || [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">ATP Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Available-to-promise stock visibility and shortages</p>
      </div>

      <AtpCheck />

      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold">Items At or Below Zero Availability</h3>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No shortages — all items have available stock.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Item ID', 'Warehouse ID', 'On Hand', 'Committed', 'Available'].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r: any, i: number) => (
                <tr key={`${r.itemId}-${r.warehouseId}-${i}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{r.itemId}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.warehouseId}</td>
                  <td className="px-4 py-2 text-right">{r.onHandQty}</td>
                  <td className="px-4 py-2 text-right">{r.committedQty}</td>
                  <td className={`px-4 py-2 text-right font-medium ${r.availableQty < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                    {r.availableQty}
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
