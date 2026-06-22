import { useState, useEffect, useCallback } from 'react';
import { DollarSign, RefreshCw } from 'lucide-react';
import { inventoryApi } from '../../api/inventory';

interface StockBalance {
  id: string;
  itemId: string;
  warehouseId: string;
  qtyOnHand: number;
  unitCost: number | null;
  totalValue: number | null;
  avgCost: number;
  totalCost: number;
}

interface Warehouse {
  id: string;
  name: string;
  code: string;
}

export default function StockValuationPage() {
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balRes, whRes] = await Promise.all([
        inventoryApi.getStockBalances(warehouseFilter ? { warehouseId: warehouseFilter } : {}),
        inventoryApi.getWarehouses({ limit: 100 }),
      ]);
      const balData = balRes.data?.data ?? balRes.data ?? [];
      const whData = whRes.data?.data?.items ?? whRes.data?.data ?? whRes.data ?? [];
      setBalances(Array.isArray(balData) ? balData : (balData?.items ?? []));
      setWarehouses(Array.isArray(whData) ? whData : []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load stock balances');
    } finally {
      setLoading(false);
    }
  }, [warehouseFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const fmt = (n: number | null | undefined) =>
    Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getWarehouseName = (id: string) => {
    const wh = warehouses.find((w) => w.id === id);
    return wh ? `${wh.code} - ${wh.name}` : id.substring(0, 8) + '...';
  };

  // Use unitCost if available (from moving average), fall back to avgCost
  const getUnitCost = (b: StockBalance) => b.unitCost ?? b.avgCost ?? 0;
  // Use totalValue if available, fall back to totalCost
  const getTotalValue = (b: StockBalance) => b.totalValue ?? b.totalCost ?? 0;

  const filtered = warehouseFilter
    ? balances.filter((b) => b.warehouseId === warehouseFilter)
    : balances;

  const grandTotal = filtered.reduce((s, b) => s + Number(getTotalValue(b) || 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DollarSign className="h-6 w-6 text-indigo-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Stock Valuation</h1>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {/* Filters */}
      <div className="flex gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Filter by Warehouse</label>
          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Warehouses</option>
            {warehouses.map((wh) => (
              <option key={wh.id} value={wh.id}>
                {wh.code} - {wh.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex items-center justify-between">
        <div>
          <p className="text-sm text-indigo-700 font-medium">Total Inventory Value</p>
          <p className="text-xs text-indigo-500 mt-0.5">{filtered.length} stock line(s) — Moving Average Price valuation</p>
        </div>
        <p className="text-2xl font-bold text-indigo-800">{fmt(grandTotal)}</p>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {loading ? (
          <div className="px-4 py-12 text-center text-sm text-gray-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-500">No stock balance records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Warehouse</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty on Hand</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Cost (MAP)</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Value</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-700">{row.itemId.substring(0, 8)}...</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{getWarehouseName(row.warehouseId)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{Number(row.qtyOnHand).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{fmt(getUnitCost(row))}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{fmt(getTotalValue(row))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-700">Grand Total</td>
                  <td className="px-4 py-3 text-sm font-bold text-indigo-700 text-right">{fmt(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
