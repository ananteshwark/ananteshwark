import { useState, useEffect } from 'react';
import { RefreshCw, Settings, X } from 'lucide-react';
import { creditApi } from '../../api/credit';

const unwrap = (res: any) => res.data?.data ?? res.data;

const MODES = ['NONE', 'WARNING', 'BLOCK'];
const RATINGS = ['', 'AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC'];

function barColor(pct: number) {
  if (pct >= 100) return 'bg-red-500';
  if (pct >= 80) return 'bg-orange-500';
  if (pct >= 50) return 'bg-yellow-500';
  return 'bg-green-500';
}

function EditSettingsModal({ row, onClose, onSaved }: { row: any; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    creditLimit: String(row.creditLimit ?? 0),
    creditRating: row.creditRating ?? '',
    creditCheckMode: row.creditCheckMode ?? 'WARNING',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await creditApi.updateSettings(row.customerId, {
        creditLimit: parseFloat(form.creditLimit) || 0,
        creditRating: form.creditRating || null,
        creditCheckMode: form.creditCheckMode,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold">Credit Settings — {row.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Credit Limit</label>
            <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.creditLimit}
              onChange={e => setForm(p => ({ ...p, creditLimit: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Credit Rating</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.creditRating}
              onChange={e => setForm(p => ({ ...p, creditRating: e.target.value }))}>
              {RATINGS.map(r => <option key={r} value={r}>{r || '— none —'}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Credit Check Mode</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.creditCheckMode}
              onChange={e => setForm(p => ({ ...p, creditCheckMode: e.target.value }))}>
              {MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreditManagementPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [recalcing, setRecalcing] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    creditApi.getReport().then(r => setRows(unwrap(r) || [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const recalc = async (id: string) => {
    setRecalcing(id);
    try {
      await creditApi.recalculate(id);
      load();
    } finally {
      setRecalcing(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credit Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Customer credit limits, exposure and utilization</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No customers found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Customer', 'Rating', 'Mode', 'Limit', 'Exposure', 'Available', 'Utilization', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((c: any) => (
                <tr key={c.customerId} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-gray-400 font-mono">{c.code}</div>
                  </td>
                  <td className="px-4 py-2">{c.creditRating || '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.creditCheckMode === 'BLOCK' ? 'bg-red-100 text-red-700'
                        : c.creditCheckMode === 'WARNING' ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-500'}`}>{c.creditCheckMode}</span>
                  </td>
                  <td className="px-4 py-2 text-right">{(c.creditLimit ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2 text-right">{(c.creditExposure ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className={`px-4 py-2 text-right font-medium ${c.available < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                    {(c.available ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-2 w-48">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${barColor(c.utilizationPct)}`} style={{ width: `${Math.min(100, c.utilizationPct)}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-12 text-right">{(c.utilizationPct ?? 0).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button onClick={() => recalc(c.customerId)} disabled={recalcing === c.customerId}
                        className="text-gray-400 hover:text-blue-600" title="Recalculate exposure">
                        <RefreshCw className={`h-4 w-4 ${recalcing === c.customerId ? 'animate-spin' : ''}`} />
                      </button>
                      <button onClick={() => setEditing(c)} className="text-gray-400 hover:text-gray-700" title="Edit credit settings">
                        <Settings className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <EditSettingsModal row={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}
