import { useState, useEffect } from 'react';
import { inventoryApi } from '../../api/inventory';
import { Plus, Package, Search } from 'lucide-react';

const ITEM_TYPE_COLORS: Record<string, string> = {
  STOCK: 'bg-blue-100 text-blue-700',
  NON_STOCK: 'bg-gray-100 text-gray-700',
  SERVICE: 'bg-purple-100 text-purple-700',
};

function NewWarehouseDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ code: '', name: '', address: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await inventoryApi.createWarehouse(form);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create warehouse');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">New Warehouse</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              value={form.address}
              onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function NewItemDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: '',
    name: '',
    type: 'STOCK',
    uom: 'EA',
    standardCost: '',
    sellingPrice: '',
    taxRate: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await inventoryApi.createItem({
        ...form,
        standardCost: Number(form.standardCost) || 0,
        sellingPrice: Number(form.sellingPrice) || 0,
        taxRate: Number(form.taxRate) || 0,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">New Item</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">UOM</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.uom}
                onChange={e => setForm(f => ({ ...f, uom: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              >
                <option value="STOCK">Stock</option>
                <option value="NON_STOCK">Non-Stock</option>
                <option value="SERVICE">Service</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate %</label>
              <input
                type="number"
                step="0.01"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.taxRate}
                onChange={e => setForm(f => ({ ...f, taxRate: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Standard Cost</label>
              <input
                type="number"
                step="0.01"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.standardCost}
                onChange={e => setForm(f => ({ ...f, standardCost: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Selling Price</label>
              <input
                type="number"
                step="0.01"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.sellingPrice}
                onChange={e => setForm(f => ({ ...f, sellingPrice: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

type Tab = 'items' | 'warehouses' | 'stock' | 'adjustments' | 'lots' | 'cycle-counts' | 'rmas';

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<Tab>('items');
  const [items, setItems] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [stockBalances, setStockBalances] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [cycleCounts, setCycleCounts] = useState<any[]>([]);
  const [rmas, setRmas] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [showNewItem, setShowNewItem] = useState(false);
  const [showNewWarehouse, setShowNewWarehouse] = useState(false);
  const [showLotModal, setShowLotModal] = useState(false);
  const [showCycleModal, setShowCycleModal] = useState(false);
  const [showRmaModal, setShowRmaModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getItems({ search: search || undefined, limit: 50 });
      setItems(res.data?.items || res.data?.data || []);
    } catch {
      // handled gracefully
    } finally {
      setLoading(false);
    }
  };

  const fetchWarehouses = async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getWarehouses({ limit: 50 });
      setWarehouses(res.data?.items || res.data?.data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const fetchStockBalances = async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getStockBalances({ limit: 100 });
      setStockBalances(res.data?.items || res.data?.data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const fetchAdjustments = async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getAdjustments({ limit: 50 });
      setAdjustments(res.data?.items || res.data?.data || []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const fetchLots = async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getLots();
      setLots(res.data || []);
    } catch {
    } finally { setLoading(false); }
  };

  const fetchCycleCounts = async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getCycleCounts({ limit: 50 });
      setCycleCounts(res.data?.items || []);
    } catch {
    } finally { setLoading(false); }
  };

  const fetchRmas = async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getRmas({ limit: 50 });
      setRmas(res.data?.items || []);
    } catch {
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (activeTab === 'items') fetchItems();
    if (activeTab === 'warehouses') fetchWarehouses();
    if (activeTab === 'stock') fetchStockBalances();
    if (activeTab === 'adjustments') fetchAdjustments();
    if (activeTab === 'lots') fetchLots();
    if (activeTab === 'cycle-counts') fetchCycleCounts();
    if (activeTab === 'rmas') fetchRmas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, search]);

  const tabs = [
    { key: 'items' as const, label: 'Items' },
    { key: 'warehouses' as const, label: 'Warehouses' },
    { key: 'stock' as const, label: 'Stock Balances' },
    { key: 'adjustments' as const, label: 'Adjustments' },
    { key: 'lots' as const, label: 'Lots & Serials' },
    { key: 'cycle-counts' as const, label: 'Cycle Counts' },
    { key: 'rmas' as const, label: 'RMA' },
  ];

  return (
    <div className="p-6">
      {showNewItem && (
        <NewItemDialog onClose={() => setShowNewItem(false)} onSaved={fetchItems} />
      )}
      {showNewWarehouse && (
        <NewWarehouseDialog onClose={() => setShowNewWarehouse(false)} onSaved={fetchWarehouses} />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-600" /> Inventory
          </h1>
          <p className="text-sm text-gray-500 mt-1">Manage items, warehouses, and stock</p>
        </div>
        <div className="flex gap-3">
          {activeTab === 'items' && (
            <button
              onClick={() => setShowNewItem(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> New Item
            </button>
          )}
          {activeTab === 'warehouses' && (
            <button
              onClick={() => setShowNewWarehouse(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> New Warehouse
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {loading && <p className="text-gray-500 text-sm mb-4">Loading...</p>}

      {/* Items Tab */}
      {activeTab === 'items' && (
        <div>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              className="pl-10 pr-4 py-2 border rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search items..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">UOM</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cost</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400">
                      No items found
                    </td>
                  </tr>
                ) : (
                  items.map(item => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs">{item.code}</td>
                      <td className="px-4 py-3 font-medium">{item.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${ITEM_TYPE_COLORS[item.type] || 'bg-gray-100 text-gray-700'}`}
                        >
                          {item.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{item.uom}</td>
                      <td className="px-4 py-3 text-right">
                        ₹{Number(item.standardCost || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        ₹{Number(item.sellingPrice || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warehouses Tab */}
      {activeTab === 'warehouses' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Address</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {warehouses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-400">
                    No warehouses found
                  </td>
                </tr>
              ) : (
                warehouses.map(wh => (
                  <tr key={wh.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{wh.code}</td>
                    <td className="px-4 py-3 font-medium">{wh.name}</td>
                    <td className="px-4 py-3 text-gray-500">{wh.address || '—'}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          wh.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {wh.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Stock Balances Tab */}
      {activeTab === 'stock' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Item</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Warehouse</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">On Hand</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Reserved</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Available</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Avg Cost</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {stockBalances.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-8 text-gray-400">
                    No stock balances found
                  </td>
                </tr>
              ) : (
                stockBalances.map(bal => (
                  <tr key={bal.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{bal.item?.name || bal.itemId}</td>
                    <td className="px-4 py-3">{bal.warehouse?.name || bal.warehouseId}</td>
                    <td className="px-4 py-3 text-right">{Number(bal.qtyOnHand || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{Number(bal.qtyReserved || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      {Number((bal.qtyOnHand || 0) - (bal.qtyReserved || 0)).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">₹{Number(bal.avgCost || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">₹{Number(bal.totalCost || 0).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Adjustments Tab */}
      {activeTab === 'adjustments' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Number</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Reason</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {adjustments.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-8 text-gray-400">
                    No adjustments found
                  </td>
                </tr>
              ) : (
                adjustments.map(adj => (
                  <tr key={adj.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{adj.adjNumber}</td>
                    <td className="px-4 py-3">{adj.adjDate}</td>
                    <td className="px-4 py-3">{adj.reason}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          adj.status === 'POSTED'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {adj.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Lots & Serials Tab */}
      {activeTab === 'lots' && (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowLotModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <Plus className="h-4 w-4" /> Receive Lot
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{['Lot #', 'Item ID', 'Type', 'Received Qty', 'Available Qty', 'Expiry', 'Status'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {lots.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">No lots or serials</td></tr>}
                {lots.map((l: any) => (
                  <tr key={l.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{l.lotNumber}</td>
                    <td className="px-4 py-3 font-mono text-xs">{l.itemId.slice(0, 8)}…</td>
                    <td className="px-4 py-3">{l.trackingType}</td>
                    <td className="px-4 py-3 text-right">{Number(l.receivedQty).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">{Number(l.availableQty).toLocaleString()}</td>
                    <td className="px-4 py-3">{l.expiryDate ?? '—'}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${l.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : l.status === 'QUARANTINE' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{l.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showLotModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <form className="bg-white rounded-xl p-6 w-[480px]" onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); await inventoryApi.receiveLot({ itemId: f.get('itemId'), lotNumber: f.get('lotNumber'), trackingType: f.get('trackingType'), receivedQty: Number(f.get('receivedQty')), expiryDate: f.get('expiryDate') || undefined }); setShowLotModal(false); fetchLots(); }}>
                <h2 className="text-lg font-semibold mb-4">Receive Lot / Serial</h2>
                <div className="space-y-3">
                  <div><label className="text-xs text-gray-500">Item ID (UUID)</label><input name="itemId" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-gray-500">Lot / Serial #</label><input name="lotNumber" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-gray-500">Type</label><select name="trackingType" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1"><option value="LOT">Lot</option><option value="SERIAL">Serial</option></select></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-gray-500">Received Qty</label><input name="receivedQty" type="number" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                    <div><label className="text-xs text-gray-500">Expiry Date</label><input name="expiryDate" type="date" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                </div>
                <div className="flex justify-end gap-3 mt-5">
                  <button type="button" onClick={() => setShowLotModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Receive</button>
                </div>
              </form>
            </div>
          )}
        </>
      )}

      {/* Cycle Counts Tab */}
      {activeTab === 'cycle-counts' && (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowCycleModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <Plus className="h-4 w-4" /> Start Cycle Count
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{['Count #', 'Warehouse', 'Date', 'Status'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {cycleCounts.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-gray-400">No cycle counts</td></tr>}
                {cycleCounts.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{c.countNumber}</td>
                    <td className="px-4 py-3 font-mono text-xs">{c.warehouseId.slice(0, 8)}…</td>
                    <td className="px-4 py-3">{c.countDate}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.status === 'POSTED' ? 'bg-green-100 text-green-700' : c.status === 'COUNTING' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showCycleModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <form className="bg-white rounded-xl p-6 w-[400px]" onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); await inventoryApi.createCycleCount({ warehouseId: f.get('warehouseId'), countDate: f.get('countDate') }); setShowCycleModal(false); fetchCycleCounts(); }}>
                <h2 className="text-lg font-semibold mb-4">Start Cycle Count</h2>
                <div className="space-y-3">
                  <div><label className="text-xs text-gray-500">Warehouse ID (UUID)</label><input name="warehouseId" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  <div><label className="text-xs text-gray-500">Count Date</label><input name="countDate" type="date" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                </div>
                <div className="flex justify-end gap-3 mt-5">
                  <button type="button" onClick={() => setShowCycleModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
                </div>
              </form>
            </div>
          )}
        </>
      )}

      {/* RMA Tab */}
      {activeTab === 'rmas' && (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowRmaModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <Plus className="h-4 w-4" /> New RMA
            </button>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b"><tr>{['RMA #', 'Type', 'Customer/Vendor', 'Status', 'Requested', 'Value', 'Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100">
                {rmas.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-gray-400">No RMAs</td></tr>}
                {rmas.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{r.rmaNumber}</td>
                    <td className="px-4 py-3">{r.type}</td>
                    <td className="px-4 py-3">{r.customerVendorName ?? '—'}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : r.status === 'APPROVED' ? 'bg-blue-100 text-blue-700' : r.status === 'RECEIVED' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>{r.status}</span></td>
                    <td className="px-4 py-3">{r.requestedDate}</td>
                    <td className="px-4 py-3 text-right">{Number(r.totalValue).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      {r.status === 'DRAFT' && <button onClick={async () => { await inventoryApi.approveRma(r.id); fetchRmas(); }} className="text-xs text-blue-600 hover:underline">Approve</button>}
                      {r.status === 'APPROVED' && <button onClick={async () => { await inventoryApi.receiveRma(r.id, new Date().toISOString().slice(0, 10)); fetchRmas(); }} className="text-xs text-green-600 hover:underline">Mark Received</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {showRmaModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <form className="bg-white rounded-xl p-6 w-[480px]" onSubmit={async e => { e.preventDefault(); const f = new FormData(e.currentTarget); await inventoryApi.createRma({ type: f.get('type'), customerVendorName: f.get('customerVendorName') || undefined, requestedDate: f.get('requestedDate'), lines: [] }); setShowRmaModal(false); fetchRmas(); }}>
                <h2 className="text-lg font-semibold mb-4">New Return (RMA)</h2>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="text-xs text-gray-500">Type</label><select name="type" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1"><option value="CUSTOMER">Customer Return</option><option value="SUPPLIER">Supplier Return</option></select></div>
                    <div><label className="text-xs text-gray-500">Customer / Vendor</label><input name="customerVendorName" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                  </div>
                  <div><label className="text-xs text-gray-500">Requested Date</label><input name="requestedDate" type="date" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                </div>
                <div className="flex justify-end gap-3 mt-5">
                  <button type="button" onClick={() => setShowRmaModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                  <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
