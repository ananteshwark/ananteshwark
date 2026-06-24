import { useState, useEffect, useCallback } from 'react';
import { DollarSign, RefreshCw, ChevronDown, ChevronRight, Layers } from 'lucide-react';
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

interface Item {
  id: string;
  code: string;
  name: string;
  valuationMethod: string | null;
}

interface Warehouse {
  id: string;
  name: string;
  code: string;
}

interface FifoLayer {
  id: string;
  layerDate: string;
  qtyOriginal: number;
  qtyRemaining: number;
  unitCost: number;
}

const VALUATION_LABELS: Record<string, { label: string; color: string }> = {
  MOVING_AVERAGE: { label: 'MAP', color: 'bg-blue-100 text-blue-700' },
  FIFO: { label: 'FIFO', color: 'bg-purple-100 text-purple-700' },
  STANDARD_COST: { label: 'STD', color: 'bg-orange-100 text-orange-700' },
};

export default function StockValuationPage() {
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [itemMap, setItemMap] = useState<Record<string, Item>>({});
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [fifoLayers, setFifoLayers] = useState<Record<string, FifoLayer[]>>({});
  const [fifoLoading, setFifoLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balRes, whRes, itemRes] = await Promise.all([
        inventoryApi.getStockBalances(warehouseFilter ? { warehouseId: warehouseFilter } : {}),
        inventoryApi.getWarehouses({ limit: 100 }),
        inventoryApi.getItems({ limit: 500 }),
      ]);
      const balData = balRes.data?.data ?? balRes.data ?? [];
      const whData = whRes.data?.data?.items ?? whRes.data?.data ?? whRes.data ?? [];
      const itemData = itemRes.data?.data?.items ?? itemRes.data?.items ?? [];
      setBalances(Array.isArray(balData) ? balData : (balData?.items ?? []));
      setWarehouses(Array.isArray(whData) ? whData : []);
      const map: Record<string, Item> = {};
      (Array.isArray(itemData) ? itemData : []).forEach((it: Item) => { map[it.id] = it; });
      setItemMap(map);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load stock balances');
    } finally {
      setLoading(false);
    }
  }, [warehouseFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRow = async (rowKey: string, itemId: string, warehouseId: string, method: string | null) => {
    if (expandedRow === rowKey) {
      setExpandedRow(null);
      return;
    }
    setExpandedRow(rowKey);
    if (method === 'FIFO' && !fifoLayers[rowKey]) {
      setFifoLoading(rowKey);
      try {
        const res = await inventoryApi.getFifoLayers(itemId, warehouseId);
        const layers = res.data?.data ?? res.data ?? [];
        setFifoLayers((prev) => ({ ...prev, [rowKey]: Array.isArray(layers) ? layers : [] }));
      } catch {
        setFifoLayers((prev) => ({ ...prev, [rowKey]: [] }));
      } finally {
        setFifoLoading(null);
      }
    }
  };

  const fmt = (n: number | null | undefined) =>
    Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const getWarehouseName = (id: string) => {
    const wh = warehouses.find((w) => w.id === id);
    return wh ? `${wh.code} - ${wh.name}` : id.substring(0, 8) + '...';
  };

  const getUnitCost = (b: StockBalance) => b.unitCost ?? b.avgCost ?? 0;
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

      {/* Valuation method legend */}
      <div className="flex gap-3 text-xs">
        {Object.entries(VALUATION_LABELS).map(([key, { label, color }]) => (
          <span key={key} className={`px-2 py-0.5 rounded font-medium ${color}`}>
            {label} — {key.replace('_', ' ')}
          </span>
        ))}
      </div>

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
          <p className="text-xs text-indigo-500 mt-0.5">{filtered.length} stock line(s) — multi-method valuation</p>
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8"></th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Warehouse</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty on Hand</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Value</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((row) => {
                  const item = itemMap[row.itemId];
                  const method = item?.valuationMethod ?? 'MOVING_AVERAGE';
                  const rowKey = `${row.itemId}:${row.warehouseId}`;
                  const badge = VALUATION_LABELS[method] ?? { label: method, color: 'bg-gray-100 text-gray-600' };
                  const isFifo = method === 'FIFO';
                  const isExpanded = expandedRow === rowKey;

                  return (
                    <>
                      <tr
                        key={rowKey}
                        className={`hover:bg-gray-50 ${isFifo ? 'cursor-pointer' : ''}`}
                        onClick={() => isFifo && toggleRow(rowKey, row.itemId, row.warehouseId, method)}
                      >
                        <td className="px-4 py-3 text-gray-400">
                          {isFifo ? (
                            isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {item ? (
                            <div>
                              <div className="font-medium">{item.code}</div>
                              <div className="text-xs text-gray-400">{item.name}</div>
                            </div>
                          ) : (
                            <span className="font-mono text-gray-500">{row.itemId.substring(0, 8)}...</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">{getWarehouseName(row.warehouseId)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${badge.color}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{Number(row.qtyOnHand).toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700 text-right">{fmt(getUnitCost(row))}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{fmt(getTotalValue(row))}</td>
                      </tr>

                      {isExpanded && isFifo && (
                        <tr key={`${rowKey}-layers`} className="bg-purple-50">
                          <td></td>
                          <td colSpan={6} className="px-6 py-3">
                            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-purple-700">
                              <Layers className="h-3.5 w-3.5" />
                              FIFO Cost Layers
                            </div>
                            {fifoLoading === rowKey ? (
                              <div className="text-xs text-gray-400">Loading layers...</div>
                            ) : (fifoLayers[rowKey] ?? []).length === 0 ? (
                              <div className="text-xs text-gray-400">No open FIFO layers.</div>
                            ) : (
                              <table className="text-xs w-full max-w-lg">
                                <thead>
                                  <tr className="text-gray-500">
                                    <th className="text-left pb-1">Receipt Date</th>
                                    <th className="text-right pb-1">Original Qty</th>
                                    <th className="text-right pb-1">Remaining Qty</th>
                                    <th className="text-right pb-1">Unit Cost</th>
                                    <th className="text-right pb-1">Layer Value</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(fifoLayers[rowKey] ?? []).map((layer) => (
                                    <tr key={layer.id} className="border-t border-purple-100">
                                      <td className="py-1 pr-4">{layer.layerDate}</td>
                                      <td className="text-right pr-4">{Number(layer.qtyOriginal).toFixed(2)}</td>
                                      <td className="text-right pr-4 font-semibold text-purple-800">{Number(layer.qtyRemaining).toFixed(2)}</td>
                                      <td className="text-right pr-4">{fmt(layer.unitCost)}</td>
                                      <td className="text-right font-medium">{fmt(Number(layer.qtyRemaining) * Number(layer.unitCost))}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-sm font-semibold text-gray-700">Grand Total</td>
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
