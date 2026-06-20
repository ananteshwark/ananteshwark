import { useState, useEffect } from 'react';
import { Plus, Play, CheckCircle, Package } from 'lucide-react';
import { manufacturingApi } from '../../api/manufacturing';

type Tab = 'orders' | 'boms' | 'work-centers';

const ORDER_STATUS_COLORS: Record<string, string> = {
  PLANNED:     'bg-gray-100 text-gray-600',
  RELEASED:    'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED:   'bg-green-100 text-green-700',
  CANCELLED:   'bg-red-100 text-red-700',
};

const BOM_STATUS_COLORS: Record<string, string> = {
  DRAFT:    'bg-gray-100 text-gray-600',
  ACTIVE:   'bg-green-100 text-green-700',
  OBSOLETE: 'bg-red-100 text-red-700',
};

function CreateOrderModal({ boms, onClose, onCreated }: { boms: any[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    bomId: boms[0]?.id || '', plannedQuantity: '1',
    plannedStartDate: new Date().toISOString().slice(0, 10),
    plannedEndDate: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await manufacturingApi.createOrder({
        ...form, plannedQuantity: parseFloat(form.plannedQuantity),
      });
      onCreated();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">New Production Order</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Bill of Materials</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.bomId}
              onChange={e => setForm(p => ({ ...p, bomId: e.target.value }))}>
              {boms.filter(b => b.status === 'ACTIVE').map((b: any) => (
                <option key={b.id} value={b.id}>{b.bomNumber} — {b.finishedItemName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Planned Quantity</label>
            <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.plannedQuantity}
              onChange={e => setForm(p => ({ ...p, plannedQuantity: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start Date</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.plannedStartDate}
                onChange={e => setForm(p => ({ ...p, plannedStartDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Date</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.plannedEndDate}
                onChange={e => setForm(p => ({ ...p, plannedEndDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving || !form.bomId || !form.plannedEndDate}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Creating...' : 'Create Order'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CompleteOrderModal({ order, onClose, onDone }: { order: any; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    producedQuantity: order.plannedQuantity?.toString() || '0',
    scrapQuantity: '0',
    actualEndDate: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await manufacturingApi.completeOrder(order.id, {
        producedQuantity: parseFloat(form.producedQuantity),
        scrapQuantity: parseFloat(form.scrapQuantity),
        actualEndDate: form.actualEndDate,
      });
      onDone();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Complete Order: {order.orderNumber}</h2>
        <div className="space-y-3">
          {[
            { label: 'Produced Quantity', key: 'producedQuantity' },
            { label: 'Scrap Quantity', key: 'scrapQuantity' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
            </div>
          ))}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Actual End Date</label>
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.actualEndDate}
              onChange={e => setForm(p => ({ ...p, actualEndDate: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Completing...' : 'Complete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ManufacturingPage() {
  const [tab, setTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState<any[]>([]);
  const [boms, setBoms] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<any>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      manufacturingApi.getOrders({ limit: 50 }),
      manufacturingApi.getBoms({ limit: 100 }),
      manufacturingApi.getWorkCenters(),
    ]).then(([r1, r2, r3]) => {
      setOrders(r1.data?.items || []);
      setBoms(r2.data?.items || []);
      setWorkCenters(r3.data || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const releaseOrder = async (id: string) => {
    setActing(id);
    try { await manufacturingApi.releaseOrder(id); load(); } finally { setActing(null); }
  };

  const activeBoms = boms.filter(b => b.status === 'ACTIVE');

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manufacturing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Bills of Materials, production orders, material issuance</p>
        </div>
        <button onClick={() => setShowCreateOrder(true)} disabled={activeBoms.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
          <Plus className="h-4 w-4" /> New Production Order
        </button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        {['PLANNED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED'].map(s => (
          <div key={s} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">{s.replace('_', ' ')}</p>
            <p className="text-2xl font-bold mt-1">{orders.filter(o => o.status === s).length}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([['orders', 'Production Orders'], ['boms', 'Bills of Materials'], ['work-centers', 'Work Centers']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as Tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>{label}</button>
        ))}
      </div>

      {tab === 'orders' && (
        <div className="bg-white rounded-xl border">
          {loading ? <div className="p-8 text-center text-gray-400">Loading...</div> : orders.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No production orders. Create a BOM first, then create orders.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Order #', 'Item', 'Planned Qty', 'Produced', 'Start', 'End', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {orders.map((o: any) => (
                  <tr key={o.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs font-medium">{o.orderNumber}</td>
                    <td className="px-4 py-2">{o.finishedItemName}</td>
                    <td className="px-4 py-2 text-right">{o.plannedQuantity} {o.uom}</td>
                    <td className="px-4 py-2 text-right">{o.producedQuantity}</td>
                    <td className="px-4 py-2 text-gray-500">{o.plannedStartDate}</td>
                    <td className="px-4 py-2 text-gray-500">{o.plannedEndDate}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ORDER_STATUS_COLORS[o.status] || ''}`}>{o.status}</span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        {o.status === 'PLANNED' && (
                          <button onClick={() => releaseOrder(o.id)} disabled={acting === o.id}
                            className="flex items-center gap-1 text-xs text-blue-600 border border-blue-300 rounded px-2 py-1 hover:bg-blue-50">
                            <Play className="h-3 w-3" /> Release
                          </button>
                        )}
                        {['RELEASED', 'IN_PROGRESS'].includes(o.status) && (
                          <button onClick={() => setCompleteTarget(o)}
                            className="flex items-center gap-1 text-xs text-green-600 border border-green-300 rounded px-2 py-1 hover:bg-green-50">
                            <CheckCircle className="h-3 w-3" /> Complete
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
      )}

      {tab === 'boms' && (
        <div className="bg-white rounded-xl border">
          {boms.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No BOMs yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['BOM #', 'Finished Item', 'Qty', 'Version', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {boms.map((b: any) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{b.bomNumber}</td>
                    <td className="px-4 py-2 font-medium">{b.finishedItemName} ({b.finishedItemCode})</td>
                    <td className="px-4 py-2">{b.outputQuantity} {b.outputUom}</td>
                    <td className="px-4 py-2 text-gray-500">{b.version}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${BOM_STATUS_COLORS[b.status] || ''}`}>{b.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'work-centers' && (
        <div className="bg-white rounded-xl border">
          {workCenters.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No work centers configured.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Code', 'Name', 'Capacity/hr', 'Cost/hr'].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {workCenters.map((wc: any) => (
                  <tr key={wc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{wc.code}</td>
                    <td className="px-4 py-2">{wc.name}</td>
                    <td className="px-4 py-2 text-right">{wc.capacityPerHour}</td>
                    <td className="px-4 py-2 text-right">{(wc.costPerHour ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreateOrder && (
        <CreateOrderModal boms={boms} onClose={() => setShowCreateOrder(false)} onCreated={() => { setShowCreateOrder(false); load(); }} />
      )}
      {completeTarget && (
        <CompleteOrderModal order={completeTarget} onClose={() => setCompleteTarget(null)} onDone={() => { setCompleteTarget(null); load(); }} />
      )}
    </div>
  );
}
