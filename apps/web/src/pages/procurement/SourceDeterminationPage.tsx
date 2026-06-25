import React, { useState, useEffect } from 'react';
import { procurementApi } from '../../api/procurement';
import { Plus, Trash2, RefreshCw, Search, CheckCircle, XCircle, AlertTriangle, Star } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SourceList {
  id: string;
  itemId: string;
  itemCode: string | null;
  itemDescription: string | null;
  vendorId: string;
  vendorName: string | null;
  validFrom: string;
  validTo: string | null;
  priority: number;
  isFixed: boolean;
  isBlocked: boolean;
  infoRecordId: string | null;
  outlineAgreementId: string | null;
  leadTimeDays: number;
  minOrderQty: number | null;
  currency: string;
  notes: string | null;
  isActive: boolean;
}

interface QuotaItem {
  vendorId: string;
  vendorName: string;
  quotaPercentage: number;
  maxQuantity?: number | null;
  allocatedQty: number;
  priority: number;
}

interface QuotaArrangement {
  id: string;
  itemId: string;
  itemCode: string | null;
  itemDescription: string | null;
  validFrom: string;
  validTo: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  items: QuotaItem[];
  notes: string | null;
}

interface SourceProposal {
  rank: number;
  source: 'FIXED' | 'QUOTA' | 'SOURCE_LIST' | 'INFO_RECORD';
  vendorId: string;
  vendorName: string | null;
  quotaPercentage?: number;
  priority?: number;
  leadTimeDays: number;
  minOrderQty: number | null;
  currency: string;
  isFixed: boolean;
  isBlocked: boolean;
  sourceListId?: string;
  quotaArrangementId?: string;
}

