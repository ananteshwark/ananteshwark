import { useState, useEffect } from 'react';
import { procurementApi } from '../../api/procurement';
import { financeApi } from '../../api/finance';
import { Plus } from 'lucide-react';
import CurrencySelect from '../../components/ui/CurrencySelect';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  PENDING_APPROVAL: 'bg-orange-100 text-orange-700',
  APPROVED: 'bg-green-100 text-green-700',
  RELEASED: 'bg-cyan-100 text-cyan-700',
  SENT: 'bg-blue-100 text-blue-700',
  PARTIALLY_RECEIVED: 'bg-yellow-100 text-yellow-700',
  RECEIVED: 'bg-emerald-100 text-emerald-700',
  INVOICED: 'bg-indigo-100 text-indigo-700',
  CLOSED: 'bg-purple-100 text-purple-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

function NewPoDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [vendors, setVendors] = useState<any[]>([]);
  const [form, setForm] = useState({
    vendorId: '',
    vendorName: '',
    poDate: new Date().toISOString().slice(0, 10),
    deliveryDate: '',
    currency: 'INR',
    notes: '',
    lines: [{ description: '', quantity: 1, unitPrice: 0, uom: 'EA', taxRate: 0 }],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    financeApi.getVendors({ limit: 100 }).then((r) => setVendors(r.data.items || [])).catch(() => {});
  }, []);

  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, { description: '', quantity: 1, unitPrice: 0, uom: 'EA', taxRate: 0 }] }));
  const removeLine = (i: number) => setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  const updateLine = (i: number, field: string, value: any) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)) }));

  const handleVendorChange = (id: string) => {
    const v = vendors.find((v) => v.id === id);
    setForm((f) => ({ ...f, vendorId: id, vendorName: v?.name || '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await procurementApi.createPurchaseOrder({
        ...form,
        lines: form.lines.map((l) => ({ ...l, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), taxRate: Number(l.taxRate) })),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create PO');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b"><h2 className="text-lg font-semibold">New Purchase Order</h2></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.vendorId} onChange={(e) => handleVendorChange(e.target.value)} required>
                <option value="">Select vendor...</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PO Date *</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.poDate} onChange={(e) => setForm((f) => ({ ...f, poDate: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Date</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.deliveryDate} onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <CurrencySelect className="w-full border rounded-lg px-3 py-2 text-sm" value={form.currency} onChange={(code) => setForm((f) => ({ ...f, currency: code }))} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Lines *</label>
              <button type="button" onClick={addLine} className="text-sm text-blue-600 hover:underline">+ Add Line</button>
            </div>
            {form.lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center mb-2">
                <input className="col-span-4 border rounded-lg px-2 py-1.5 text-sm" placeholder="Description *" value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} required />
                <input className="col-span-2 border rounded-lg px-2 py-1.5 text-sm" placeholder="UOM" value={line.uom} onChange={(e) => updateLine(i, 'uom', e.target.value)} />
                <input type="number" className="col-span-2 border rounded-lg px-2 py-1.5 text-sm" placeholder="Qty *" value={line.quantity} min={0} onChange={(e) => updateLine(i, 'quantity', e.target.value)} required />
                <input type="number" className="col-span-2 border rounded-lg px-2 py-1.5 text-sm" placeholder="Price *" value={line.unitPrice} min={0} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)} required />
                <input type="number" className="col-span-1 border rounded-lg px-2 py-1.5 text-sm" placeholder="Tax%" value={line.taxRate} min={0} onChange={(e) => updateLine(i, 'taxRate', e.target.value)} />
                <button type="button" onClick={() => removeLine(i)} className="col-span-1 text-red-500 text-sm" disabled={form.lines.length === 1}>✕</button>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{loading ? 'Creating...' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function PurchaseOrdersPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await procurementApi.getPurchaseOrders();
      setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleAction = async (action: string, id: string) => {
    try {
      if (action === 'submit-for-approval') await procurementApi.submitPoForApproval(id);
      else if (action === 'approve-level') await procurementApi.approvePoLevel(id, {});
      else if (action === 'reject-approval') {
        const comments = prompt('Reason for rejection (optional):') || undefined;
        await procurementApi.rejectPoApproval(id, { comments });
      }
      else if (action === 'approve') await procurementApi.approvePurchaseOrder(id);
      else if (action === 'release') await procurementApi.releasePo(id);
      else if (action === 'send') await procurementApi.sendPurchaseOrder(id);
      else if (action === 'cancel') await procurementApi.cancelPurchaseOrder(id);
      loadData();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Action failed');
    }
  };

  const loadDetail = async (id: string) => {
    try {
      const res = await procurementApi.getPurchaseOrder(id);
      setSelected(res.data?.data ?? res.data);
    } catch {}
  };

  const items = data?.items || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchase Orders</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} orders</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus className="h-4 w-4" /> New PO
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No purchase orders found</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">PO #</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Vendor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">PO Date</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((po: any) => (
                <tr key={po.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">
                    <button onClick={() => loadDetail(po.id)} className="hover:underline text-blue-600">{po.poNumber}</button>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{po.vendorName}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[po.status] || ''}`}>{po.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{po.poDate}</td>
                  <td className="px-4 py-3 text-right font-medium">{po.total?.toLocaleString()} {po.currency}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {po.status === 'DRAFT' && <button onClick={() => handleAction('submit-for-approval', po.id)} className="text-xs px-2 py-1 bg-orange-50 text-orange-700 rounded hover:bg-orange-100">Submit for Approval</button>}
                      {po.status === 'PENDING_APPROVAL' && <button onClick={() => handleAction('approve-level', po.id)} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">Approve{po.currentApprovalLevel ? ` (L${po.currentApprovalLevel + 1})` : ''}</button>}
                      {po.status === 'PENDING_APPROVAL' && <button onClick={() => handleAction('reject-approval', po.id)} className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100">Reject</button>}
                      {po.status === 'APPROVED' && <button onClick={() => handleAction('release', po.id)} className="text-xs px-2 py-1 bg-cyan-50 text-cyan-700 rounded hover:bg-cyan-100">Release</button>}
                      {['RELEASED', 'APPROVED'].includes(po.status) && <button onClick={() => handleAction('send', po.id)} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Send</button>}
                      {['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RELEASED', 'SENT'].includes(po.status) && <button onClick={() => handleAction('cancel', po.id)} className="text-xs px-2 py-1 bg-gray-50 text-gray-600 rounded hover:bg-gray-100">Cancel</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">{selected.poNumber} — {selected.vendorName}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Description</th>
                    <th className="px-3 py-2 text-right">Ordered</th>
                    <th className="px-3 py-2 text-right">Received</th>
                    <th className="px-3 py-2 text-right">Unit Price</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.lines?.map((l: any) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-3 py-2">{l.lineNumber}</td>
                      <td className="px-3 py-2">{l.description}</td>
                      <td className="px-3 py-2 text-right">{l.quantity} {l.uom}</td>
                      <td className="px-3 py-2 text-right">{l.quantityReceived}</td>
                      <td className="px-3 py-2 text-right">{l.unitPrice?.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">{l.lineTotal?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showNew && <NewPoDialog onClose={() => setShowNew(false)} onSaved={loadData} />}
    </div>
  );
}
