import { useState, useEffect } from 'react';
import { Plus, X, Check, Ban, Send } from 'lucide-react';
import { procurementApi } from '../../api/procurement';

interface ServiceEntry {
  id: string;
  sheetNumber?: string | null;
  poId: string;
  periodFrom: string;
  periodTo: string;
  description: string;
  quantity: number;
  uom: string;
  rate: number;
  amount: number;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-700',
};

const defaultForm = {
  poId: '',
  periodFrom: '',
  periodTo: '',
  description: '',
  quantity: '',
  uom: 'EA',
  rate: '',
};

export default function ServiceEntrySheetPage() {
  const [entries, setEntries] = useState<ServiceEntry[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const unwrap = (res: any) => res.data?.data ?? res.data ?? [];

  const fetchEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await procurementApi.getServiceEntries();
      const data = unwrap(res);
      setEntries(Array.isArray(data) ? data : data.items ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load service entry sheets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
    procurementApi.getPurchaseOrders({ limit: 200 })
      .then((r) => {
        const d = unwrap(r);
        setPos(Array.isArray(d) ? d : d.items ?? []);
      })
      .catch(() => {});
  }, []);

  const poLabel = (id: string) => {
    const po = pos.find((p) => p.id === id);
    return po ? (po.poNumber ?? id) : id;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await procurementApi.createServiceEntry({
        poId: form.poId,
        periodFrom: form.periodFrom,
        periodTo: form.periodTo,
        description: form.description,
        quantity: Number(form.quantity),
        uom: form.uom,
        rate: Number(form.rate),
      });
      setShowModal(false);
      setForm(defaultForm);
      fetchEntries();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Failed to create service entry sheet');
    } finally {
      setSubmitting(false);
    }
  };

  const doAction = async (fn: () => Promise<any>) => {
    try {
      await fn();
      fetchEntries();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Action failed');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Service Entry Sheets</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Entry Sheet
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sheet #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Period</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {entries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No service entry sheets found</td>
                </tr>
              )}
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{e.sheetNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{poLabel(e.poId)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{e.periodFrom} → {e.periodTo}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{e.description}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900">{Number(e.amount).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[e.status]}`}>{e.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    {e.status === 'DRAFT' && (
                      <button
                        onClick={() => doAction(() => procurementApi.submitServiceEntry(e.id))}
                        className="inline-flex items-center gap-1 text-xs px-2 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100"
                      >
                        <Send className="w-3.5 h-3.5" /> Submit
                      </button>
                    )}
                    {e.status === 'SUBMITTED' && (
                      <>
                        <button
                          onClick={() => doAction(() => procurementApi.approveServiceEntry(e.id))}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100"
                        >
                          <Check className="w-3.5 h-3.5" /> Approve
                        </button>
                        <button
                          onClick={() => {
                            const reason = prompt('Rejection reason (optional)') ?? undefined;
                            doAction(() => procurementApi.rejectServiceEntry(e.id, { reason }));
                          }}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100"
                        >
                          <Ban className="w-3.5 h-3.5" /> Reject
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">New Service Entry Sheet</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Order</label>
                <select
                  required
                  value={form.poId}
                  onChange={(e) => setForm({ ...form, poId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select PO</option>
                  {pos.map((p) => (
                    <option key={p.id} value={p.id}>{p.poNumber ?? p.id}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Period From</label>
                  <input
                    type="date"
                    required
                    value={form.periodFrom}
                    onChange={(e) => setForm({ ...form, periodFrom: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Period To</label>
                  <input
                    type="date"
                    required
                    value={form.periodTo}
                    onChange={(e) => setForm({ ...form, periodTo: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  required
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Service performed"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    required
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">UoM</label>
                  <input
                    type="text"
                    value={form.uom}
                    onChange={(e) => setForm({ ...form, uom: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rate</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={form.rate}
                    onChange={(e) => setForm({ ...form, rate: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
