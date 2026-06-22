import { useState, useEffect } from 'react';
import { Undo2, Plus, X, Trash2 } from 'lucide-react';
import { procurementApi } from '../../api/procurement';
import { financeApi } from '../../api/finance';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  POSTED: 'bg-green-100 text-green-800',
};

interface LineForm {
  itemDescription: string;
  quantity: number;
  unitCost: number;
}

export default function PurchaseReturnsPage() {
  const [returns, setReturns] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ vendorId: '', returnDate: '', reason: '' });
  const [lines, setLines] = useState<LineForm[]>([{ itemDescription: '', quantity: 1, unitCost: 0 }]);

  const unwrap = (res: any) => { const d = res.data?.data ?? res.data ?? {}; return d.items ?? d ?? []; };

  const load = () => {
    setLoading(true);
    procurementApi.getPurchaseReturns()
      .then(r => setReturns(unwrap(r)))
      .catch(() => setReturns([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    financeApi.getVendors({ limit: 500 }).then(r => setVendors(unwrap(r))).catch(() => {});
  }, []);

  const vendorName = (id: string) => vendors.find(v => v.id === id)?.name ?? '-';

  const addLine = () => setLines(ls => [...ls, { itemDescription: '', quantity: 1, unitCost: 0 }]);
  const removeLine = (i: number) => setLines(ls => ls.filter((_, idx) => idx !== i));
  const updateLine = (i: number, patch: Partial<LineForm>) =>
    setLines(ls => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await procurementApi.createPurchaseReturn({
        vendorId: form.vendorId,
        returnDate: form.returnDate,
        reason: form.reason || undefined,
        lines: lines.map(l => ({
          itemDescription: l.itemDescription,
          quantity: Number(l.quantity),
          unitCost: Number(l.unitCost),
        })),
      });
      setShowModal(false);
      setForm({ vendorId: '', returnDate: '', reason: '' });
      setLines([{ itemDescription: '', quantity: 1, unitCost: 0 }]);
      load();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to create return');
    }
  };

  const post = async (id: string) => {
    if (!confirm('Post this return? Stock will be reversed and a debit note raised.')) return;
    await procurementApi.postPurchaseReturn(id);
    load();
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Returns to Vendor</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">Return received goods and raise debit notes</p>
        </div>
        <button onClick={() => { setError(null); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus className="h-4 w-4" /> New Return
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Return #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Vendor</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Reason</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
                <th className="px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {returns.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No returns yet</td></tr>
              ) : returns.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.returnNumber ?? r.id?.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-gray-800">{r.vendorName ?? vendorName(r.vendorId)}</td>
                  <td className="px-4 py-3 text-gray-500">{r.returnDate}</td>
                  <td className="px-4 py-3 text-gray-500">{r.reason ?? '-'}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{Number(r.totalAmount ?? 0).toLocaleString()}</td>
                  <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? 'bg-gray-100'}`}>{r.status}</span></td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'DRAFT' && (
                      <button onClick={() => post(r.id)} className="text-blue-600 hover:underline text-xs">Post</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold">New Vendor Return</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={submit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
                    <select required value={form.vendorId} onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value="">Select vendor...</option>
                      {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Return Date *</label>
                    <input required type="date" value={form.returnDate} onChange={e => setForm(f => ({ ...f, returnDate: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                  <input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Defective, wrong item, excess..." />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Lines</label>
                    <button type="button" onClick={addLine} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Plus className="h-3 w-3" /> Add line</button>
                  </div>
                  <div className="space-y-2">
                    {lines.map((l, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center">
                        <input className="col-span-6 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" placeholder="Description" value={l.itemDescription} onChange={e => updateLine(i, { itemDescription: e.target.value })} />
                        <input className="col-span-2 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" type="number" min={0} placeholder="Qty" value={l.quantity} onChange={e => updateLine(i, { quantity: Number(e.target.value) })} />
                        <input className="col-span-3 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" type="number" min={0} placeholder="Unit cost" value={l.unitCost} onChange={e => updateLine(i, { unitCost: Number(e.target.value) })} />
                        <button type="button" onClick={() => removeLine(i)} className="col-span-1 text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    ))}
                  </div>
                  <div className="text-right text-sm font-medium text-gray-700 mt-3">Total: {total.toLocaleString()}</div>
                </div>
              </div>
              <div className="flex gap-3 p-5 border-t flex-shrink-0">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">Create Return</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
