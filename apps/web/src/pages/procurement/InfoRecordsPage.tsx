import { useState, useEffect } from 'react';
import { Plus, X, Trash2, Pencil } from 'lucide-react';
import { procurementApi } from '../../api/procurement';
import { financeApi } from '../../api/finance';
import { inventoryApi } from '../../api/inventory';

interface InfoRecord {
  id: string;
  vendorId: string;
  itemId: string;
  price: number;
  currency: string;
  leadTimeDays: number;
  minOrderQty?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  lastPurchasePrice?: number | null;
  isActive: boolean;
}

const defaultForm = {
  vendorId: '',
  itemId: '',
  price: '',
  currency: 'INR',
  leadTimeDays: 0,
  minOrderQty: '',
  validFrom: '',
  validTo: '',
};

export default function InfoRecordsPage() {
  const [records, setRecords] = useState<InfoRecord[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const unwrap = (res: any) => res.data?.data ?? res.data ?? [];

  const fetchRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await procurementApi.getInfoRecords();
      const data = unwrap(res);
      setRecords(Array.isArray(data) ? data : data.items ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load info records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
    financeApi.getVendors({ limit: 200 })
      .then((r) => setVendors(unwrap(r).items ?? unwrap(r)))
      .catch(() => {});
    inventoryApi.getItems({ limit: 500 })
      .then((r) => setItems(unwrap(r).items ?? unwrap(r)))
      .catch(() => {});
  }, []);

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? id;
  const itemName = (id: string) => {
    const it = items.find((i) => i.id === id);
    return it ? `${it.code ?? ''} ${it.name ?? ''}`.trim() : id;
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (r: InfoRecord) => {
    setEditingId(r.id);
    setForm({
      vendorId: r.vendorId,
      itemId: r.itemId,
      price: String(r.price ?? ''),
      currency: r.currency ?? 'INR',
      leadTimeDays: r.leadTimeDays ?? 0,
      minOrderQty: r.minOrderQty == null ? '' : String(r.minOrderQty),
      validFrom: r.validFrom ? r.validFrom.slice(0, 10) : '',
      validTo: r.validTo ? r.validTo.slice(0, 10) : '',
    });
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingId(null);
    setForm(defaultForm);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload = {
        vendorId: form.vendorId,
        itemId: form.itemId,
        price: Number(form.price),
        currency: form.currency,
        leadTimeDays: Number(form.leadTimeDays),
        minOrderQty: form.minOrderQty === '' ? undefined : Number(form.minOrderQty),
        validFrom: form.validFrom || undefined,
        validTo: form.validTo || undefined,
      };
      if (editingId) await procurementApi.updateInfoRecord(editingId, payload);
      else await procurementApi.createInfoRecord(payload);
      closeModal();
      fetchRecords();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? `Failed to ${editingId ? 'update' : 'create'} info record`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this info record?')) return;
    try {
      await procurementApi.deleteInfoRecord(id);
      fetchRecords();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to delete');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Purchasing Info Records</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Info Record
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Currency</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Lead Time (d)</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valid</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Active</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {records.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">No info records found</td>
                </tr>
              )}
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{vendorName(r.vendorId)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{itemName(r.itemId)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900">{Number(r.price).toFixed(4)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{r.currency}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{r.leadTimeDays}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {(r.validFrom ?? '—')} → {(r.validTo ?? '—')}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${r.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                      {r.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => openEdit(r)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
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
              <h2 className="text-lg font-semibold text-gray-900">{editingId ? 'Edit Info Record' : 'New Info Record'}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <select
                  required
                  value={form.vendorId}
                  onChange={(e) => setForm({ ...form, vendorId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select vendor</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
                <select
                  required
                  value={form.itemId}
                  onChange={(e) => setForm({ ...form, itemId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select item</option>
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>{`${i.code ?? ''} ${i.name ?? ''}`.trim()}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    required
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <input
                    type="text"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lead Time (days)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.leadTimeDays}
                    onChange={(e) => setForm({ ...form, leadTimeDays: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Min Order Qty</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={form.minOrderQty}
                    onChange={(e) => setForm({ ...form, minOrderQty: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid From</label>
                  <input
                    type="date"
                    value={form.validFrom}
                    onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid To</label>
                  <input
                    type="date"
                    value={form.validTo}
                    onChange={(e) => setForm({ ...form, validTo: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : editingId ? 'Save' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
