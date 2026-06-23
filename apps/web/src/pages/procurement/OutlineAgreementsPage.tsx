import { useState, useEffect } from 'react';
import { Plus, X, CheckCircle, XCircle, PlusCircle } from 'lucide-react';
import { procurementApi } from '../../api/procurement';
import { financeApi } from '../../api/finance';
import { inventoryApi } from '../../api/inventory';

type AgreementType = 'VALUE_CONTRACT' | 'QUANTITY_CONTRACT';
type AgreementStatus = 'DRAFT' | 'ACTIVE' | 'EXPIRED' | 'CLOSED';

interface OutlineAgreement {
  id: string;
  agreementNumber: string;
  vendorId: string;
  vendorName?: string | null;
  type: AgreementType;
  description?: string | null;
  targetValue?: number | null;
  targetQuantity?: number | null;
  itemId?: string | null;
  itemDescription?: string | null;
  currency: string;
  validFrom: string;
  validTo: string;
  status: AgreementStatus;
  releasedValue: number;
  releasedQuantity: number;
}

const defaultForm = {
  vendorId: '',
  type: 'VALUE_CONTRACT' as AgreementType,
  description: '',
  targetValue: '',
  targetQuantity: '',
  itemId: '',
  itemDescription: '',
  currency: 'INR',
  validFrom: '',
  validTo: '',
};

const statusChip: Record<AgreementStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ACTIVE: 'bg-green-100 text-green-800',
  EXPIRED: 'bg-amber-100 text-amber-800',
  CLOSED: 'bg-red-100 text-red-700',
};

