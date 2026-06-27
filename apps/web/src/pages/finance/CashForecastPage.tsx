import { useState, useEffect } from 'react';
import { financeApi } from '../../api/finance';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BUCKETS = ['DAILY', 'WEEKLY', 'MONTHLY'];
const CATEGORY_LABEL: Record<string, string> = {
  AR_RECEIPT: 'AR Receipts', AP_PAYMENT: 'AP Payments', PAYROLL: 'Payroll', INSTRUMENT_MATURITY: 'Maturities',
};

export default function CashForecastPage() {
  const [forecasts, setForecasts] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [variance, setVariance] = useState<any>(null);
  const [form, setForm] = useState({ name: '', fromDate: '2026-06-01', toDate: '2026-09-30', bucket: 'WEEKLY', openingBalance: 0 });
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, []);
  async function load() { setForecasts(unwrap(await financeApi.listCashForecasts())); }

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      await financeApi.generateCashForecast(form);
      setShowForm(false);
      load();
    } catch (err: any) { setMsg(err.response?.data?.message ?? 'Failed'); }
  }

  async function open(f: any) {
    setVariance(null);
    const res = await financeApi.getCashForecast(f.id);
    setSelected(res.data?.data ?? res.data);
  }

  async function runVariance() {
    if (!selected) return;
    const res = await financeApi.getCashForecastVariance(selected.forecast.id);
    setVariance(res.data?.data ?? res.data);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">Cash Forecasting</h1>
          <p className="text-gray-500 text-sm mt-1">
            Oracle Cash Management parity — multi-source forecasts (AR receipts, AP payments, payroll,
            instrument maturities) bucketed by day/week/month, with forecast-vs-actual variance.
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700">+ Generate Forecast</button>
      </div>

      {showForm && (
        <form onSubmit={generate} className="border rounded-lg p-4 bg-gray-50 grid grid-cols-5 gap-3 items-end">
          <div className="col-span-2"><label className="text-xs text-gray-500">Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">From</label><input type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">To</label><input type="date" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Bucket</label><select value={form.bucket} onChange={(e) => setForm({ ...form, bucket: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">{BUCKETS.map((b) => <option key={b}>{b}</option>)}</select></div>
          <div><label className="text-xs text-gray-500">Opening Balance</label><input type="number" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div className="col-span-4 flex gap-2"><button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Generate</button>{msg && <span className="text-red-500 text-sm self-center">{msg}</span>}</div>
        </form>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-lg divide-y">
          {forecasts.length === 0 ? <p className="p-3 text-gray-400 text-sm">No forecasts.</p> : forecasts.map((f) => (
            <div key={f.id} onClick={() => open(f)} className={`p-3 cursor-pointer hover:bg-gray-50 ${selected?.forecast?.id === f.id ? 'bg-indigo-50' : ''}`}>
              <div className="font-medium text-sm">{f.name}</div>
              <div className="text-xs text-gray-400">{f.fromDate} → {f.toDate} · {f.bucket}</div>
              <div className="text-xs mt-1"><span className="text-green-600">+{money(f.forecastInflow)}</span> / <span className="text-red-600">−{money(f.forecastOutflow)}</span></div>
            </div>
          ))}
        </div>

        <div className="col-span-2 border rounded-lg p-3">
          {!selected ? <p className="text-gray-400 text-sm">Select a forecast to view the cash projection.</p> : (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h3 className="font-medium">{selected.forecast.name}</h3>
                <button onClick={runVariance} className="text-sm text-indigo-600 hover:underline">Run variance vs actual</button>
              </div>
              <table className="w-full text-sm border rounded overflow-hidden">
                <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Period</th><th className="px-3 py-2 text-right">Inflow</th><th className="px-3 py-2 text-right">Outflow</th><th className="px-3 py-2 text-right">Net</th><th className="px-3 py-2 text-right">Closing</th></tr></thead>
                <tbody className="divide-y">
                  {selected.periods.map((p: any) => (
                    <tr key={p.period}>
                      <td className="px-3 py-2">{p.period}</td>
                      <td className="px-3 py-2 text-right text-green-600">{money(p.inflow)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{money(p.outflow)}</td>
                      <td className={`px-3 py-2 text-right ${p.net < 0 ? 'text-red-600' : 'text-green-600'}`}>{money(p.net)}</td>
                      <td className={`px-3 py-2 text-right font-medium ${p.closingBalance < 0 ? 'text-red-600' : ''}`}>{money(p.closingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {variance && (
                <div>
                  <h4 className="text-sm font-medium mb-1">Forecast vs Actual</h4>
                  <table className="w-full text-sm border rounded overflow-hidden">
                    <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Period</th><th className="px-3 py-2 text-right">Forecast</th><th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2 text-right">Variance</th></tr></thead>
                    <tbody className="divide-y">
                      {variance.rows.map((r: any) => (
                        <tr key={r.period}>
                          <td className="px-3 py-2">{r.period}</td>
                          <td className="px-3 py-2 text-right">{money(r.forecastNet)}</td>
                          <td className="px-3 py-2 text-right">{money(r.actualNet)}</td>
                          <td className={`px-3 py-2 text-right font-medium ${r.variance < 0 ? 'text-red-600' : 'text-green-600'}`}>{money(r.variance)}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-medium">
                        <td className="px-3 py-2">Total</td>
                        <td className="px-3 py-2 text-right">{money(variance.totalForecast)}</td>
                        <td className="px-3 py-2 text-right">{money(variance.totalActual)}</td>
                        <td className={`px-3 py-2 text-right ${variance.totalVariance < 0 ? 'text-red-600' : 'text-green-600'}`}>{money(variance.totalVariance)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
