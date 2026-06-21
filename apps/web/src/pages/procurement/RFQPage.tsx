import { useState, useEffect } from 'react';
import { procurementApi } from '../../api/procurement';
import { financeApi } from '../../api/finance';
import { Plus } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ISSUED: 'bg-blue-100 text-blue-700',
  CLOSED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

function NewRfqDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    notes: '',
    vendorIds: [] as string[],
    lines: [{ description: '', quantity: 1, uom: 'EA' }],
  });
  const [vendors, setVendors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    financeApi.getVendors({ limit: 200 }).then(r => {
      setVendors(r.data?.data?.items ?? r.data?.data ?? r.data?.items ?? []);
    }).catch(() => {});
  }, []);

  const toggleVendor = (id: string) => {
    setForm(f => ({
      ...f,
      vendorIds: f.vendorIds.includes(id) ? f.vendorIds.filter(v => v !== id) : [...f.vendorIds, id],
    }));
  };

  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, { description: '', quantity: 1, uom: 'EA' }] }));
  const removeLine = (i: number) => setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  const updateLine = (i: number, field: string, value: any) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await procurementApi.createRfq({ ...form, lines: form.lines.map((l) => ({ ...l, quantity: Number(l.quantity) })) });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create RFQ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b"><h2 className="text-lg font-semibold">New RFQ</h2></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Issue Date *</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.issueDate} onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} required />
            </div>
          </div>
          {vendors.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Vendors *</label>
              <div className="border rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
                {vendors.map((v: any) => (
                  <label key={v.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 py-0.5 rounded">
                    <input
                      type="checkbox"
                      checked={form.vendorIds.includes(v.id)}
                      onChange={() => toggleVendor(v.id)}
                      className="rounded"
                    />
                    {v.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Lines *</label>
              <button type="button" onClick={addLine} className="text-sm text-blue-600 hover:underline">+ Add Line</button>
            </div>
            {form.lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center mb-2">
                <input className="col-span-6 border rounded-lg px-2 py-1.5 text-sm" placeholder="Description *" value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} required />
                <input className="col-span-2 border rounded-lg px-2 py-1.5 text-sm" placeholder="UOM" value={line.uom} onChange={(e) => updateLine(i, 'uom', e.target.value)} />
                <input type="number" className="col-span-3 border rounded-lg px-2 py-1.5 text-sm" placeholder="Qty *" value={line.quantity} min={0} onChange={(e) => updateLine(i, 'quantity', e.target.value)} required />
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

export default function RFQPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [comparative, setComparative] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await procurementApi.getRfqs();
      setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleAction = async (action: string, id: string, extra?: any) => {
    try {
      if (action === 'issue') await procurementApi.issueRfq(id);
      else if (action === 'close') await procurementApi.closeRfq(id);
      else if (action === 'cancel') await procurementApi.cancelRfq(id);
      else if (action === 'award') {
        const vendorId = extra ?? prompt('Enter Vendor ID to award:');
        if (!vendorId) return;
        await procurementApi.awardRfq(id, { vendorId });
      }
      loadData();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Action failed');
    }
  };

  const loadComparative = async (id: string) => {
    try {
      const res = await procurementApi.getComparative(id);
      setComparative(res.data);
    } catch (e: any) {
      alert('Failed to load comparative statement');
    }
  };

  const items = data?.items || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Request for Quotation</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} RFQs</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus className="h-4 w-4" /> New RFQ
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No RFQs found</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">RFQ #</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Title</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Issue Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Due Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((rfq: any) => (
                <tr key={rfq.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{rfq.rfqNumber}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{rfq.title}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[rfq.status] || ''}`}>{rfq.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{rfq.issueDate}</td>
                  <td className="px-4 py-3 text-gray-500">{rfq.dueDate}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {rfq.status === 'DRAFT' && (
                        <button onClick={() => handleAction('issue', rfq.id)} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Issue</button>
                      )}
                      {rfq.status === 'ISSUED' && (
                        <button onClick={() => handleAction('close', rfq.id)} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">Close</button>
                      )}
                      {rfq.status === 'CLOSED' && !rfq.awardedVendorId && (
                        <button onClick={() => handleAction('award', rfq.id)} className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100">Award</button>
                      )}
                      {rfq.awardedVendorId && (
                        <span className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded font-medium">Awarded</span>
                      )}
                      <button onClick={() => loadComparative(rfq.id)} className="text-xs px-2 py-1 bg-gray-50 text-gray-700 rounded hover:bg-gray-100">Comparative</button>
                      {['DRAFT', 'ISSUED'].includes(rfq.status) && (
                        <button onClick={() => handleAction('cancel', rfq.id)} className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100">Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {comparative && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">Comparative Statement</h2>
              <button onClick={() => setComparative(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6">
              {comparative.lines?.map((line: any) => (
                <div key={line.lineId} className="mb-4">
                  <div className="font-medium text-sm mb-2">{line.description} (Qty: {line.quantity})</div>
                  <table className="w-full text-xs border">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Vendor</th>
                        <th className="px-3 py-2 text-right">Unit Price</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {line.vendors?.map((v: any) => (
                        <tr key={v.vendorId} className="border-t">
                          <td className="px-3 py-2">{v.vendorId}</td>
                          <td className="px-3 py-2 text-right">{v.unitPrice ?? '—'}</td>
                          <td className="px-3 py-2 text-right">{v.totalPrice ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {showNew && <NewRfqDialog onClose={() => setShowNew(false)} onSaved={loadData} />}
    </div>
  );
}
