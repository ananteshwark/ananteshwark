import { useState, useEffect } from 'react';
import {
  TrendingUp,
  Plus,
  Send,
  BarChart3,
  Target,
} from 'lucide-react';
import { demandPlanningApi } from '../../api/demandPlanning';
import { inventoryApi } from '../../api/inventory';

const unwrapList = (res: any) => {
  const d = res.data?.data ?? res.data;
  return Array.isArray(d) ? d : d?.items ?? [];
};
const unwrap = (res: any) => res.data?.data ?? res.data;
const num = (v: any) => Number(v) || 0;
const fmt = (v: any) =>
  v == null ? '—' : num(v).toLocaleString(undefined, { maximumFractionDigits: 2 });

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  RELEASED: 'bg-green-100 text-green-700',
  ARCHIVED: 'bg-amber-100 text-amber-700',
};

const METHOD_LABELS: Record<string, string> = {
  MOVING_AVERAGE: 'Moving Avg',
  WEIGHTED_MOVING_AVERAGE: 'Weighted MA',
  EXPONENTIAL_SMOOTHING: 'Exp. Smoothing',
  MANUAL: 'Manual',
};

type Tab = 'forecasts' | 'released';

export default function DemandPlanningPage() {
  const [tab, setTab] = useState<Tab>('forecasts');
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [released, setReleased] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    itemId: '',
    method: 'MOVING_AVERAGE',
    historyMonths: '12',
    horizonPeriods: '6',
    windowSize: '3',
    weights: '1,2,3',
    alpha: '0.3',
    manualQty: '',
    notes: '',
  });

  const loadForecasts = () =>
    demandPlanningApi.listForecasts().then((res) => setForecasts(unwrapList(res))).catch(() => setForecasts([]));
  const loadReleased = () =>
    demandPlanningApi.released().then((res) => setReleased(unwrapList(res))).catch(() => setReleased([]));

  useEffect(() => {
    loadForecasts();
    loadReleased();
    inventoryApi.getItems({ limit: 500 }).then((res) => setItems(unwrapList(res))).catch(() => setItems([]));
  }, []);

  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? id;

  const generate = async () => {
    if (!form.itemId) {
      setMsg('Select an item');
      return;
    }
    if (form.method === 'MANUAL' && !form.manualQty) {
      setMsg('Manual method requires a quantity');
      return;
    }
    setMsg(null);
    const payload: any = {
      itemId: form.itemId,
      method: form.method,
      historyMonths: parseInt(form.historyMonths, 10) || 12,
      horizonPeriods: parseInt(form.horizonPeriods, 10) || 6,
      notes: form.notes || undefined,
    };
    if (form.method === 'MOVING_AVERAGE') payload.windowSize = parseInt(form.windowSize, 10) || 3;
    if (form.method === 'WEIGHTED_MOVING_AVERAGE')
      payload.weights = form.weights.split(',').map((w) => num(w.trim())).filter((w) => w > 0);
    if (form.method === 'EXPONENTIAL_SMOOTHING') payload.alpha = num(form.alpha);
    if (form.method === 'MANUAL') payload.manualQty = num(form.manualQty);

    try {
      const res = await demandPlanningApi.generate(payload);
      setShowForm(false);
      loadForecasts();
      setSelected(unwrap(res));
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? 'Failed to generate forecast');
    }
  };

  const openForecast = async (id: string) => {
    try {
      const res = await demandPlanningApi.getForecast(id);
      setSelected(unwrap(res));
    } catch {
      setMsg('Failed to load forecast');
    }
  };

  const release = async (id: string) => {
    try {
      const res = await demandPlanningApi.release(id);
      setSelected(unwrap(res));
      loadForecasts();
      loadReleased();
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? 'Failed to release forecast');
    }
  };

  const adjust = async (periodId: string, value: string) => {
    if (value === '') return;
    try {
      await demandPlanningApi.adjustPeriod(periodId, num(value));
      if (selected) openForecast(selected.forecast.id);
    } catch {
      setMsg('Failed to adjust period');
    }
  };

  const recordActual = async (periodId: string, value: string) => {
    if (value === '') return;
    try {
      await demandPlanningApi.recordActual(periodId, num(value));
      if (selected) openForecast(selected.forecast.id);
    } catch {
      setMsg('Failed to record actual');
    }
  };

  const Chip = ({ status }: { status: string }) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );

  const TABS: { key: Tab; label: string }[] = [
    { key: 'forecasts', label: 'Forecasts' },
    { key: 'released', label: 'Released Demand' },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Demand Planning</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Statistical sales forecasting (S&amp;OP) — moving average, exponential smoothing, manual adjustment and accuracy tracking
          </p>
        </div>
        {tab === 'forecasts' && (
          <button onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            <Plus className="h-4 w-4" /> New Forecast
          </button>
        )}
      </div>

      {msg && <div className="mb-4 p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">{msg}</div>}

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Forecasts ─── */}
      {tab === 'forecasts' && (
        <>
          {showForm && (
            <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Item</label>
                  <select value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-52">
                    <option value="">Select...</option>
                    {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Method</label>
                  <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="MOVING_AVERAGE">Moving Average</option>
                    <option value="WEIGHTED_MOVING_AVERAGE">Weighted Moving Average</option>
                    <option value="EXPONENTIAL_SMOOTHING">Exponential Smoothing</option>
                    <option value="MANUAL">Manual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">History (months)</label>
                  <input type="number" value={form.historyMonths} onChange={(e) => setForm({ ...form, historyMonths: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Horizon (months)</label>
                  <input type="number" value={form.horizonPeriods} onChange={(e) => setForm({ ...form, horizonPeriods: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24" />
                </div>
                {form.method === 'MOVING_AVERAGE' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Window</label>
                    <input type="number" value={form.windowSize} onChange={(e) => setForm({ ...form, windowSize: e.target.value })}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-20" />
                  </div>
                )}
                {form.method === 'WEIGHTED_MOVING_AVERAGE' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Weights (old→new)</label>
                    <input value={form.weights} onChange={(e) => setForm({ ...form, weights: e.target.value })}
                      placeholder="1,2,3"
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28" />
                  </div>
                )}
                {form.method === 'EXPONENTIAL_SMOOTHING' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Alpha (0–1)</label>
                    <input type="number" step="0.1" value={form.alpha} onChange={(e) => setForm({ ...form, alpha: e.target.value })}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-20" />
                  </div>
                )}
                {form.method === 'MANUAL' && (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Qty / period</label>
                    <input type="number" value={form.manualQty} onChange={(e) => setForm({ ...form, manualQty: e.target.value })}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28" />
                  </div>
                )}
                <button onClick={generate}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                  <BarChart3 className="h-4 w-4" /> Generate
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Item</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Method</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">History</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Horizon</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {forecasts.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">No forecasts</td></tr>
                ) : forecasts.map((f) => (
                  <tr key={f.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openForecast(f.id)}>
                    <td className="px-4 py-3 font-medium text-blue-600">{f.itemName ?? itemName(f.itemId)}</td>
                    <td className="px-4 py-3 text-gray-700">{METHOD_LABELS[f.method] ?? f.method}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{f.historyMonths}m</td>
                    <td className="px-4 py-3 text-right text-gray-600">{f.horizonPeriods}m</td>
                    <td className="px-4 py-3"><Chip status={f.status} /></td>
                    <td className="px-4 py-3 text-gray-500">{(f.createdAt || '').slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Forecast detail */}
          {selected && (
            <div className="mt-6 bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-900">{selected.forecast.itemName ?? itemName(selected.forecast.itemId)}</h3>
                  <p className="text-xs text-gray-500">
                    {METHOD_LABELS[selected.forecast.method] ?? selected.forecast.method} · {selected.forecast.status}
                    {selected.accuracy.mape != null && (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Target className="h-3 w-3" /> MAPE {selected.accuracy.mape}% · bias {fmt(selected.accuracy.bias)} ({selected.accuracy.periodsScored} scored)
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selected.forecast.status !== 'RELEASED' && selected.forecast.status !== 'ARCHIVED' && (
                    <button onClick={() => release(selected.forecast.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-xs">
                      <Send className="h-3.5 w-3.5" /> Release to Supply
                    </button>
                  )}
                  <button onClick={() => setSelected(null)} className="text-sm text-gray-400 hover:text-gray-600">Close</button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-y border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Period</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Forecast</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Adjusted</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Final</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Actual</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Released</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selected.periods.map((p: any) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 font-medium text-gray-900">{p.periodLabel}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{fmt(p.forecastQty)}</td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" defaultValue={p.adjustedQty ?? ''}
                            onBlur={(e) => adjust(p.id, e.target.value)}
                            placeholder="—"
                            className="w-20 border border-gray-200 rounded px-2 py-1 text-right text-sm" />
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900">{fmt(p.finalQty)}</td>
                        <td className="px-3 py-2 text-right">
                          <input type="number" defaultValue={p.actualQty ?? ''}
                            onBlur={(e) => recordActual(p.id, e.target.value)}
                            placeholder="—"
                            className="w-20 border border-gray-200 rounded px-2 py-1 text-right text-sm" />
                        </td>
                        <td className="px-3 py-2 text-center">{p.releasedToSupply ? '✓' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Released ─── */}
      {tab === 'released' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Item</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Period</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Planned Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {released.length === 0 ? (
                <tr><td colSpan={3} className="text-center py-8 text-gray-400">No released demand. Release a forecast to feed supply planning.</td></tr>
              ) : released.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{itemName(r.itemId)}</td>
                  <td className="px-4 py-3 text-gray-700">{r.periodLabel}</td>
                  <td className="px-4 py-3 text-right text-gray-900 font-medium">{fmt(r.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
