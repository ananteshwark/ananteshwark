import { useState, useEffect } from 'react';
import { salesApi } from '../../api/sales';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: 'bg-gray-100 text-gray-600', ORDERED: 'bg-blue-100 text-blue-700',
  RECEIVED: 'bg-yellow-100 text-yellow-700', FULFILLED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700',
};
const TYPE_STYLES: Record<string, string> = {
  DROP_SHIP: 'bg-purple-100 text-purple-700', BACK_TO_BACK: 'bg-indigo-100 text-indigo-700',
};

export default function FulfillmentPage() {
  const [links, setLinks] = useState<any[]>([]);
  const [dash, setDash] = useState<any>(null);
  const [form, setForm] = useState({ salesOrderLineId: '', supplyType: 'DROP_SHIP', vendorId: '', quantity: '' });
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);
  async function load() {
    setLinks(unwrap(await salesApi.listSupplyLinks()));
    const d = await salesApi.supplyDashboard();
    setDash(d.data?.data ?? d.data);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      await salesApi.createSupplyLink({ salesOrderLineId: form.salesOrderLineId, supplyType: form.supplyType, vendorId: form.vendorId || undefined, quantity: form.quantity ? Number(form.quantity) : undefined });
      setForm({ salesOrderLineId: '', supplyType: 'DROP_SHIP', vendorId: '', quantity: '' });
      load();
    } catch (err: any) { setMsg(err.response?.data?.message ?? 'Failed'); }
  }

  async function markOrdered(id: string) {
    const docId = prompt('Supply document ID (PO/production order):'); if (!docId) return;
    const docNum = prompt('Document number:') || undefined;
    try {
      await salesApi.markSupplyOrdered(id, { supplyDocType: 'PURCHASE_ORDER', supplyDocId: docId, supplyDocNumber: docNum });
      load();
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function receive(id: string) {
    const qty = prompt('Receipt quantity:'); if (!qty) return;
    try { await salesApi.receiveSupply(id, Number(qty)); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Order Fulfillment Orchestration</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Order Management parity — drop-ship (supplier delivers to customer) and back-to-back
          (procure/produce-to-order) supply linkage. Drop-ship receipts relieve the sales-order line directly.
        </p>
      </div>

      {dash && (
        <div className="grid grid-cols-4 gap-3">
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Open Links</p><p className="text-2xl font-bold">{dash.open}</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Drop-Ship</p><p className="text-2xl font-bold text-purple-600">{dash.byType?.DROP_SHIP ?? 0}</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Back-to-Back</p><p className="text-2xl font-bold text-indigo-600">{dash.byType?.BACK_TO_BACK ?? 0}</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Awaiting Order</p><p className="text-2xl font-bold text-gray-600">{dash.byStatus?.REQUESTED ?? 0}</p></div>
        </div>
      )}

      <form onSubmit={create} className="border rounded-lg p-4 bg-gray-50 grid grid-cols-4 gap-3 items-end max-w-4xl">
        <div><label className="text-xs text-gray-500">SO Line ID</label><input required value={form.salesOrderLineId} onChange={(e) => setForm({ ...form, salesOrderLineId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Supply Type</label><select value={form.supplyType} onChange={(e) => setForm({ ...form, supplyType: e.target.value })} className="w-full border rounded px-2 py-1 text-sm"><option value="DROP_SHIP">Drop-Ship</option><option value="BACK_TO_BACK">Back-to-Back</option></select></div>
        <div><label className="text-xs text-gray-500">Vendor ID</label><input value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Create Supply Link</button>
        {msg && <p className="col-span-4 text-xs text-red-500">{msg}</p>}
      </form>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">SO Line</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Fulfilled</th><th className="px-3 py-2 text-left">Supply Doc</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">
            {links.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No supply links.</td></tr> : links.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${TYPE_STYLES[l.supplyType]}`}>{l.supplyType}</span></td>
                <td className="px-3 py-2 font-mono text-xs">{l.salesOrderLineId?.slice(0, 8)}</td>
                <td className="px-3 py-2 text-right">{l.quantity}</td>
                <td className="px-3 py-2 text-right text-gray-500">{l.fulfilledQty}</td>
                <td className="px-3 py-2 text-xs">{l.supplyDocNumber ?? '—'}</td>
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_STYLES[l.status]}`}>{l.status}</span></td>
                <td className="px-3 py-2"><div className="flex gap-2">
                  {l.status === 'REQUESTED' && <button onClick={() => markOrdered(l.id)} className="text-blue-600 text-xs hover:underline">order</button>}
                  {(l.status === 'ORDERED' || l.status === 'RECEIVED') && <button onClick={() => receive(l.id)} className="text-green-600 text-xs hover:underline">receive</button>}
                  {l.status !== 'FULFILLED' && l.status !== 'CANCELLED' && <button onClick={() => salesApi.cancelSupplyLink(l.id).then(load)} className="text-red-500 text-xs hover:underline">cancel</button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
