import { useState } from 'react';
import { financeApi } from '../../api/finance';

type TabKey = 'trialBalance' | 'pnl' | 'balanceSheet' | 'glDetail' | 'cashFlow' | 'segmentBalance';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'trialBalance', label: 'Trial Balance' },
  { key: 'pnl', label: 'P&L' },
  { key: 'balanceSheet', label: 'Balance Sheet' },
  { key: 'glDetail', label: 'GL Detail' },
  { key: 'cashFlow', label: 'Cash Flow' },
  { key: 'segmentBalance', label: 'Segment Balance' },
];

const today = new Date().toISOString().split('T')[0];
const firstOfYear = `${new Date().getFullYear()}-01-01`;

// ---- Trial Balance ----
function TrialBalanceTab() {
  const [from, setFrom] = useState(firstOfYear);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await financeApi.getTrialBalance({ from, to });
      const payload = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setData(Array.isArray(payload) ? payload : []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to run report');
    } finally {
      setLoading(false);
    }
  };

  const totalDebit = data.reduce((s: number, r: any) => s + (Number(r.debit) || 0), 0);
  const totalCredit = data.reduce((s: number, r: any) => s + (Number(r.credit) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <button onClick={run} disabled={loading} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {loading ? 'Running...' : 'Run Report'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map((row: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{row.code}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{row.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{row.type}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{Number(row.debit).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{Number(row.credit).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 font-semibold">
              <tr>
                <td colSpan={3} className="px-4 py-3 text-sm text-gray-700">Total</td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">{totalDebit.toFixed(2)}</td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right">{totalCredit.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- P&L ----
function ProfitLossTab() {
  const [from, setFrom] = useState(firstOfYear);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await financeApi.getProfitLoss({ from, to });
      setData(res.data?.data ?? res.data ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to run report');
    } finally {
      setLoading(false);
    }
  };

  const income: any[] = data?.income ?? [];
  const expenses: any[] = data?.expenses ?? [];
  const totalIncome = income.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
  const totalExpenses = expenses.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
  const netIncome = data?.netIncome !== undefined ? Number(data.netIncome) : totalIncome - totalExpenses;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <button onClick={run} disabled={loading} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {loading ? 'Running...' : 'Run Report'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && (
        <div className="space-y-4">
          {/* Income */}
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-green-50 px-4 py-2 font-semibold text-sm text-green-800">Income</div>
            <table className="min-w-full divide-y divide-gray-200">
              <tbody className="bg-white divide-y divide-gray-100">
                {income.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-900">{row.name ?? row.account}</td>
                    <td className="px-4 py-2 text-sm text-gray-700 text-right">{Number(row.amount).toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="bg-green-50 font-semibold">
                  <td className="px-4 py-2 text-sm text-green-800">Total Income</td>
                  <td className="px-4 py-2 text-sm text-green-800 text-right">{totalIncome.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Expenses */}
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <div className="bg-red-50 px-4 py-2 font-semibold text-sm text-red-800">Expenses</div>
            <table className="min-w-full divide-y divide-gray-200">
              <tbody className="bg-white divide-y divide-gray-100">
                {expenses.map((row: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm text-gray-900">{row.name ?? row.account}</td>
                    <td className="px-4 py-2 text-sm text-gray-700 text-right">{Number(row.amount).toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="bg-red-50 font-semibold">
                  <td className="px-4 py-2 text-sm text-red-800">Total Expenses</td>
                  <td className="px-4 py-2 text-sm text-red-800 text-right">{totalExpenses.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Net Income */}
          <div className={`rounded-lg border px-4 py-3 flex justify-between font-semibold ${netIncome >= 0 ? 'border-green-200 bg-green-50 text-green-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
            <span>Net Income</span>
            <span>{netIncome.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Balance Sheet ----
function BalanceSheetTab() {
  const [asOf, setAsOf] = useState(today);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await financeApi.getBalanceSheet({ asOf });
      setData(res.data?.data ?? res.data ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to run report');
    } finally {
      setLoading(false);
    }
  };

  const renderSection = (title: string, items: any[], colorClass: string) => {
    const total = items.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
    return (
      <div className="rounded-lg border border-gray-200 overflow-hidden">
        <div className={`px-4 py-2 font-semibold text-sm ${colorClass}`}>{title}</div>
        <table className="min-w-full divide-y divide-gray-200">
          <tbody className="bg-white divide-y divide-gray-100">
            {items.map((row: any, i: number) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-sm text-gray-900">{row.name ?? row.account}</td>
                <td className="px-4 py-2 text-sm text-gray-700 text-right">{Number(row.amount).toFixed(2)}</td>
              </tr>
            ))}
            <tr className={`font-semibold ${colorClass}`}>
              <td className="px-4 py-2 text-sm">Total {title}</td>
              <td className="px-4 py-2 text-sm text-right">{total.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">As Of</label>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <button onClick={run} disabled={loading} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {loading ? 'Running...' : 'Run Report'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && (
        <div className="space-y-4">
          {renderSection('Assets', data.assets ?? [], 'bg-blue-50 text-blue-800')}
          {renderSection('Liabilities', data.liabilities ?? [], 'bg-red-50 text-red-800')}
          {renderSection('Equity', data.equity ?? [], 'bg-purple-50 text-purple-800')}
        </div>
      )}
    </div>
  );
}

// ---- GL Detail ----
function GlDetailTab() {
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState(firstOfYear);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await financeApi.getGlDetail({ accountId: accountId || undefined, from, to });
      const payload = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setData(Array.isArray(payload) ? payload : []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to run report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Account ID</label>
          <input
            type="text"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder="Leave blank for all"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <button onClick={run} disabled={loading} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {loading ? 'Running...' : 'Run Report'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entry #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.map((row: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-700">{row.date?.split('T')[0]}</td>
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{row.entryNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{row.description}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{Number(row.debit || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{Number(row.credit || 0).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-right">{Number(row.balance || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Cash Flow ----
function CashFlowTab() {
  const [from, setFrom] = useState(firstOfYear);
  const [to, setTo] = useState(today);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await financeApi.getCashFlow({ from, to });
      setData(res.data?.data ?? res.data ?? null);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to run report');
    } finally {
      setLoading(false);
    }
  };

  const operating: any[] = data?.operating ?? [];
  const operatingTotal =
    data?.operatingTotal !== undefined
      ? Number(data.operatingTotal)
      : operating.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <button onClick={run} disabled={loading} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {loading ? 'Running...' : 'Run Report'}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {data && (
        <div className="rounded-lg border border-gray-200 overflow-hidden">
          <div className="bg-teal-50 px-4 py-2 font-semibold text-sm text-teal-800">Operating Activities</div>
          <table className="min-w-full divide-y divide-gray-200">
            <tbody className="bg-white divide-y divide-gray-100">
              {operating.map((row: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-900">{row.label ?? row.name ?? row.description}</td>
                  <td className="px-4 py-2 text-sm text-gray-700 text-right">{Number(row.amount).toFixed(2)}</td>
                </tr>
              ))}
              <tr className="bg-teal-50 font-semibold">
                <td className="px-4 py-2 text-sm text-teal-800">Net Cash from Operating Activities</td>
                <td className="px-4 py-2 text-sm text-teal-800 text-right">{operatingTotal.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Main Page ----
export default function FinanceReportsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('trialBalance');

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Finance Reports</h1>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'trialBalance' && <TrialBalanceTab />}
      {activeTab === 'pnl' && <ProfitLossTab />}
      {activeTab === 'balanceSheet' && <BalanceSheetTab />}
      {activeTab === 'glDetail' && <GlDetailTab />}
      {activeTab === 'cashFlow' && <CashFlowTab />}
      {activeTab === 'segmentBalance' && <SegmentBalanceTab />}
    </div>
  );
}

// ---- Segment Balance (Phase 72) ----
function SegmentBalanceTab() {
  const [from, setFrom] = useState(firstOfYear);
  const [to, setTo] = useState(today);
  const [ledgerCode, setLedgerCode] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await financeApi.getSegmentTrialBalance({ from, to, ...(ledgerCode ? { ledgerCode } : {}) });
      const data = res.data?.data ?? res.data ?? [];
      setRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load segment balance');
    } finally {
      setLoading(false);
    }
  };

  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Group by profit center
  const grouped: Record<string, any[]> = {};
  for (const row of rows) {
    const key = row.profitCenterId ?? '(Unassigned)';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(row);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap items-end">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Ledger</label>
          <select value={ledgerCode} onChange={(e) => setLedgerCode(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            <option value="">All Ledgers</option>
            <option value="MAIN">MAIN</option>
            <option value="IFRS">IFRS</option>
            <option value="LOCAL">LOCAL GAAP</option>
          </select>
        </div>
        <button onClick={load} disabled={loading}
          className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {loading ? 'Loading...' : 'Run'}
        </button>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}

      {rows.length > 0 && Object.entries(grouped).map(([pc, pcRows]) => (
        <div key={pc} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b">
            <span className="text-sm font-semibold text-gray-700">Profit Center: </span>
            <span className="text-sm font-mono text-indigo-600">{pc}</span>
          </div>
          <table className="min-w-full text-sm divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Account Type</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Total Debit</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Total Credit</th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pcRows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{r.accountType}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(r.totalDebit)}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(r.totalCredit)}</td>
                  <td className={`px-4 py-2 text-right font-mono font-semibold ${r.net < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmt(r.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {rows.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-400 text-sm">Click "Run" to generate the segment trial balance.</div>
      )}
    </div>
  );
}
