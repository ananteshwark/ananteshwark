import { useState, useEffect, useCallback } from 'react';
import { inventoryApi } from '../../api/inventory';
import { Plus, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

type Tab = 'subcontracting' | 'consignment' | 'stos';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  COMPONENTS_SENT: 'bg-yellow-100 text-yellow-700',
  FINISHED_RECEIVED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  FULLY_CONSUMED: 'bg-gray-100 text-gray-700',
  RETURNED: 'bg-orange-100 text-orange-700',
  PARTIALLY_RETURNED: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  GOODS_ISSUED: 'bg-purple-100 text-purple-700',
  GOODS_RECEIVED: 'bg-teal-100 text-teal-700',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ─── Subcontracting Tab ──────────────────────────────────────────────────────

function NewSubcontractDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    vendorName: '',
    itemCode: '',
    itemId: '',
    finishedQty: '',
    unitConversionCost: '',
    sendingWarehouseId: '',
    receivingWarehouseId: '',
    plannedDate: '',
  });
  const [components, setComponents] = useState([{ itemId: '', itemCode: '', qty: '', unitCost: '' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addComponent = () => setComponents(prev => [...prev, { itemId: '', itemCode: '', qty: '', unitCost: '' }]);
  const removeComponent = (i: number) => setComponents(prev => prev.filter((_, idx) => idx !== i));
  const updateComponent = (i: number, field: string, value: string) =>
    setComponents(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await inventoryApi.createSubcontract({
        ...form,
        finishedQty: Number(form.finishedQty),
        unitConversionCost: Number(form.unitConversionCost) || 0,
        components: components.map(c => ({
          itemId: c.itemId,
          itemCode: c.itemCode,
          qty: Number(c.qty),
          unitCost: Number(c.unitCost),
        })),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create subcontract order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">New Subcontract Order</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.vendorName}
                onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Finished Item Code *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.itemCode} required
                onChange={e => setForm(f => ({ ...f, itemCode: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Item ID (UUID) *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.itemId} required
                onChange={e => setForm(f => ({ ...f, itemId: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Finished Qty *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" type="number" value={form.finishedQty} required
                onChange={e => setForm(f => ({ ...f, finishedQty: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Conversion Fee / Unit</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" type="number" value={form.unitConversionCost}
                onChange={e => setForm(f => ({ ...f, unitConversionCost: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Planned Date</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" type="date" value={form.plannedDate}
                onChange={e => setForm(f => ({ ...f, plannedDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sending Warehouse ID</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.sendingWarehouseId}
                onChange={e => setForm(f => ({ ...f, sendingWarehouseId: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Receiving Warehouse ID</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.receivingWarehouseId}
                onChange={e => setForm(f => ({ ...f, receivingWarehouseId: e.target.value }))} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Components</label>
              <button type="button" onClick={addComponent} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Component
              </button>
            </div>
            <div className="space-y-2">
              {components.map((comp, i) => (
                <div key={i} className="grid grid-cols-4 gap-2 items-center">
                  <input className="border rounded px-2 py-1 text-xs" placeholder="Item Code" value={comp.itemCode}
                    onChange={e => updateComponent(i, 'itemCode', e.target.value)} />
                  <input className="border rounded px-2 py-1 text-xs" placeholder="Item ID" value={comp.itemId}
                    onChange={e => updateComponent(i, 'itemId', e.target.value)} />
                  <input className="border rounded px-2 py-1 text-xs" placeholder="Qty" type="number" value={comp.qty}
                    onChange={e => updateComponent(i, 'qty', e.target.value)} />
                  <div className="flex gap-1">
                    <input className="border rounded px-2 py-1 text-xs flex-1" placeholder="Unit Cost" type="number" value={comp.unitCost}
                      onChange={e => updateComponent(i, 'unitCost', e.target.value)} />
                    {components.length > 1 && (
                      <button type="button" onClick={() => removeComponent(i)} className="text-red-500 text-xs px-1">×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SubcontractingTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getSubcontracts({ limit: 50 });
      setOrders(res.data?.data?.items ?? res.data?.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const action = async (fn: () => Promise<any>, label: string) => {
    setActionLoading(label);
    try { await fn(); await load(); } catch (e: any) { alert(e.response?.data?.message || 'Error'); }
    finally { setActionLoading(null); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600">Track subcontracting workflows — components out, finished goods in.</p>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowDialog(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New
          </button>
        </div>
      </div>

      {showDialog && <NewSubcontractDialog onClose={() => setShowDialog(false)} onSaved={load} />}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No subcontract orders yet</div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left w-8"></th>
                <th className="px-4 py-3 text-left">SC Number</th>
                <th className="px-4 py-3 text-left">Vendor</th>
                <th className="px-4 py-3 text-left">Item</th>
                <th className="px-4 py-3 text-right">Qty</th>
                <th className="px-4 py-3 text-left">Planned</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map(o => (
                <>
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button onClick={() => setExpanded(expanded === o.id ? null : o.id)} className="text-gray-400 hover:text-gray-600">
                        {expanded === o.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono font-medium">{o.scNumber}</td>
                    <td className="px-4 py-3">{o.vendorName ?? '—'}</td>
                    <td className="px-4 py-3 font-mono">{o.itemCode}</td>
                    <td className="px-4 py-3 text-right">{o.finishedQty}</td>
                    <td className="px-4 py-3">{o.plannedDate ?? '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex gap-1 justify-center">
                        {o.status === 'DRAFT' && (
                          <button
                            disabled={actionLoading === o.id}
                            onClick={() => action(() => inventoryApi.sendComponents(o.id), o.id)}
                            className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 disabled:opacity-50"
                          >Send Comp.</button>
                        )}
                        {o.status === 'COMPONENTS_SENT' && (
                          <button
                            disabled={actionLoading === o.id}
                            onClick={() => action(() => inventoryApi.receiveFinishedGoods(o.id), o.id)}
                            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
                          >Receive FG</button>
                        )}
                        {o.status === 'FINISHED_RECEIVED' && (
                          <button
                            disabled={actionLoading === o.id}
                            onClick={() => action(() => inventoryApi.completeSubcontract(o.id), o.id)}
                            className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                          >Complete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === o.id && (
                    <tr key={`${o.id}-detail`}>
                      <td colSpan={8} className="px-8 py-4 bg-gray-50">
                        <p className="text-xs font-semibold text-gray-500 mb-2">Components</p>
                        <table className="text-xs w-full max-w-lg">
                          <thead>
                            <tr className="text-gray-500">
                              <th className="text-left pb-1">Item Code</th>
                              <th className="text-right pb-1">Qty</th>
                              <th className="text-right pb-1">Unit Cost</th>
                              <th className="text-right pb-1">Line Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(o.components ?? []).map((c: any, i: number) => (
                              <tr key={i} className="border-t">
                                <td className="py-1 font-mono">{c.itemCode}</td>
                                <td className="py-1 text-right">{c.qty}</td>
                                <td className="py-1 text-right">{Number(c.unitCost).toFixed(2)}</td>
                                <td className="py-1 text-right">{(c.qty * c.unitCost).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <div className="mt-2 text-xs text-gray-500">
                          Conversion fee: {Number(o.unitConversionCost).toFixed(2)} /unit
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Consignment Tab ─────────────────────────────────────────────────────────

function ConsignmentTab() {
  const [stocks, setStocks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showReceive, setShowReceive] = useState(false);
  const [form, setForm] = useState({ vendorId: '', vendorName: '', itemId: '', warehouseId: '', qty: '', unitCost: '', receiptDate: '' });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getConsignmentStock({ limit: 50 });
      setStocks(res.data?.data?.items ?? res.data?.items ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await inventoryApi.receiveConsignment({ ...form, qty: Number(form.qty), unitCost: Number(form.unitCost) });
      await load();
      setShowReceive(false);
      setForm({ vendorId: '', vendorName: '', itemId: '', warehouseId: '', qty: '', unitCost: '', receiptDate: '' });
    } catch (e: any) { alert(e.response?.data?.message || 'Error'); }
  };

  const doAction = async (fn: () => Promise<any>, key: string) => {
    setActionLoading(key);
    try { await fn(); await load(); } catch (e: any) { alert(e.response?.data?.message || 'Error'); }
    finally { setActionLoading(null); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600">Track supplier-owned consignment stock. Consume to take ownership.</p>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowReceive(v => !v)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Receive Consignment
          </button>
        </div>
      </div>

      {showReceive && (
        <form onSubmit={handleReceive} className="border rounded-xl p-4 mb-4 bg-gray-50 grid grid-cols-4 gap-3">
          <input className="border rounded px-2 py-1 text-sm" placeholder="Vendor ID" value={form.vendorId} onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))} required />
          <input className="border rounded px-2 py-1 text-sm" placeholder="Vendor Name" value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} />
          <input className="border rounded px-2 py-1 text-sm" placeholder="Item ID" value={form.itemId} onChange={e => setForm(f => ({ ...f, itemId: e.target.value }))} required />
          <input className="border rounded px-2 py-1 text-sm" placeholder="Warehouse ID" value={form.warehouseId} onChange={e => setForm(f => ({ ...f, warehouseId: e.target.value }))} required />
          <input className="border rounded px-2 py-1 text-sm" placeholder="Qty" type="number" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: e.target.value }))} required />
          <input className="border rounded px-2 py-1 text-sm" placeholder="Unit Cost" type="number" value={form.unitCost} onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} required />
          <input className="border rounded px-2 py-1 text-sm" type="date" value={form.receiptDate} onChange={e => setForm(f => ({ ...f, receiptDate: e.target.value }))} />
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1 text-sm bg-blue-600 text-white rounded">Save</button>
            <button type="button" onClick={() => setShowReceive(false)} className="px-3 py-1 text-sm border rounded">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : stocks.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No consignment stock recorded</div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Vendor</th>
                <th className="px-4 py-3 text-left">Item ID</th>
                <th className="px-4 py-3 text-right">Received</th>
                <th className="px-4 py-3 text-right">Consumed</th>
                <th className="px-4 py-3 text-right">Returned</th>
                <th className="px-4 py-3 text-right">Available</th>
                <th className="px-4 py-3 text-right">Unit Cost</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stocks.map(s => {
                const available = s.qtyReceived - s.qtyConsumed - s.qtyReturned;
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{s.vendorName ?? s.vendorId.slice(0, 8)}</td>
                    <td className="px-4 py-3 font-mono text-xs">{s.itemId.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-right">{s.qtyReceived}</td>
                    <td className="px-4 py-3 text-right">{s.qtyConsumed}</td>
                    <td className="px-4 py-3 text-right">{s.qtyReturned}</td>
                    <td className="px-4 py-3 text-right font-semibold">{available.toFixed(4)}</td>
                    <td className="px-4 py-3 text-right">{Number(s.unitCost).toFixed(2)}</td>
                    <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-center">
                      {s.status === 'ACTIVE' || s.status === 'PARTIALLY_RETURNED' ? (
                        <div className="flex gap-1 justify-center">
                          <button
                            disabled={actionLoading === s.id + 'c'}
                            onClick={() => {
                              const qty = Number(prompt(`Consume qty (available: ${available})`));
                              if (qty > 0) doAction(() => inventoryApi.consumeConsignment(s.id, qty), s.id + 'c');
                            }}
                            className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                          >Consume</button>
                          <button
                            disabled={actionLoading === s.id + 'r'}
                            onClick={() => {
                              const qty = Number(prompt(`Return qty (available: ${available})`));
                              if (qty > 0) doAction(() => inventoryApi.returnConsignment(s.id, qty), s.id + 'r');
                            }}
                            className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 disabled:opacity-50"
                          >Return</button>
                        </div>
                      ) : '—'}
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

// ─── STO Tab ─────────────────────────────────────────────────────────────────

function NewStoDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ fromWarehouseId: '', toWarehouseId: '', plannedDate: '', notes: '' });
  const [lines, setLines] = useState([{ itemId: '', itemCode: '', qty: '' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addLine = () => setLines(prev => [...prev, { itemId: '', itemCode: '', qty: '' }]);
  const updateLine = (i: number, field: string, value: string) =>
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await inventoryApi.createSto({
        ...form,
        lines: lines.map(l => ({ itemId: l.itemId, itemCode: l.itemCode, qty: Number(l.qty) })),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create STO');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-6 border-b"><h2 className="text-lg font-semibold">New Stock Transfer Order</h2></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Warehouse ID *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.fromWarehouseId} required
                onChange={e => setForm(f => ({ ...f, fromWarehouseId: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Warehouse ID *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.toWarehouseId} required
                onChange={e => setForm(f => ({ ...f, toWarehouseId: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Planned Date</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" type="date" value={form.plannedDate}
                onChange={e => setForm(f => ({ ...f, plannedDate: e.target.value }))} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Lines</label>
              <button type="button" onClick={addLine} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Line
              </button>
            </div>
            {lines.map((l, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 mb-2">
                <input className="border rounded px-2 py-1 text-xs" placeholder="Item Code" value={l.itemCode}
                  onChange={e => updateLine(i, 'itemCode', e.target.value)} />
                <input className="border rounded px-2 py-1 text-xs" placeholder="Item ID" value={l.itemId}
                  onChange={e => updateLine(i, 'itemId', e.target.value)} />
                <input className="border rounded px-2 py-1 text-xs" placeholder="Qty" type="number" value={l.qty}
                  onChange={e => updateLine(i, 'qty', e.target.value)} />
              </div>
            ))}
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StosTab() {
  const [stos, setStos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inventoryApi.getStos({ limit: 50 });
      setStos(res.data?.data?.items ?? res.data?.items ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doAction = async (fn: () => Promise<any>, key: string) => {
    setActionLoading(key);
    try { await fn(); await load(); } catch (e: any) { alert(e.response?.data?.message || 'Error'); }
    finally { setActionLoading(null); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600">Formal inter-warehouse transfer orders with approval workflow.</p>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowDialog(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New STO
          </button>
        </div>
      </div>

      {showDialog && <NewStoDialog onClose={() => setShowDialog(false)} onSaved={load} />}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : stos.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No stock transfer orders yet</div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">STO Number</th>
                <th className="px-4 py-3 text-left">From WH</th>
                <th className="px-4 py-3 text-left">To WH</th>
                <th className="px-4 py-3 text-right">Lines</th>
                <th className="px-4 py-3 text-left">Planned</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stos.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-medium">{s.stoNumber}</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.fromWarehouseId.slice(0, 8)}…</td>
                  <td className="px-4 py-3 font-mono text-xs">{s.toWarehouseId.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-right">{(s.lines ?? []).length}</td>
                  <td className="px-4 py-3">{s.plannedDate ?? '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-1 justify-center">
                      {s.status === 'DRAFT' && (
                        <button disabled={actionLoading === s.id} onClick={() => doAction(() => inventoryApi.approveSto(s.id), s.id)}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50">Approve</button>
                      )}
                      {s.status === 'APPROVED' && (
                        <button disabled={actionLoading === s.id} onClick={() => doAction(() => inventoryApi.issueGoodsSto(s.id), s.id)}
                          className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50">Issue Goods</button>
                      )}
                      {s.status === 'GOODS_ISSUED' && (
                        <button disabled={actionLoading === s.id} onClick={() => doAction(() => inventoryApi.receiveGoodsSto(s.id), s.id)}
                          className="px-2 py-1 text-xs bg-teal-100 text-teal-700 rounded hover:bg-teal-200 disabled:opacity-50">Receive</button>
                      )}
                      {s.status === 'GOODS_RECEIVED' && (
                        <button disabled={actionLoading === s.id} onClick={() => doAction(() => inventoryApi.completeSto(s.id), s.id)}
                          className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50">Complete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function SpecialProcurementPage() {
  const [tab, setTab] = useState<Tab>('subcontracting');

  const TABS: { key: Tab; label: string }[] = [
    { key: 'subcontracting', label: 'Subcontracting' },
    { key: 'consignment', label: 'Consignment Stock' },
    { key: 'stos', label: 'Stock Transfer Orders' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Special Procurement</h1>
        <p className="text-gray-500 mt-1">MM Special Procurement — Subcontracting, Consignment, and STOs</p>
      </div>

      <div className="flex gap-1 border-b mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'subcontracting' && <SubcontractingTab />}
      {tab === 'consignment' && <ConsignmentTab />}
      {tab === 'stos' && <StosTab />}
    </div>
  );
}
