import { useState, useEffect } from 'react';
import { SlidersHorizontal, Save, CheckCircle2 } from 'lucide-react';
import { procurementApi } from '../../api/procurement';

export default function ToleranceSettingsPage() {
  const [form, setForm] = useState({
    name: 'Global Tolerance',
    pricePercentTolerance: 5,
    qtyPercentTolerance: 5,
    autoPostWithinTolerance: true,
    isActive: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    procurementApi.getTolerancePolicy()
      .then(res => {
        const p = res.data?.data ?? res.data;
        if (p) setForm(f => ({
          ...f,
          name: p.name ?? f.name,
          pricePercentTolerance: Number(p.pricePercentTolerance ?? f.pricePercentTolerance),
          qtyPercentTolerance: Number(p.qtyPercentTolerance ?? f.qtyPercentTolerance),
          autoPostWithinTolerance: p.autoPostWithinTolerance ?? f.autoPostWithinTolerance,
          isActive: p.isActive ?? f.isActive,
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await procurementApi.saveTolerancePolicy(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const LABEL = 'block text-sm font-medium text-gray-700 mb-1';

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-2 mb-1">
        <SlidersHorizontal className="h-5 w-5 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Invoice Tolerance Settings</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Vendor invoices within tolerance of the PO can auto-post; those outside are blocked for manual review.
      </p>

      {loading ? (
        <div className="text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <div>
            <label className={LABEL}>Policy Name</label>
            <input className={INPUT} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Price Variance Tolerance (%)</label>
              <input className={INPUT} type="number" min={0} step={0.1} value={form.pricePercentTolerance}
                onChange={e => setForm(f => ({ ...f, pricePercentTolerance: Number(e.target.value) }))} />
            </div>
            <div>
              <label className={LABEL}>Quantity Variance Tolerance (%)</label>
              <input className={INPUT} type="number" min={0} step={0.1} value={form.qtyPercentTolerance}
                onChange={e => setForm(f => ({ ...f, qtyPercentTolerance: Number(e.target.value) }))} />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.autoPostWithinTolerance}
              onChange={e => setForm(f => ({ ...f, autoPostWithinTolerance: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-700">Auto-post invoices that match within tolerance</span>
          </label>
          <div className="flex items-center gap-3 pt-2">
            <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
              <Save className="h-4 w-4" /> {saving ? 'Saving...' : 'Save Policy'}
            </button>
            {saved && <span className="flex items-center gap-1 text-green-700 text-sm"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
          </div>
        </div>
      )}
    </div>
  );
}