export default function OutlineAgreementsPage() {
  const [agreements, setAgreements] = useState<OutlineAgreement[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [releaseFor, setReleaseFor] = useState<OutlineAgreement | null>(null);
  const [releaseForm, setReleaseForm] = useState({ value: '', quantity: '' });
  const [releaseError, setReleaseError] = useState<string | null>(null);

  const unwrap = (res: any) => res.data?.data ?? res.data ?? [];

  const fetchAgreements = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await procurementApi.getOutlineAgreements(
        statusFilter ? { status: statusFilter } : undefined,
      );
      const data = unwrap(res);
      setAgreements(Array.isArray(data) ? data : data.items ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load outline agreements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgreements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    financeApi.getVendors({ limit: 200 })
      .then((r) => setVendors(unwrap(r).items ?? unwrap(r)))
      .catch(() => {});
    inventoryApi.getItems({ limit: 500 })
      .then((r) => setItems(unwrap(r).items ?? unwrap(r)))
      .catch(() => {});
  }, []);

  const vendorName = (a: OutlineAgreement) =>
    a.vendorName || vendors.find((v) => v.id === a.vendorId)?.name || a.vendorId;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const vendor = vendors.find((v) => v.id === form.vendorId);
      await procurementApi.createOutlineAgreement({
        vendorId: form.vendorId,
        vendorName: vendor?.name,
        type: form.type,
        description: form.description || undefined,
        targetValue:
          form.type === 'VALUE_CONTRACT' && form.targetValue !== ''
            ? Number(form.targetValue)
            : undefined,
        targetQuantity:
          form.type === 'QUANTITY_CONTRACT' && form.targetQuantity !== ''
            ? Number(form.targetQuantity)
            : undefined,
        itemId: form.type === 'QUANTITY_CONTRACT' && form.itemId ? form.itemId : undefined,
        itemDescription:
          form.type === 'QUANTITY_CONTRACT' && form.itemDescription
            ? form.itemDescription
            : undefined,
        currency: form.currency,
        validFrom: form.validFrom,
        validTo: form.validTo,
      });
      setShowModal(false);
      setForm(defaultForm);
      fetchAgreements();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Failed to create agreement');
    } finally {
      setSubmitting(false);
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await procurementApi.activateOutlineAgreement(id);
      fetchAgreements();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to activate');
    }
  };

  const handleClose = async (id: string) => {
    if (!confirm('Close this agreement? It can no longer be released against.')) return;
    try {
      await procurementApi.closeOutlineAgreement(id);
      fetchAgreements();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to close');
    }
  };

  const handleRecordRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!releaseFor) return;
    setReleaseError(null);
    try {
      const payload: any = {};
      if (releaseFor.type === 'VALUE_CONTRACT') payload.value = Number(releaseForm.value || 0);
      else payload.quantity = Number(releaseForm.quantity || 0);
      const res = await procurementApi.recordOutlineAgreementRelease(releaseFor.id, payload);
      const data = unwrap(res);
      if (data?.overReleased) {
        alert('Release recorded, but it exceeded the target — released amount was clamped to the target.');
      }
      setReleaseFor(null);
      setReleaseForm({ value: '', quantity: '' });
      fetchAgreements();
    } catch (err: any) {
      setReleaseError(err?.response?.data?.message ?? 'Failed to record release');
    }
  };

  const utilFor = (a: OutlineAgreement) => {
    if (a.type === 'VALUE_CONTRACT') {
      const target = Number(a.targetValue || 0);
      const released = Number(a.releasedValue || 0);
      return {
        target,
        released,
        remaining: Math.max(0, target - released),
        percent: target > 0 ? Math.min(100, (released / target) * 100) : 0,
        suffix: ` ${a.currency}`,
        decimals: 2,
      };
    }
    const target = Number(a.targetQuantity || 0);
    const released = Number(a.releasedQuantity || 0);
    return {
      target,
      released,
      remaining: Math.max(0, target - released),
      percent: target > 0 ? Math.min(100, (released / target) * 100) : 0,
      suffix: ' qty',
      decimals: 4,
    };
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Outline Agreements</h1>
          <p className="text-sm text-gray-500">Framework contracts with release tracking</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Agreement
        </button>
      </div>

      <div className="mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="ACTIVE">Active</option>
          <option value="EXPIRED">Expired</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Number</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Target</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Released</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">Utilization</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Validity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {agreements.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">No outline agreements found</td>
                </tr>
              )}
              {agreements.map((a) => {
                const u = utilFor(a);
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{a.agreementNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{vendorName(a)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {a.type === 'VALUE_CONTRACT' ? 'Value' : 'Quantity'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      {u.target.toFixed(u.decimals)}{u.suffix}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-700">
                      {u.released.toFixed(u.decimals)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${u.percent >= 100 ? 'bg-red-500' : u.percent >= 80 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                            style={{ width: `${u.percent}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-10 text-right">{u.percent.toFixed(0)}%</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Remaining: {u.remaining.toFixed(u.decimals)}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {a.validFrom} → {a.validTo}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusChip[a.status]}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {a.status === 'DRAFT' && (
                          <button
                            onClick={() => handleActivate(a.id)}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Activate
                          </button>
                        )}
                        {a.status === 'ACTIVE' && (
                          <button
                            onClick={() => {
                              setReleaseFor(a);
                              setReleaseForm({ value: '', quantity: '' });
                              setReleaseError(null);
                            }}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100"
                          >
                            <PlusCircle className="w-3.5 h-3.5" /> Release
                          </button>
                        )}
                        {a.status !== 'CLOSED' && (
                          <button
                            onClick={() => handleClose(a.id)}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Close
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">New Outline Agreement</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as AgreementType })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="VALUE_CONTRACT">Value Contract</option>
                  <option value="QUANTITY_CONTRACT">Quantity Contract</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {form.type === 'VALUE_CONTRACT' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Value</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={form.targetValue}
                      onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
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
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Target Quantity</label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        required
                        value={form.targetQuantity}
                        onChange={(e) => setForm({ ...form, targetQuantity: e.target.value })}
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
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Item</label>
                    <select
                      value={form.itemId}
                      onChange={(e) => {
                        const it = items.find((i) => i.id === e.target.value);
                        setForm({
                          ...form,
                          itemId: e.target.value,
                          itemDescription: it ? `${it.code ?? ''} ${it.name ?? ''}`.trim() : form.itemDescription,
                        });
                      }}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">Select item (optional)</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>{`${i.code ?? ''} ${i.name ?? ''}`.trim()}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid From</label>
                  <input
                    type="date"
                    required
                    value={form.validFrom}
                    onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid To</label>
                  <input
                    type="date"
                    required
                    value={form.validTo}
                    onChange={(e) => setForm({ ...form, validTo: e.target.value })}
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

      {releaseFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                Record Release — {releaseFor.agreementNumber}
              </h2>
              <button onClick={() => setReleaseFor(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleRecordRelease} className="px-6 py-4 space-y-4">
              {releaseError && <p className="text-sm text-red-600">{releaseError}</p>}
              {releaseFor.type === 'VALUE_CONTRACT' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Release Value ({releaseFor.currency})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={releaseForm.value}
                    onChange={(e) => setReleaseForm({ ...releaseForm, value: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Release Quantity</label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    required
                    value={releaseForm.quantity}
                    onChange={(e) => setReleaseForm({ ...releaseForm, quantity: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReleaseFor(null)}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
