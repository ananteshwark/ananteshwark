import { useState, useEffect } from 'react';
import { Plus, CheckCircle, Truck, PackageCheck, X, ArrowRight } from 'lucide-react';
import { salesApi } from '../../api/sales';

const STATUS_COLORS: Record<string, string> = {
  DRAFT:       'bg-gray-100 text-gray-600',
  CONFIRMED:   'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  SHIPPED:     'bg-purple-100 text-purple-700',
  COMPLETED:   'bg-green-100 text-green-700',
  CANCELLED:   'bg-red-100 text-red-700',
};

const FULFIL_COLORS: Record<string, string> = {
  PENDING:   'bg-gray-100 text-gray-500',
  PARTIAL:   'bg-yellow-100 text-yellow-700',
  FULFILLED: 'bg-green-100 text-green-700',
};

function CreateOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    contactName: '', orderDate: new Date().toISOString().slice(0, 10),
    expectedDeliveryDate: '', currency: 'INR', notes: '',
  });
  const [lines, setLines] = useState([
    { itemName: '', quantity: '1', unitPrice: '0', discountPct: '0', taxPct: '0' },
  ]);
  const [saving, setSaving] = useState(false);

  const addLine = () => setLines(l => [...l, { itemName: '', quantity: '1', unitPrice: '0', discountPct: '0', taxPct: '0' }]);
  const removeLine = (i: number) => setLines(l => l.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      await salesApi.createOrder({
        ...form,
        lines: lines.map(l => ({
          itemName: l.itemName,
          quantity: parseFloat(l.quantity),
          unitPrice: parseFloat(l.unitPrice),
          discountPct: parseFloat(l.discountPct),
          taxPct: parseFloat(l.taxPct),
        })),
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">New Sales Order</h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          {[
            { label: 'Customer / Contact', key: 'contactName', type: 'text' },
            { label: 'Order Date', key: 'orderDate', type: 'date' },
            { label: 'Expected Delivery', key: 'expectedDeliveryDate', type: 'date' },
            { label: 'Currency', key: 'currency', type: 'text' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
              <input
                type={f.type}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2}
              value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-medium">Order Lines</h3>
          <button onClick={addLine} className="text-blue-600 text-xs hover:underline">+ Add Line</button>
        </div>
        <div className="border rounded-lg overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Item', 'Qty', 'Unit Price', 'Disc %', 'Tax %', ''].map(h => (
                  <th key={h} className="text-left px-2 py-1 text-xs text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => (
                <tr key={i} className="border-t">
                  <td className="px-2 py-1">
                    <input className="w-full border rounded px-2 py-1 text-xs" value={line.itemName}
                      onChange={e => setLines(l => l.map((x, j) => j === i ? { ...x, itemName: e.target.value } : x))} />
                  </td>
                  {(['quantity', 'unitPrice', 'discountPct', 'taxPct'] as const).map(k => (
                    <td key={k} className="px-2 py-1 w-20">
                      <input type="number" className="w-full border rounded px-2 py-1 text-xs text-right" value={line[k]}
                        onChange={e => setLines(l => l.map((x, j) => j === i ? { ...x, [k]: e.target.value } : x))} />
                    </td>
                  ))}
                  <td className="px-2 py-1">
                    <button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600">
                      <X className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button
            onClick={save}
            disabled={saving || !form.orderDate || lines.every(l => !l.itemName)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

function OrderDetailPanel({ order, onClose, onUpdated }: { order: any; onClose: () => void; onUpdated: () => void }) {
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    salesApi.getOrderLines(order.id).then(r => setLines(r.data?.data || [])).finally(() => setLoading(false));
  }, [order.id]);

  const action = async (fn: () => Promise<any>) => {
    await fn();
    onUpdated();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/20">
      <div className="bg-white shadow-xl w-full max-w-2xl h-full overflow-y-auto p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{order.orderNumber}</h2>
            <p className="text-sm text-gray-500">{order.contactName || 'No customer'}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex gap-2 mb-4">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[order.status] || ''}`}>{order.status}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${FULFIL_COLORS[order.fulfilmentStatus] || ''}`}>{order.fulfilmentStatus}</span>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-6">
          <div><span className="text-gray-500">Order Date:</span> {order.orderDate}</div>
          <div><span className="text-gray-500">Expected Delivery:</span> {order.expectedDeliveryDate || '—'}</div>
          <div><span className="text-gray-500">Subtotal:</span> {(order.subtotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          <div><span className="text-gray-500">Total:</span> <strong>{(order.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {order.currency}</strong></div>
          {order.arInvoiceId && <div className="col-span-2 text-green-600 text-xs">AR Invoice created: {order.arInvoiceId}</div>}
        </div>

        <h3 className="text-sm font-medium mb-2">Order Lines</h3>
        {loading ? <p className="text-sm text-gray-400">Loading...</p> : (
          <table className="w-full text-sm mb-6">
            <thead className="bg-gray-50">
              <tr>
                {['Item', 'Qty', 'Unit Price', 'Shipped', 'Total', 'Status'].map(h => (
                  <th key={h} className="text-left px-2 py-1 text-xs text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l: any) => (
                <tr key={l.id}>
                  <td className="px-2 py-1">{l.itemName}</td>
                  <td className="px-2 py-1 text-right">{l.quantity}</td>
                  <td className="px-2 py-1 text-right">{(l.unitPrice ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-2 py-1 text-right">{l.qtyShipped}</td>
                  <td className="px-2 py-1 text-right">{(l.lineTotal ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-2 py-1">
                    <span className={`text-xs ${l.status === 'FULFILLED' ? 'text-green-600' : l.status === 'PARTIAL' ? 'text-yellow-600' : 'text-gray-400'}`}>
                      {l.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="flex flex-wrap gap-2">
          {order.status === 'DRAFT' && (
            <button
              onClick={() => action(() => salesApi.confirmOrder(order.id))}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg"
            >
              <CheckCircle className="h-4 w-4" /> Confirm
            </button>
          )}
          {(order.status === 'CONFIRMED' || order.status === 'IN_PROGRESS') && (
            <button
              onClick={() => action(() => salesApi.shipOrder(order.id, { shippedDate: new Date().toISOString().slice(0, 10) }))}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg"
            >
              <Truck className="h-4 w-4" /> Mark Shipped
            </button>
          )}
          {order.status === 'SHIPPED' && (
            <button
              onClick={() => action(() => salesApi.completeOrder(order.id))}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg"
            >
              <PackageCheck className="h-4 w-4" /> Complete & Invoice
            </button>
          )}
          {!['COMPLETED', 'CANCELLED'].includes(order.status) && (
            <button
              onClick={() => action(() => salesApi.cancelOrder(order.id))}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded-lg"
            >
              <X className="h-4 w-4" /> Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SalesOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = () => {
    setLoading(true);
    salesApi.getOrders({ page, limit: 20, search: search || undefined, status: statusFilter || undefined })
      .then(r => {
        setOrders(r.data?.items || []);
        setTotal(r.data?.total || 0);
      }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, statusFilter, page]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales Orders</h1>
          <p className="text-sm text-gray-500 mt-0.5">Quote-to-order-to-invoice management</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> New Order
        </button>
      </div>

      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex gap-3">
          <input
            type="text"
            placeholder="Search orders..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="border rounded-lg px-3 py-2 text-sm w-56"
          />
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            {['DRAFT', 'CONFIRMED', 'IN_PROGRESS', 'SHIPPED', 'COMPLETED', 'CANCELLED'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <span className="ml-auto text-sm text-gray-400 self-center">{total} orders</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No sales orders found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Order #', 'Customer', 'Date', 'Total', 'Status', 'Fulfilment', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((o: any) => (
                <tr key={o.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(o)}>
                  <td className="px-4 py-2 font-mono text-xs font-medium">{o.orderNumber}</td>
                  <td className="px-4 py-2">{o.contactName || '—'}</td>
                  <td className="px-4 py-2 text-gray-500">{o.orderDate}</td>
                  <td className="px-4 py-2 text-right font-medium">
                    {(o.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} {o.currency}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || ''}`}>{o.status}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${FULFIL_COLORS[o.fulfilmentStatus] || ''}`}>{o.fulfilmentStatus}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-400">
                    <ArrowRight className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {total > 20 && (
          <div className="p-3 border-t flex justify-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40">Prev</button>
            <span className="px-3 py-1 text-sm">Page {page} of {Math.ceil(total / 20)}</span>
            <button disabled={page >= Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 text-sm border rounded disabled:opacity-40">Next</button>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateOrderModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
      {selected && (
        <OrderDetailPanel
          order={selected}
          onClose={() => setSelected(null)}
          onUpdated={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}