interface DeterminationResult {
  itemId: string;
  date: string;
  proposals: SourceProposal[];
  recommended: SourceProposal | null;
  hasFixed: boolean;
  hasQuota: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sourceLabel = (src: SourceProposal['source']) => {
  const map: Record<string, string> = {
    FIXED: 'Fixed',
    QUOTA: 'Quota',
    SOURCE_LIST: 'Source List',
    INFO_RECORD: 'Info Record',
  };
  return map[src] ?? src;
};

const sourceBadge = (src: SourceProposal['source'], isFixed: boolean, isBlocked: boolean) => {
  if (isBlocked) return 'bg-red-100 text-red-700';
  if (isFixed) return 'bg-purple-100 text-purple-700';
  if (src === 'QUOTA') return 'bg-blue-100 text-blue-700';
  return 'bg-gray-100 text-gray-700';
};

// ─── Tab: Source Lists ────────────────────────────────────────────────────────

function SourceListsTab() {
  const [lists, setLists] = useState<SourceList[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterItemId, setFilterItemId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    itemId: '',
    itemCode: '',
    itemDescription: '',
    vendorId: '',
    vendorName: '',
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: '',
    priority: 1,
    isFixed: false,
    isBlocked: false,
    leadTimeDays: 0,
    minOrderQty: '',
    currency: 'INR',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await procurementApi.getSourceLists({
        ...(filterItemId && { itemId: filterItemId }),
        activeOnly: true,
      });
      setLists(res.data?.data ?? res.data ?? []);
    } catch {
      setError('Failed to load source lists');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await procurementApi.createSourceList({
        ...form,
        validTo: form.validTo || undefined,
        minOrderQty: form.minOrderQty ? parseFloat(form.minOrderQty) : undefined,
      });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to create source list entry');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this source list entry?')) return;
    try {
      await procurementApi.deleteSourceList(id);
      load();
    } catch {
      setError('Failed to delete');
    }
  };

  const toggleBlock = async (entry: SourceList) => {
    try {
      await procurementApi.updateSourceList(entry.id, { isBlocked: !entry.isBlocked });
      load();
    } catch {
      setError('Failed to update');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          className="border rounded px-3 py-1.5 text-sm flex-1 max-w-xs"
          placeholder="Filter by Item ID (UUID)"
          value={filterItemId}
          onChange={e => setFilterItemId(e.target.value)}
        />
        <button onClick={load} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <Search size={15} /> Search
        </button>
        <button
          onClick={() => setShowForm(true)}
          className="ml-auto flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
        >
          <Plus size={15} /> Add Entry
        </button>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-gray-50 space-y-3">
          <h3 className="font-medium text-sm">New Source List Entry</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-gray-600">Item ID *</span>
              <input required className="border rounded px-2 py-1 w-full" value={form.itemId} onChange={e => setForm({ ...form, itemId: e.target.value })} placeholder="UUID" />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Item Code</span>
              <input className="border rounded px-2 py-1 w-full" value={form.itemCode} onChange={e => setForm({ ...form, itemCode: e.target.value })} />
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-gray-600">Item Description</span>
              <input className="border rounded px-2 py-1 w-full" value={form.itemDescription} onChange={e => setForm({ ...form, itemDescription: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Vendor ID *</span>
              <input required className="border rounded px-2 py-1 w-full" value={form.vendorId} onChange={e => setForm({ ...form, vendorId: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Vendor Name</span>
              <input className="border rounded px-2 py-1 w-full" value={form.vendorName} onChange={e => setForm({ ...form, vendorName: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Valid From *</span>
              <input required type="date" className="border rounded px-2 py-1 w-full" value={form.validFrom} onChange={e => setForm({ ...form, validFrom: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Valid To</span>
              <input type="date" className="border rounded px-2 py-1 w-full" value={form.validTo} onChange={e => setForm({ ...form, validTo: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Priority</span>
              <input type="number" min={1} className="border rounded px-2 py-1 w-full" value={form.priority} onChange={e => setForm({ ...form, priority: parseInt(e.target.value) || 1 })} />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Lead Time (days)</span>
              <input type="number" min={0} className="border rounded px-2 py-1 w-full" value={form.leadTimeDays} onChange={e => setForm({ ...form, leadTimeDays: parseInt(e.target.value) || 0 })} />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Min Order Qty</span>
              <input type="number" min={0} className="border rounded px-2 py-1 w-full" value={form.minOrderQty} onChange={e => setForm({ ...form, minOrderQty: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Currency</span>
              <input className="border rounded px-2 py-1 w-full" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} />
            </label>
            <div className="flex items-center gap-4 col-span-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isFixed} onChange={e => setForm({ ...form, isFixed: e.target.checked })} />
                Fixed (mandatory source)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isBlocked} onChange={e => setForm({ ...form, isBlocked: e.target.checked })} />
                Blocked
              </label>
            </div>
            <label className="space-y-1 col-span-2">
              <span className="text-gray-600">Notes</span>
              <input className="border rounded px-2 py-1 w-full" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </label>
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="border px-4 py-1.5 rounded text-sm hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Vendor</th>
              <th className="px-3 py-2 font-medium">Valid</th>
              <th className="px-3 py-2 font-medium text-center">Priority</th>
              <th className="px-3 py-2 font-medium text-center">Fixed</th>
              <th className="px-3 py-2 font-medium text-center">Lead (d)</th>
              <th className="px-3 py-2 font-medium text-center">Status</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">Loading…</td></tr>
            )}
            {!loading && lists.length === 0 && (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">No source list entries found</td></tr>
            )}
            {lists.map(sl => (
              <tr key={sl.id} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2">
                  <div className="font-mono text-xs text-gray-500">{sl.itemCode ?? sl.itemId.slice(0, 8) + '…'}</div>
                  <div className="text-xs text-gray-700">{sl.itemDescription}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{sl.vendorName ?? sl.vendorId}</div>
                </td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {sl.validFrom} → {sl.validTo ?? '∞'}
                </td>
                <td className="px-3 py-2 text-center">{sl.priority}</td>
                <td className="px-3 py-2 text-center">
                  {sl.isFixed && <Star size={14} className="text-purple-600 mx-auto" />}
                </td>
                <td className="px-3 py-2 text-center">{sl.leadTimeDays}</td>
                <td className="px-3 py-2 text-center">
                  {sl.isBlocked ? (
                    <span className="text-red-600 text-xs font-medium">Blocked</span>
                  ) : (
                    <span className="text-green-600 text-xs font-medium">Active</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toggleBlock(sl)}
                      title={sl.isBlocked ? 'Unblock' : 'Block'}
                      className="text-gray-500 hover:text-orange-600"
                    >
                      {sl.isBlocked ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    </button>
                    <button onClick={() => handleDelete(sl.id)} className="text-gray-400 hover:text-red-600">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Quota Arrangements ──────────────────────────────────────────────────

function QuotaArrangementsTab() {
  const [arrangements, setArrangements] = useState<QuotaArrangement[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterItemId, setFilterItemId] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    itemId: '',
    itemCode: '',
    itemDescription: '',
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: '',
    notes: '',
    items: [
      { vendorId: '', vendorName: '', quotaPercentage: 50, maxQuantity: '', priority: 1 },
      { vendorId: '', vendorName: '', quotaPercentage: 50, maxQuantity: '', priority: 2 },
    ],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await procurementApi.getQuotaArrangements({
        ...(filterItemId && { itemId: filterItemId }),
        activeOnly: true,
      });
      setArrangements(res.data?.data ?? res.data ?? []);
    } catch {
      setError('Failed to load quota arrangements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const total = form.items.reduce((s, i) => s + (Number(i.quotaPercentage) || 0), 0);

  const addVendorRow = () =>
    setForm({ ...form, items: [...form.items, { vendorId: '', vendorName: '', quotaPercentage: 0, maxQuantity: '', priority: form.items.length + 1 }] });

  const removeVendorRow = (idx: number) =>
    setForm({ ...form, items: form.items.filter((_, i) => i !== idx) });

  const updateItem = (idx: number, field: string, value: any) =>
    setForm({ ...form, items: form.items.map((it, i) => i === idx ? { ...it, [field]: value } : it) });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await procurementApi.createQuotaArrangement({
        itemId: form.itemId,
        itemCode: form.itemCode || undefined,
        itemDescription: form.itemDescription || undefined,
        validFrom: form.validFrom,
        validTo: form.validTo || undefined,
        notes: form.notes || undefined,
        items: form.items.map((it, i) => ({
          vendorId: it.vendorId,
          vendorName: it.vendorName,
          quotaPercentage: Number(it.quotaPercentage),
          maxQuantity: it.maxQuantity ? Number(it.maxQuantity) : undefined,
          priority: i + 1,
        })),
      });
      setShowForm(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to create quota arrangement');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (id: string) => {
    if (!confirm('Reset all allocation counters to zero for this arrangement?')) return;
    try {
      await procurementApi.resetQuotaAllocations(id);
      load();
    } catch {
      setError('Failed to reset allocations');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          className="border rounded px-3 py-1.5 text-sm flex-1 max-w-xs"
          placeholder="Filter by Item ID (UUID)"
          value={filterItemId}
          onChange={e => setFilterItemId(e.target.value)}
        />
        <button onClick={load} className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
          <Search size={15} /> Search
        </button>
        <button
          onClick={() => setShowForm(true)}
          className="ml-auto flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
        >
          <Plus size={15} /> New Arrangement
        </button>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-gray-50 space-y-4">
          <h3 className="font-medium text-sm">New Quota Arrangement</h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-gray-600">Item ID *</span>
              <input required className="border rounded px-2 py-1 w-full" value={form.itemId} onChange={e => setForm({ ...form, itemId: e.target.value })} placeholder="UUID" />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Item Code</span>
              <input className="border rounded px-2 py-1 w-full" value={form.itemCode} onChange={e => setForm({ ...form, itemCode: e.target.value })} />
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-gray-600">Item Description</span>
              <input className="border rounded px-2 py-1 w-full" value={form.itemDescription} onChange={e => setForm({ ...form, itemDescription: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Valid From *</span>
              <input required type="date" className="border rounded px-2 py-1 w-full" value={form.validFrom} onChange={e => setForm({ ...form, validFrom: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Valid To</span>
              <input type="date" className="border rounded px-2 py-1 w-full" value={form.validTo} onChange={e => setForm({ ...form, validTo: e.target.value })} />
            </label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Vendor Quotas</span>
              <span className={`text-xs font-medium ${Math.abs(total - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                Total: {total}% {Math.abs(total - 100) < 0.01 ? '✓' : '(must be 100)'}
              </span>
            </div>
            <div className="space-y-2">
              {form.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  <input
                    required
                    className="border rounded px-2 py-1 flex-1"
                    placeholder="Vendor ID"
                    value={item.vendorId}
                    onChange={e => updateItem(idx, 'vendorId', e.target.value)}
                  />
                  <input
                    required
                    className="border rounded px-2 py-1 flex-1"
                    placeholder="Vendor Name"
                    value={item.vendorName}
                    onChange={e => updateItem(idx, 'vendorName', e.target.value)}
                  />
                  <div className="flex items-center gap-1">
                    <input
                      required
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      className="border rounded px-2 py-1 w-20 text-right"
                      value={item.quotaPercentage}
                      onChange={e => updateItem(idx, 'quotaPercentage', parseFloat(e.target.value) || 0)}
                    />
                    <span className="text-gray-500">%</span>
                  </div>
                  <input
                    type="number"
                    min={0}
                    className="border rounded px-2 py-1 w-24"
                    placeholder="Max Qty"
                    value={item.maxQuantity}
                    onChange={e => updateItem(idx, 'maxQuantity', e.target.value)}
                  />
                  {form.items.length > 1 && (
                    <button type="button" onClick={() => removeVendorRow(idx)} className="text-gray-400 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addVendorRow} className="text-blue-600 text-xs hover:underline flex items-center gap-1">
              <Plus size={12} /> Add vendor
            </button>
          </div>

          <div className="flex gap-2">
            <button type="submit" disabled={saving || Math.abs(total - 100) >= 0.01} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="border px-4 py-1.5 rounded text-sm hover:bg-gray-100">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {loading && <div className="text-center py-8 text-gray-400">Loading…</div>}
        {!loading && arrangements.length === 0 && (
          <div className="text-center py-8 text-gray-400">No quota arrangements found</div>
        )}
        {arrangements.map(qa => (
          <div key={qa.id} className="border rounded-lg p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-medium text-sm">{qa.itemDescription ?? qa.itemCode ?? qa.itemId}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {qa.validFrom} → {qa.validTo ?? '∞'} &nbsp;·&nbsp;
                  <span className={qa.status === 'ACTIVE' ? 'text-green-600' : 'text-gray-400'}>
                    {qa.status}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleReset(qa.id)}
                title="Reset allocation counters"
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-600 border rounded px-2 py-1"
              >
                <RefreshCw size={12} /> Reset
              </button>
            </div>

            {/* Quota bar */}
            <div className="flex rounded overflow-hidden h-6 mb-3 text-xs text-white">
              {qa.items.map((qi, i) => {
                const colors = ['bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-purple-500', 'bg-pink-500'];
                return (
                  <div
                    key={i}
                    className={`${colors[i % colors.length]} flex items-center justify-center overflow-hidden`}
                    style={{ width: `${qi.quotaPercentage}%` }}
                    title={`${qi.vendorName}: ${qi.quotaPercentage}%`}
                  >
                    {qi.quotaPercentage >= 15 && `${qi.quotaPercentage}%`}
                  </div>
                );
              })}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="text-left pb-1">Vendor</th>
                    <th className="text-right pb-1">Quota %</th>
                    <th className="text-right pb-1">Allocated</th>
                    <th className="text-right pb-1">Max Qty</th>
                    <th className="text-right pb-1">Prio</th>
                  </tr>
                </thead>
                <tbody>
                  {qa.items.map((qi, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1">{qi.vendorName} <span className="text-gray-400">({qi.vendorId})</span></td>
                      <td className="text-right py-1">{qi.quotaPercentage}%</td>
                      <td className="text-right py-1">{qi.allocatedQty.toLocaleString()}</td>
                      <td className="text-right py-1">{qi.maxQuantity ?? '—'}</td>
                      <td className="text-right py-1">{qi.priority}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Source Determination ────────────────────────────────────────────────

function DetermineSourceTab() {
  const [form, setForm] = useState({ itemId: '', quantity: '100', requiredDate: '' });
  const [result, setResult] = useState<DeterminationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDetermine = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await procurementApi.determineSource({
        itemId: form.itemId,
        quantity: parseFloat(form.quantity),
        requiredDate: form.requiredDate || undefined,
      });
      setResult(res.data?.data ?? res.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Determination failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={handleDetermine} className="flex items-end gap-3">
        <label className="space-y-1 text-sm flex-1 max-w-sm">
          <span className="text-gray-600">Item ID *</span>
          <input
            required
            className="border rounded px-3 py-1.5 w-full"
            placeholder="UUID of item"
            value={form.itemId}
            onChange={e => setForm({ ...form, itemId: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm w-28">
          <span className="text-gray-600">Quantity</span>
          <input
            type="number"
            min={0}
            className="border rounded px-3 py-1.5 w-full"
            value={form.quantity}
            onChange={e => setForm({ ...form, quantity: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm w-40">
          <span className="text-gray-600">Required Date</span>
          <input
            type="date"
            className="border rounded px-3 py-1.5 w-full"
            value={form.requiredDate}
            onChange={e => setForm({ ...form, requiredDate: e.target.value })}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          <Search size={15} /> {loading ? 'Determining…' : 'Determine'}
        </button>
      </form>

      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">{error}</div>}

      {result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span>As of: <strong>{result.date}</strong></span>
            {result.hasFixed && (
              <span className="flex items-center gap-1 text-purple-700 bg-purple-50 border border-purple-200 rounded px-2 py-0.5 text-xs">
                <Star size={12} /> Fixed source active
              </span>
            )}
            {result.hasQuota && (
              <span className="flex items-center gap-1 text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 text-xs">
                Quota arrangement active
              </span>
            )}
          </div>

          {result.recommended && (
            <div className="flex items-start gap-3 p-3 border border-green-200 bg-green-50 rounded-lg">
              <CheckCircle size={18} className="text-green-600 mt-0.5 shrink-0" />
              <div className="text-sm">
                <div className="font-medium text-green-800">Recommended: {result.recommended.vendorName ?? result.recommended.vendorId}</div>
                <div className="text-green-700 text-xs mt-0.5">
                  Source: {sourceLabel(result.recommended.source)}
                  {result.recommended.quotaPercentage != null && ` · Quota: ${result.recommended.quotaPercentage}%`}
                  {` · Lead time: ${result.recommended.leadTimeDays}d`}
                  {result.recommended.minOrderQty != null && ` · Min qty: ${result.recommended.minOrderQty}`}
                </div>
              </div>
            </div>
          )}

          {!result.recommended && (
            <div className="flex items-center gap-2 p-3 border border-yellow-200 bg-yellow-50 rounded-lg text-sm text-yellow-800">
              <AlertTriangle size={16} />
              No valid sources found — all sources are blocked or none configured.
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b text-left">
                  <th className="px-3 py-2 font-medium">Rank</th>
                  <th className="px-3 py-2 font-medium">Source Type</th>
                  <th className="px-3 py-2 font-medium">Vendor</th>
                  <th className="px-3 py-2 font-medium text-right">Quota %</th>
                  <th className="px-3 py-2 font-medium text-right">Lead (d)</th>
                  <th className="px-3 py-2 font-medium text-right">Min Qty</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {result.proposals.map((p, i) => (
                  <tr key={i} className={`border-b hover:bg-gray-50 ${p.isBlocked ? 'opacity-60' : ''}`}>
                    <td className="px-3 py-2 text-gray-500">{p.rank}</td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${sourceBadge(p.source, p.isFixed, p.isBlocked)}`}>
                        {sourceLabel(p.source)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{p.vendorName ?? p.vendorId}</div>
                      <div className="text-xs text-gray-500">{p.vendorId}</div>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">
                      {p.quotaPercentage != null ? `${p.quotaPercentage}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">{p.leadTimeDays}</td>
                    <td className="px-3 py-2 text-right">{p.minOrderQty ?? '—'}</td>
                    <td className="px-3 py-2">
                      {p.isBlocked ? (
                        <span className="text-red-600 text-xs font-medium">Blocked</span>
                      ) : i === 0 || p.rank === result.recommended?.rank ? (
                        <span className="text-green-600 text-xs font-medium">Recommended</span>
                      ) : (
                        <span className="text-gray-400 text-xs">Available</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'source-lists' | 'quota' | 'determine';

export default function SourceDeterminationPage() {
  const [tab, setTab] = useState<Tab>('source-lists');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'source-lists', label: 'Source Lists' },
    { id: 'quota', label: 'Quota Arrangements' },
    { id: 'determine', label: 'Determine Source' },
  ];

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Source Determination</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage source lists, quota arrangements, and auto-determine vendors for procurement
        </p>
      </div>

      <div className="flex border-b gap-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'source-lists' && <SourceListsTab />}
        {tab === 'quota' && <QuotaArrangementsTab />}
        {tab === 'determine' && <DetermineSourceTab />}
      </div>
    </div>
  );
}
