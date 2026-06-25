import React, { useState, useEffect } from 'react';
import { financeApi } from '../../api/finance';
import { Plus, Trash2, Calculator, Percent, TrendingDown } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CashDiscountTier {
  discountPercent: number;
  withinDays: number;
}

interface PaymentTerm {
  id: string;
  code: string;
  name: string;
  netDays: number;
  tiers: CashDiscountTier[];
  description: string | null;
  isActive: boolean;
}

interface DiscountComputation {
  applicable: boolean;
  termCode: string;
  baseAmount: number;
  discountPercent: number;
  discountAmount: number;
  netAmount: number;
  daysTaken: number;
  tier: CashDiscountTier | null;
  netDueDate: string;
}

interface UtilizationRow {
  partyId: string;
  partyName: string;
  type: 'AP' | 'AR';
  discountCount: number;
  totalBase: number;
  totalDiscount: number;
  avgPercent: number;
}

interface UtilizationReport {
  rows: UtilizationRow[];
  totals: { totalBase: number; totalDiscount: number; discountCount: number };
}

const fmt = (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const tierSummary = (t: PaymentTerm) =>
  t.tiers.length === 0
    ? `Net ${t.netDays}`
    : t.tiers.map(x => `${x.discountPercent}%/${x.withinDays}d`).join(', ') + `, net ${t.netDays}`;

// ─── Tab: Payment Terms ───────────────────────────────────────────────────────

function PaymentTermsTab() {
  const [terms, setTerms] = useState<PaymentTerm[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    code: '',
    name: '',
    netDays: 30,
    description: '',
    tiers: [{ discountPercent: 2, withinDays: 10 }] as CashDiscountTier[],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await financeApi.getPaymentTerms();
      setTerms(res.data?.data ?? res.data ?? []);
    } catch {
      setError('Failed to load payment terms');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addTier = () =>
    setForm({ ...form, tiers: [...form.tiers, { discountPercent: 1, withinDays: 20 }] });
  const removeTier = (i: number) =>
    setForm({ ...form, tiers: form.tiers.filter((_, idx) => idx !== i) });
  const updateTier = (i: number, field: keyof CashDiscountTier, v: number) =>
    setForm({ ...form, tiers: form.tiers.map((t, idx) => (idx === i ? { ...t, [field]: v } : t)) });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await financeApi.createPaymentTerm({
        code: form.code,
        name: form.name,
        netDays: form.netDays,
        description: form.description || undefined,
        tiers: form.tiers,
      });
      setShowForm(false);
      setForm({ code: '', name: '', netDays: 30, description: '', tiers: [{ discountPercent: 2, withinDays: 10 }] });
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to create payment term');
    } finally {
      setSaving(false);
    }
  };

  const handleSeed = async () => {
    try {
      await financeApi.seedDefaultPaymentTerms();
      load();
    } catch {
      setError('Failed to seed defaults');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this payment term?')) return;
    try {
      await financeApi.deletePaymentTerm(id);
      load();
    } catch {
      setError('Failed to delete');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={handleSeed} className="text-sm text-gray-600 hover:text-gray-900 border rounded px-3 py-1.5">
          Seed defaults
        </button>
        <button
          onClick={() => setShowForm(true)}
          className="ml-auto flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700"
        >
          <Plus size={15} /> New Term
        </button>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} className="border rounded-lg p-4 bg-gray-50 space-y-3">
          <h3 className="font-medium text-sm">New Payment Term</h3>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <label className="space-y-1">
              <span className="text-gray-600">Code *</span>
              <input required className="border rounded px-2 py-1 w-full" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="2/10NET30" />
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-gray-600">Name *</span>
              <input required className="border rounded px-2 py-1 w-full" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-gray-600">Net Days *</span>
              <input required type="number" min={0} className="border rounded px-2 py-1 w-full" value={form.netDays} onChange={e => setForm({ ...form, netDays: parseInt(e.target.value) || 0 })} />
            </label>
            <label className="space-y-1 col-span-2">
              <span className="text-gray-600">Description</span>
              <input className="border rounded px-2 py-1 w-full" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-medium">Discount Tiers</span>
            {form.tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <input type="number" min={0} max={100} step={0.01} className="border rounded px-2 py-1 w-24 text-right" value={t.discountPercent} onChange={e => updateTier(i, 'discountPercent', parseFloat(e.target.value) || 0)} />
                <span className="text-gray-500">% if paid within</span>
                <input type="number" min={0} className="border rounded px-2 py-1 w-20 text-right" value={t.withinDays} onChange={e => updateTier(i, 'withinDays', parseInt(e.target.value) || 0)} />
                <span className="text-gray-500">days</span>
                <button type="button" onClick={() => removeTier(i)} className="text-gray-400 hover:text-red-500">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button type="button" onClick={addTier} className="text-blue-600 text-xs hover:underline flex items-center gap-1">
              <Plus size={12} /> Add tier
            </button>
          </div>

          <div className="flex gap-2">
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
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Terms</th>
              <th className="px-3 py-2 font-medium text-center">Net Days</th>
              <th className="px-3 py-2 font-medium text-center">Status</th>
              <th className="px-3 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>}
            {!loading && terms.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">No payment terms — seed defaults to get started</td></tr>
            )}
            {terms.map(t => (
              <tr key={t.id} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{t.code}</td>
                <td className="px-3 py-2">{t.name}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{tierSummary(t)}</td>
                <td className="px-3 py-2 text-center">{t.netDays}</td>
                <td className="px-3 py-2 text-center">
                  <span className={t.isActive ? 'text-green-600 text-xs' : 'text-gray-400 text-xs'}>
                    {t.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => handleDelete(t.id)} className="text-gray-400 hover:text-red-600">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Discount Calculator ─────────────────────────────────────────────────

function CalculatorTab() {
  const [terms, setTerms] = useState<PaymentTerm[]>([]);
  const [form, setForm] = useState({
    termCode: '',
    baseAmount: '1000',
    baselineDate: new Date().toISOString().slice(0, 10),
    paymentDate: new Date().toISOString().slice(0, 10),
  });
  const [result, setResult] = useState<DiscountComputation | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    financeApi.getPaymentTerms({ activeOnly: true }).then(res => {
      const data = res.data?.data ?? res.data ?? [];
      setTerms(data);
      if (data.length && !form.termCode) setForm(f => ({ ...f, termCode: data[0].code }));
    });
  }, []);

  const handleCompute = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setResult(null);
    try {
      const res = await financeApi.computeCashDiscount({
        termCode: form.termCode,
        baseAmount: parseFloat(form.baseAmount),
        baselineDate: form.baselineDate,
        paymentDate: form.paymentDate,
      });
      setResult(res.data?.data ?? res.data);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Computation failed');
    }
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <form onSubmit={handleCompute} className="grid grid-cols-2 gap-3 text-sm">
        <label className="space-y-1">
          <span className="text-gray-600">Payment Term</span>
          <select required className="border rounded px-2 py-1.5 w-full" value={form.termCode} onChange={e => setForm({ ...form, termCode: e.target.value })}>
            <option value="">Select…</option>
            {terms.map(t => <option key={t.id} value={t.code}>{t.code} — {t.name}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-gray-600">Base Amount</span>
          <input type="number" min={0} step={0.01} className="border rounded px-2 py-1.5 w-full" value={form.baseAmount} onChange={e => setForm({ ...form, baseAmount: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-gray-600">Invoice/Bill Date</span>
          <input type="date" className="border rounded px-2 py-1.5 w-full" value={form.baselineDate} onChange={e => setForm({ ...form, baselineDate: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-gray-600">Payment Date</span>
          <input type="date" className="border rounded px-2 py-1.5 w-full" value={form.paymentDate} onChange={e => setForm({ ...form, paymentDate: e.target.value })} />
        </label>
        <div className="col-span-2">
          <button type="submit" className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-1.5 rounded text-sm hover:bg-blue-700">
            <Calculator size={15} /> Compute Discount
          </button>
        </div>
      </form>

      {error && <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">{error}</div>}

      {result && (
        <div className={`border rounded-lg p-4 ${result.applicable ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Percent size={16} className={result.applicable ? 'text-green-600' : 'text-gray-400'} />
            <span className="font-medium text-sm">
              {result.applicable
                ? `${result.discountPercent}% discount applies`
                : 'No discount — outside the discount window'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-gray-600">Base amount</span><span>{fmt(result.baseAmount)}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Days taken</span><span>{result.daysTaken}</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Discount %</span><span>{result.discountPercent}%</span></div>
            <div className="flex justify-between"><span className="text-gray-600">Net due date</span><span>{result.netDueDate}</span></div>
            <div className="flex justify-between font-medium text-red-600"><span>Discount amount</span><span>-{fmt(result.discountAmount)}</span></div>
            <div className="flex justify-between font-medium text-green-700"><span>Net payable</span><span>{fmt(result.netAmount)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Utilization Report ──────────────────────────────────────────────────

function UtilizationTab() {
  const [report, setReport] = useState<UtilizationReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({ type: '', from: '', to: '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await financeApi.getCashDiscountUtilization({
        ...(filters.type && { type: filters.type }),
        ...(filters.from && { from: filters.from }),
        ...(filters.to && { to: filters.to }),
      });
      setReport(res.data?.data ?? res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3 text-sm">
        <label className="space-y-1">
          <span className="text-gray-600">Type</span>
          <select className="border rounded px-2 py-1.5" value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}>
            <option value="">All</option>
            <option value="AP">AP (received)</option>
            <option value="AR">AR (granted)</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-gray-600">From</span>
          <input type="date" className="border rounded px-2 py-1.5" value={filters.from} onChange={e => setFilters({ ...filters, from: e.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-gray-600">To</span>
          <input type="date" className="border rounded px-2 py-1.5" value={filters.to} onChange={e => setFilters({ ...filters, to: e.target.value })} />
        </label>
        <button onClick={load} className="bg-blue-600 text-white px-4 py-1.5 rounded hover:bg-blue-700">Apply</button>
      </div>

      {report && (
        <div className="grid grid-cols-3 gap-3">
          <div className="border rounded-lg p-3">
            <div className="text-xs text-gray-500">Total Discount</div>
            <div className="text-xl font-semibold text-green-700 flex items-center gap-1">
              <TrendingDown size={18} /> {fmt(report.totals.totalDiscount)}
            </div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-gray-500">Base Settled</div>
            <div className="text-xl font-semibold">{fmt(report.totals.totalBase)}</div>
          </div>
          <div className="border rounded-lg p-3">
            <div className="text-xs text-gray-500">Discount Events</div>
            <div className="text-xl font-semibold">{report.totals.discountCount}</div>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b text-left">
              <th className="px-3 py-2 font-medium">Party</th>
              <th className="px-3 py-2 font-medium text-center">Type</th>
              <th className="px-3 py-2 font-medium text-right">Events</th>
              <th className="px-3 py-2 font-medium text-right">Base</th>
              <th className="px-3 py-2 font-medium text-right">Discount</th>
              <th className="px-3 py-2 font-medium text-right">Avg %</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="text-center py-8 text-gray-400">Loading…</td></tr>}
            {!loading && (!report || report.rows.length === 0) && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">No cash discounts recorded</td></tr>
            )}
            {report?.rows.map((r, i) => (
              <tr key={i} className="border-b hover:bg-gray-50">
                <td className="px-3 py-2">{r.partyName}</td>
                <td className="px-3 py-2 text-center">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${r.type === 'AP' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                    {r.type}
                  </span>
                </td>
                <td className="px-3 py-2 text-right">{r.discountCount}</td>
                <td className="px-3 py-2 text-right">{fmt(r.totalBase)}</td>
                <td className="px-3 py-2 text-right text-green-700 font-medium">{fmt(r.totalDiscount)}</td>
                <td className="px-3 py-2 text-right">{r.avgPercent}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'terms' | 'calculator' | 'utilization';

export default function CashDiscountsPage() {
  const [tab, setTab] = useState<Tab>('terms');

  const tabs: { id: Tab; label: string }[] = [
    { id: 'terms', label: 'Payment Terms' },
    { id: 'calculator', label: 'Discount Calculator' },
    { id: 'utilization', label: 'Utilization Report' },
  ];

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Cash Discounts</h1>
        <p className="text-sm text-gray-500 mt-1">
          Tiered early-payment terms (e.g. 2/10 net 30) applied automatically on AP payment runs and AR receipts
        </p>
      </div>

      <div className="flex border-b gap-1">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'terms' && <PaymentTermsTab />}
        {tab === 'calculator' && <CalculatorTab />}
        {tab === 'utilization' && <UtilizationTab />}
      </div>
    </div>
  );
}
