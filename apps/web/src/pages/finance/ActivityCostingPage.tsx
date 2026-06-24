import { useState, useEffect, useCallback } from 'react';
import { financeApi } from '../../api/finance';
import { Plus, RefreshCw, Layers } from 'lucide-react';

type Tab = 'activityTypes' | 'activityPrices' | 'overheadSheets';

// ─── New Activity Type Dialog ─────────────────────────────────────────────────

function NewActivityTypeDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ code: '', name: '', unit: 'HOURS', costCenterId: '', wipAccountId: '', creditAccountId: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await financeApi.createActivityType({
        ...form,
        costCenterId: form.costCenterId || null,
        wipAccountId: form.wipAccountId || null,
        creditAccountId: form.creditAccountId || null,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create activity type');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-6 border-b"><h2 className="text-lg font-semibold">New Activity Type</h2></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" required value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cost Center ID</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.costCenterId}
                onChange={e => setForm(f => ({ ...f, costCenterId: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WIP Account ID</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.wipAccountId}
                onChange={e => setForm(f => ({ ...f, wipAccountId: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Credit Account ID (CC output clearing)</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.creditAccountId}
                onChange={e => setForm(f => ({ ...f, creditAccountId: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Activity Types Tab ───────────────────────────────────────────────────────

function ActivityTypesTab() {
  const [types, setTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeApi.getActivityTypes();
      setTypes(res.data?.data ?? res.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600">Define activities (machine hours, labor hours, etc.) and their GL accounts.</p>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowDialog(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Activity Type
          </button>
        </div>
      </div>

      {showDialog && <NewActivityTypeDialog onClose={() => setShowDialog(false)} onSaved={load} />}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : types.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No activity types defined yet</div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Code</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Unit</th>
                <th className="px-4 py-3 text-left">Cost Center</th>
                <th className="px-4 py-3 text-left">WIP Account</th>
                <th className="px-4 py-3 text-left">Credit Account</th>
                <th className="px-4 py-3 text-center">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {types.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-medium">{t.code}</td>
                  <td className="px-4 py-3">{t.name}</td>
                  <td className="px-4 py-3 text-gray-500">{t.unit}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.costCenterId ? `${t.costCenterId.slice(0, 8)}…` : '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.wipAccountId ? `${t.wipAccountId.slice(0, 8)}…` : '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.creditAccountId ? `${t.creditAccountId.slice(0, 8)}…` : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${t.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Activity Prices Tab ──────────────────────────────────────────────────────

function ActivityPricesTab() {
  const currentYear = new Date().getFullYear();
  const [fiscalYear, setFiscalYear] = useState(String(currentYear));
  const [prices, setPrices] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ activityTypeId: '', costCenterId: '', fiscalYear: String(currentYear), plannedCost: '', plannedQty: '1' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeApi.getActivityPrices(Number(fiscalYear));
      setPrices(res.data?.data ?? res.data ?? []);
    } finally { setLoading(false); }
  }, [fiscalYear]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await financeApi.setActivityPrice({
        activityTypeId: form.activityTypeId,
        costCenterId: form.costCenterId,
        fiscalYear: Number(form.fiscalYear),
        plannedCost: Number(form.plannedCost),
        plannedQty: Number(form.plannedQty),
      });
      await load();
      setForm(f => ({ ...f, activityTypeId: '', costCenterId: '', plannedCost: '', plannedQty: '1' }));
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to save activity price');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-gray-50 border rounded-xl">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Set Planned Activity Price</h3>
        <form onSubmit={handleSave} className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {error && <div className="col-span-2 md:col-span-5 text-red-600 text-xs bg-red-50 p-2 rounded">{error}</div>}
          <div>
            <label className="block text-xs text-gray-600 mb-1">Activity Type ID</label>
            <input className="w-full border rounded px-2 py-1.5 text-sm" required value={form.activityTypeId}
              onChange={e => setForm(f => ({ ...f, activityTypeId: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Cost Center ID</label>
            <input className="w-full border rounded px-2 py-1.5 text-sm" required value={form.costCenterId}
              onChange={e => setForm(f => ({ ...f, costCenterId: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Fiscal Year</label>
            <input type="number" className="w-full border rounded px-2 py-1.5 text-sm" required value={form.fiscalYear}
              onChange={e => setForm(f => ({ ...f, fiscalYear: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Planned Cost</label>
            <input type="number" step="0.01" className="w-full border rounded px-2 py-1.5 text-sm" required value={form.plannedCost}
              onChange={e => setForm(f => ({ ...f, plannedCost: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Planned Qty</label>
            <input type="number" step="0.0001" className="w-full border rounded px-2 py-1.5 text-sm" required value={form.plannedQty}
              onChange={e => setForm(f => ({ ...f, plannedQty: e.target.value }))} />
          </div>
          <div className="col-span-2 md:col-span-5 flex justify-end">
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving...' : 'Upsert Activity Price'}
            </button>
          </div>
        </form>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-600">Fiscal Year:</label>
        <input type="number" value={fiscalYear} onChange={e => setFiscalYear(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm w-24" />
        <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : prices.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No activity prices for this fiscal year</div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Year</th>
                <th className="px-4 py-3 text-right">Planned Cost</th>
                <th className="px-4 py-3 text-right">Planned Qty</th>
                <th className="px-4 py-3 text-right">Planned Rate</th>
                <th className="px-4 py-3 text-right">Actual Cost</th>
                <th className="px-4 py-3 text-right">Actual Qty</th>
                <th className="px-4 py-3 text-right">Actual Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {prices.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{p.fiscalYear}</td>
                  <td className="px-4 py-3 text-right">{Number(p.plannedCost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right">{Number(p.plannedQty).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-700">{Number(p.plannedRate).toFixed(4)}</td>
                  <td className="px-4 py-3 text-right">{Number(p.actualCost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right">{Number(p.actualQty).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700">{Number(p.actualRate).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Overhead Sheets Tab ──────────────────────────────────────────────────────

function NewOverheadSheetDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ code: '', name: '', lines: [{ sequence: 1, name: '', base: 'MATERIAL_COST', rate: '', debitAccountId: '', creditAccountId: '' }] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addLine = () => setForm(f => ({
    ...f,
    lines: [...f.lines, { sequence: f.lines.length + 1, name: '', base: 'MATERIAL_COST', rate: '', debitAccountId: '', creditAccountId: '' }],
  }));

  const updateLine = (i: number, field: string, value: string) => setForm(f => ({
    ...f,
    lines: f.lines.map((l, idx) => idx === i ? { ...l, [field]: value } : l),
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await financeApi.createOverheadSheet({
        ...form,
        lines: form.lines.map(l => ({ ...l, rate: Number(l.rate), sequence: Number(l.sequence) })),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create overhead sheet');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl my-4">
        <div className="p-6 border-b"><h2 className="text-lg font-semibold">New Overhead Costing Sheet</h2></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" required value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" required value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-700">Overhead Lines</label>
              <button type="button" onClick={addLine} className="text-xs text-blue-600 hover:underline">+ Add Line</button>
            </div>
            <div className="space-y-2">
              {form.lines.map((line, i) => (
                <div key={i} className="grid grid-cols-6 gap-2 text-xs">
                  <div>
                    <label className="block text-gray-500 mb-0.5">Name</label>
                    <input className="w-full border rounded px-2 py-1" value={line.name}
                      onChange={e => updateLine(i, 'name', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-0.5">Base</label>
                    <select className="w-full border rounded px-1 py-1" value={line.base}
                      onChange={e => updateLine(i, 'base', e.target.value)}>
                      <option value="MATERIAL_COST">Material</option>
                      <option value="LABOR_COST">Labor</option>
                      <option value="TOTAL_COST">Total</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-0.5">Rate %</label>
                    <input type="number" step="0.01" className="w-full border rounded px-2 py-1" value={line.rate}
                      onChange={e => updateLine(i, 'rate', e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-gray-500 mb-0.5">Debit Account ID</label>
                    <input className="w-full border rounded px-2 py-1" value={line.debitAccountId}
                      onChange={e => updateLine(i, 'debitAccountId', e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-gray-500 mb-0.5">Credit Account ID</label>
                    <input className="w-full border rounded px-2 py-1" value={line.creditAccountId}
                      onChange={e => updateLine(i, 'creditAccountId', e.target.value)} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OverheadSheetsTab() {
  const [sheets, setSheets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeApi.getOverheadSheets();
      setSheets(res.data?.data ?? res.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600">Define overhead rates applied to production orders based on material / labor / total cost.</p>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowDialog(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Sheet
          </button>
        </div>
      </div>

      {showDialog && <NewOverheadSheetDialog onClose={() => setShowDialog(false)} onSaved={load} />}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : sheets.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No overhead costing sheets defined yet</div>
      ) : (
        <div className="space-y-4">
          {sheets.map(s => (
            <div key={s.id} className="border rounded-xl overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="font-mono font-semibold">{s.code}</span>
                  <span className="ml-3 text-gray-700">{s.name}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {s.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              {s.lines?.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="text-gray-500 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-4 py-2 text-left">Line</th>
                      <th className="px-4 py-2 text-left">Base</th>
                      <th className="px-4 py-2 text-right">Rate %</th>
                      <th className="px-4 py-2 text-left">Debit Acct</th>
                      <th className="px-4 py-2 text-left">Credit Acct</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {s.lines.map((l: any, i: number) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2">{l.name || `Line ${l.sequence}`}</td>
                        <td className="px-4 py-2">
                          <span className="text-xs px-2 py-0.5 rounded bg-orange-100 text-orange-700">
                            {l.base.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-semibold">{Number(l.rate).toFixed(2)}%</td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-500">{l.debitAccountId ? `${l.debitAccountId.slice(0, 8)}…` : '—'}</td>
                        <td className="px-4 py-2 font-mono text-xs text-gray-500">{l.creditAccountId ? `${l.creditAccountId.slice(0, 8)}…` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ActivityCostingPage() {
  const [tab, setTab] = useState<Tab>('activityTypes');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
          <Layers className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activity-Based Costing</h1>
          <p className="text-gray-500 mt-0.5">CO-ABC: Activity types, planned rates, and overhead costing sheets</p>
        </div>
      </div>

      <div className="flex gap-1 border-b mb-6">
        {[
          { key: 'activityTypes' as Tab, label: 'Activity Types' },
          { key: 'activityPrices' as Tab, label: 'Activity Prices' },
          { key: 'overheadSheets' as Tab, label: 'Overhead Sheets' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'activityTypes' && <ActivityTypesTab />}
      {tab === 'activityPrices' && <ActivityPricesTab />}
      {tab === 'overheadSheets' && <OverheadSheetsTab />}
    </div>
  );
}
