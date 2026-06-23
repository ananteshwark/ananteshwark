import { useState, useEffect } from 'react';
import { Plus, X, Truck, PackageCheck, ClipboardCheck, Send, Ban } from 'lucide-react';
import { deliveriesApi } from '../../api/deliveries';
import { salesApi } from '../../api/sales';

const unwrap = (res: any) => res.data?.data ?? res.data;
const fmt = (n: number) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

function statusBadge(status: string) {
  const map: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    PICKED: 'bg-amber-100 text-amber-700',
    SHIPPED: 'bg-blue-100 text-blue-700',
    DELIVERED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

interface LineForm {
  salesOrderLineId: string;
  itemId: string | null;
  itemDescription: string;
  orderedQty: number;
  deliveredQty: string;
  warehouseId: string;
}

function NewDeliveryModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [salesOrderId, setSalesOrderId] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().slice(0, 10));
  const [warehouseId, setWarehouseId] = useState('');
  const [lines, setLines] = useState<LineForm[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    salesApi.getOrders({ limit: 200 }).then((res) => {
      const all = unwrap(res)?.items ?? unwrap(res) ?? [];
      // Confirmed / in-progress orders are deliverable.
      setOrders(all.filter((o: any) => ['CONFIRMED', 'IN_PROGRESS'].includes(o.status)));
    });
  }, []);

  useEffect(() => {
    if (!salesOrderId) { setLines([]); return; }
    salesApi.getOrderLines(salesOrderId).then((res) => {
      const ol = unwrap(res) || [];
      setLines(
        ol.map((l: any) => ({
          salesOrderLineId: l.id,
          itemId: l.inventoryItemId || null,
          itemDescription: l.itemName,
          orderedQty: Number(l.quantity) || 0,
          deliveredQty: String(Number(l.quantity) || 0),
          warehouseId: '',
        })),
      );
    });
  }, [salesOrderId]);

  const setLine = (i: number, key: keyof LineForm, val: string) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, [key]: val } : l)));

  const save = async () => {
    setError(null);
    if (!salesOrderId) { setError('Select a sales order'); return; }
    setSaving(true);
    try {
      await deliveriesApi.create({
        salesOrderId,
        deliveryDate,
        warehouseId: warehouseId || null,
      });
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to create delivery');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold">New Delivery</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Sales Order</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={salesOrderId}
              onChange={(e) => setSalesOrderId(e.target.value)}>
              <option value="">Select a confirmed sales order…</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.orderNumber} — {o.contactName || 'No contact'} ({o.status})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Delivery Date</label>
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Warehouse ID (optional)</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)} placeholder="UUID" />
          </div>
        </div>

        {lines.length > 0 && (
          <>
            <div className="text-sm font-medium mb-2">Lines</div>
            <div className="border rounded-lg overflow-hidden mb-3">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Item', 'Ordered', 'Delivered Qty'].map((h) => (
                      <th key={h} className="text-left px-2 py-1.5 text-xs text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((l, i) => (
                    <tr key={l.salesOrderLineId}>
                      <td className="px-2 py-1">{l.itemDescription}</td>
                      <td className="px-2 py-1">{fmt(l.orderedQty)}</td>
                      <td className="px-2 py-1">
                        <input type="number" className="w-24 border rounded px-2 py-1 text-sm" value={l.deliveredQty}
                          onChange={(e) => setLine(i, 'deliveredQty', e.target.value)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              Delivery lines are copied from the sales order with delivered qty defaulting to ordered.
            </p>
          </>
        )}

        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving || !salesOrderId}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Saving...' : 'Create Delivery'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PodModal({ delivery, onClose, onConfirmed }: { delivery: any; onClose: () => void; onConfirmed: () => void }) {
  const [carrier, setCarrier] = useState(delivery.carrier || '');
  const [trackingNumber, setTrackingNumber] = useState(delivery.trackingNumber || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      await deliveriesApi.confirmPod(delivery.id, {
        note: note || undefined,
        carrier: carrier || null,
        trackingNumber: trackingNumber || null,
      });
      onConfirmed();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to confirm POD');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold">Confirm POD — {delivery.deliveryNumber}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Carrier</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={carrier}
              onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. BlueDart" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tracking Number</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Tracking #" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">POD Note</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" value={note} rows={3}
              onChange={(e) => setNote(e.target.value)} placeholder="Proof of delivery note" />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button onClick={confirm} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Confirming...' : 'Confirm Delivery'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GoodsIssueModal({ delivery, onClose, onIssued }: { delivery: any; onClose: () => void; onIssued: () => void }) {
  const [carrier, setCarrier] = useState(delivery.carrier || '');
  const [trackingNumber, setTrackingNumber] = useState(delivery.trackingNumber || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const issue = async () => {
    setSaving(true);
    setError(null);
    try {
      await deliveriesApi.goodsIssue(delivery.id, {
        carrier: carrier || null,
        trackingNumber: trackingNumber || null,
      });
      onIssued();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to issue goods');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold">Goods Issue — {delivery.deliveryNumber}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          This deducts stock for each line and ships the delivery.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Carrier</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={carrier}
              onChange={(e) => setCarrier(e.target.value)} placeholder="e.g. BlueDart" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tracking Number</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Tracking #" />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button onClick={issue} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Issuing...' : 'Issue & Ship'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [issuing, setIssuing] = useState<any>(null);
  const [podFor, setPodFor] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    deliveriesApi.list()
      .then((res) => setDeliveries(unwrap(res) || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const doAction = async (fn: () => Promise<any>, key: string) => {
    setBusy(key);
    try {
      await fn();
      load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Truck className="h-6 w-6 text-blue-600" /> Deliveries
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Outbound delivery processing — pick, goods issue and POD</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus className="h-4 w-4" /> New Delivery
        </button>
      </div>

      <div className="bg-white rounded-xl border">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : deliveries.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No deliveries yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Delivery #', 'SO Ref', 'Customer', 'Date', 'Carrier / Tracking', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {deliveries.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono">{d.deliveryNumber}</td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{d.salesOrderId ? d.salesOrderId.slice(0, 8) : '—'}</td>
                  <td className="px-4 py-2">{d.customerName || '—'}</td>
                  <td className="px-4 py-2">{d.deliveryDate}</td>
                  <td className="px-4 py-2">
                    {d.carrier || d.trackingNumber ? (
                      <span className="text-xs">
                        {d.carrier || '—'}{d.trackingNumber ? ` · ${d.trackingNumber}` : ''}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-2">{statusBadge(d.status)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-3 justify-end">
                      {d.status === 'DRAFT' && (
                        <button onClick={() => doAction(() => deliveriesApi.pick(d.id), `pick-${d.id}`)}
                          disabled={busy === `pick-${d.id}`}
                          className="flex items-center gap-1 text-amber-600 hover:text-amber-700 text-xs" title="Pick / allocate">
                          <PackageCheck className="h-4 w-4" /> Pick
                        </button>
                      )}
                      {d.status === 'PICKED' && (
                        <button onClick={() => setIssuing(d)}
                          className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs" title="Goods issue">
                          <Send className="h-4 w-4" /> Goods Issue
                        </button>
                      )}
                      {d.status === 'SHIPPED' && (
                        <button onClick={() => setPodFor(d)}
                          className="flex items-center gap-1 text-green-600 hover:text-green-700 text-xs" title="Confirm proof of delivery">
                          <ClipboardCheck className="h-4 w-4" /> Confirm POD
                        </button>
                      )}
                      {['DRAFT', 'PICKED', 'SHIPPED'].includes(d.status) && (
                        <button onClick={() => doAction(() => deliveriesApi.cancel(d.id), `cancel-${d.id}`)}
                          disabled={busy === `cancel-${d.id}`}
                          className="flex items-center gap-1 text-gray-400 hover:text-red-600 text-xs" title="Cancel delivery">
                          <Ban className="h-4 w-4" /> Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && <NewDeliveryModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
      {issuing && <GoodsIssueModal delivery={issuing} onClose={() => setIssuing(null)} onIssued={() => { setIssuing(null); load(); }} />}
      {podFor && <PodModal delivery={podFor} onClose={() => setPodFor(null)} onConfirmed={() => { setPodFor(null); load(); }} />}
    </div>
  );
}
