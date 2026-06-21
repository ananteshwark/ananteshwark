import { useState, useEffect } from 'react';
import { Plus, X, Trash2, Star } from 'lucide-react';
import { financeApi } from '../../api/finance';
import { invalidateCurrencyCache } from '../../components/ui/CurrencySelect';

interface Currency {
  id: string;
  code: string;
  name: string;
  symbol?: string | null;
  decimalPlaces: number;
  isBase: boolean;
  isActive: boolean;
}

interface ExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  year: number;
  month: number;
  rate: number;
  notes?: string | null;
}

type Tab = 'currencies' | 'rates';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const now = new Date();

export default function CurrenciesPage() {
  const [tab, setTab] = useState<Tab>('currencies');

  // Currencies state
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [currencyForm, setCurrencyForm] = useState({
    code: '', name: '', symbol: '', decimalPlaces: 2, isBase: false,
  });
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [currencyError, setCurrencyError] = useState<string | null>(null);

  // Exchange rates state
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [showRateModal, setShowRateModal] = useState(false);
  const [rateForm, setRateForm] = useState({
    fromCurrency: '', toCurrency: '', rate: '',
    year: now.getFullYear(), month: now.getMonth() + 1,
  });
  const [savingRate, setSavingRate] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  const fetchCurrencies = async () => {
    setLoading(true);
    try {
      const res = await financeApi.getCurrencies({ includeInactive: true });
      setCurrencies(res.data?.data ?? res.data ?? []);
    } finally {
      setLoading(false);
    }
  };

  const fetchRates = async () => {
    setRatesLoading(true);
    try {
      const res = await financeApi.getExchangeRates({ year: filterYear, month: filterMonth });
      setRates(res.data?.data ?? res.data ?? []);
    } finally {
      setRatesLoading(false);
    }
  };

  useEffect(() => { fetchCurrencies(); }, []);
  useEffect(() => { if (tab === 'rates') fetchRates(); }, [tab, filterYear, filterMonth]);

  const activeCodes = currencies.filter((c) => c.isActive).map((c) => c.code);

  const submitCurrency = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCurrency(true);
    setCurrencyError(null);
    try {
      await financeApi.createCurrency({
        code: currencyForm.code,
        name: currencyForm.name,
        symbol: currencyForm.symbol || undefined,
        decimalPlaces: Number(currencyForm.decimalPlaces),
        isBase: currencyForm.isBase,
      });
      invalidateCurrencyCache();
      setShowCurrencyModal(false);
      setCurrencyForm({ code: '', name: '', symbol: '', decimalPlaces: 2, isBase: false });
      fetchCurrencies();
    } catch (err: any) {
      setCurrencyError(err?.response?.data?.message ?? 'Failed to add currency');
    } finally {
      setSavingCurrency(false);
    }
  };

  const toggleActive = async (c: Currency) => {
    await financeApi.updateCurrency(c.id, { isActive: !c.isActive });
    invalidateCurrencyCache();
    fetchCurrencies();
  };

  const makeBase = async (c: Currency) => {
    await financeApi.updateCurrency(c.id, { isBase: true });
    invalidateCurrencyCache();
    fetchCurrencies();
  };

  const submitRate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRate(true);
    setRateError(null);
    try {
      await financeApi.upsertExchangeRate({
        fromCurrency: rateForm.fromCurrency,
        toCurrency: rateForm.toCurrency,
        rate: Number(rateForm.rate),
        year: Number(rateForm.year),
        month: Number(rateForm.month),
      });
      setShowRateModal(false);
      setRateForm({ fromCurrency: '', toCurrency: '', rate: '', year: filterYear, month: filterMonth });
      // Jump the filter to the month we just saved so the new rate is visible
      setFilterYear(Number(rateForm.year));
      setFilterMonth(Number(rateForm.month));
      fetchRates();
    } catch (err: any) {
      setRateError(err?.response?.data?.message ?? 'Failed to save rate');
    } finally {
      setSavingRate(false);
    }
  };

  const deleteRate = async (id: string) => {
    if (!confirm('Delete this conversion rate?')) return;
    await financeApi.deleteExchangeRate(id);
    fetchRates();
  };

  const openRateModal = () => {
    setRateForm({
      fromCurrency: activeCodes[0] ?? '',
      toCurrency: activeCodes[1] ?? '',
      rate: '',
      year: filterYear,
      month: filterMonth,
    });
    setRateError(null);
    setShowRateModal(true);
  };

  const years = Array.from({ length: 7 }, (_, i) => now.getFullYear() - 3 + i);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Currencies</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage currencies and monthly conversion rates</p>
        </div>
        {tab === 'currencies' ? (
          <button onClick={() => { setCurrencyError(null); setShowCurrencyModal(true); }}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> New Currency
          </button>
        ) : (
          <button onClick={openRateModal}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">
            <Plus className="w-4 h-4" /> New Rate
          </button>
        )}
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit mb-6">
        {([['currencies', 'Currencies'], ['rates', 'Exchange Rates']] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>{label}</button>
        ))}
      </div>

      {tab === 'currencies' && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Code', 'Name', 'Symbol', 'Decimals', 'Base', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>}
              {!loading && currencies.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No currencies</td></tr>
              )}
              {currencies.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">{c.code}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{c.symbol ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{c.decimalPlaces}</td>
                  <td className="px-4 py-3">
                    {c.isBase ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                        <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" /> Base
                      </span>
                    ) : (
                      <button onClick={() => makeBase(c)} className="text-xs text-gray-400 hover:text-amber-600">Set base</button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => toggleActive(c)} className="text-xs text-indigo-600 hover:underline">
                      {c.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'rates' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <select value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Period', 'From', 'To', 'Rate', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ratesLoading && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>}
                {!ratesLoading && rates.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No rates for {MONTHS[filterMonth - 1]} {filterYear}</td></tr>
                )}
                {rates.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">{MONTHS[r.month - 1]} {r.year}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">{r.fromCurrency}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">{r.toCurrency}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{r.rate}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => deleteRate(r.id)} className="text-gray-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New Currency Modal */}
      {showCurrencyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">New Currency</h2>
              <button onClick={() => setShowCurrencyModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitCurrency} className="px-6 py-4 space-y-4">
              {currencyError && <p className="text-sm text-red-600">{currencyError}</p>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                  <input type="text" required maxLength={10} value={currencyForm.code}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, code: e.target.value.toUpperCase() })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="EUR" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Symbol</label>
                  <input type="text" value={currencyForm.symbol}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, symbol: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="€" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" required value={currencyForm.name}
                  onChange={(e) => setCurrencyForm({ ...currencyForm, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Euro" />
              </div>
              <div className="grid grid-cols-2 gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Decimal Places</label>
                  <input type="number" min={0} max={6} value={currencyForm.decimalPlaces}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, decimalPlaces: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
                  <input type="checkbox" checked={currencyForm.isBase}
                    onChange={(e) => setCurrencyForm({ ...currencyForm, isBase: e.target.checked })} />
                  Set as base currency
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCurrencyModal(false)} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={savingCurrency} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {savingCurrency ? 'Saving...' : 'Add Currency'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Rate Modal */}
      {showRateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">New Conversion Rate</h2>
              <button onClick={() => setShowRateModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={submitRate} className="px-6 py-4 space-y-4">
              {rateError && <p className="text-sm text-red-600">{rateError}</p>}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                  <select required value={rateForm.fromCurrency}
                    onChange={(e) => setRateForm({ ...rateForm, fromCurrency: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {activeCodes.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                  <select required value={rateForm.toCurrency}
                    onChange={(e) => setRateForm({ ...rateForm, toCurrency: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {activeCodes.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                  <select value={rateForm.month} onChange={(e) => setRateForm({ ...rateForm, month: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                  <select value={rateForm.year} onChange={(e) => setRateForm({ ...rateForm, year: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    {years.map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Rate</label>
                  <input type="number" step="any" min="0" required value={rateForm.rate}
                    onChange={(e) => setRateForm({ ...rateForm, rate: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.92" />
                </div>
              </div>
              <p className="text-xs text-gray-500">1 {rateForm.fromCurrency || 'FROM'} = rate × {rateForm.toCurrency || 'TO'}</p>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowRateModal(false)} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={savingRate} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {savingRate ? 'Saving...' : 'Save Rate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
