import { useState } from 'react';
import { financeApi } from '../../api/finance';

type TabKey = 'trial-balance' | 'profit-loss' | 'balance-sheet' | 'gl-detail' | 'cash-flow';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'trial-balance', label: 'Trial Balance' },
  { key: 'profit-loss', label: 'P&L' },
  { key: 'balance-sheet', label: 'Balance Sheet' },
  { key: 'gl-detail', label: 'GL Detail' },
  { key: 'cash-flow', label: 'Cash Flow' },
];

function exportCsv(headers: string[], rows: string[][], filename: string) {
  const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FinanceReportsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('trial-balance');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  // Common date params
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [asOf, setAsOf] = useState(today);
  const [accountId, setAccountId] = useState('');

  const runReport = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let res;
      switch (activeTab) {
        case 'trial-balance':
          res = await financeApi.getTrialBalance({ from, to });
          break;
        case 'profit-loss':
          res = await financeApi.getProfitLoss({ from, to });
          break;
        case 'balance-sheet':
          res = await financeApi.getBalanceSheet({ asOf });
          break;
        case 'gl-detail':
          if (!accountId) { setError('Please enter an Account ID'); setLoading(false); return; }
          res = await financeApi.getGlDetail({ accountId, from, to });
          break;
        case 'cash-flow':
          res = await financeApi.getCashFlow({ from, to });
          break;
      }
      setResult(res.data?.data ?? res.data);
    } catch (e: any) {
      setError(e.response?.data?.message || e.message || 'Failed to run report');
    } finally {
      setLoading(false);
    }
  };

  const renderTrialBalance = () => {
    if (!result) return null;
    const rows: any[] = result.rows || [];
    return (
      <div>
        <div className="flex justify-end mb-3">
          <button
            onClick={() => exportCsv(
              ['Code', 'Name', 'Type', 'Debit', 'Credit'],
              rows.map(r => [r.code, r.name, r.type, String(r.debit), String(r.credit)]),
              'trial-balance.csv'
            )}
            className="text-xs border border-gray-300 rounded px-3 py-1 hover:bg-gray-50"
          >
            Export CSV
          </button>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50">
            <tr>
              {['Code', 'Name', 'Type', 'Debit', 'Credit'].map(h => (
                <th key={h} className="px-4 py-2 text-left border-b border-gray-200 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.accountId} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2 font-mono text-xs">{r.code}</td>
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{r.type}</td>
                <td className="px-4 py-2 text-right">{r.debit > 0 ? Number(r.debit).toFixed(2) : ''}</td>
                <td className="px-4 py-2 text-right">{r.credit > 0 ? Number(r.credit).toFixed(2) : ''}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold">
              <td colSpan={3} className="px-4 py-2">Total</td>
              <td className="px-4 py-2 text-right">{Number(result.totalDebit || 0).toFixed(2)}</td>
              <td className="px-4 py-2 text-right">{Number(result.totalCredit || 0).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-500">
          Balanced: {result.balanced ? '✓ Yes' : '✗ No'}
        </p>
      </div>
    );
  };

  const renderProfitLoss = () => {
    if (!result) return null;
    return (
      <div className="space-y-6">
        <div className="flex justify-end">
          <button
            onClick={() => {
              const rows = [
                ...(result.incomeLines || []).map((r: any) => ['INCOME', r.code || '', r.name, String(r.amount || 0), '']),
                ...(result.expenseLines || []).map((r: any) => ['EXPENSE', r.code || '', r.name, '', String(r.amount || 0)]),
              ];
              exportCsv(['Section', 'Code', 'Name', 'Income', 'Expense'], rows, 'profit-loss.csv');
            }}
            className="text-xs border border-gray-300 rounded px-3 py-1 hover:bg-gray-50"
          >
            Export CSV
          </button>
        </div>
        <div>
          <h3 className="font-semibold text-gray-800 mb-2">Income</h3>
          <table className="w-full text-sm border-collapse">
            <tbody>
              {(result.incomeLines || []).map((r: any, i: number) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.code}</td>
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2 text-right">{Number(r.amount || 0).toFixed(2)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={2} className="px-4 py-2">Total Income</td>
                <td className="px-4 py-2 text-right">{Number(result.totalIncome || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="font-semibold text-gray-800 mb-2">Expenses</h3>
          <table className="w-full text-sm border-collapse">
            <tbody>
              {(result.expenseLines || []).map((r: any, i: number) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.code}</td>
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2 text-right">{Number(r.amount || 0).toFixed(2)}</td>
                </tr>
              ))}
              <tr className="bg-gray-50 font-semibold">
                <td colSpan={2} className="px-4 py-2">Total Expenses</td>
                <td className="px-4 py-2 text-right">{Number(result.totalExpenses || 0).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="font-bold text-gray-900">Net Income</span>
            <span className={`text-xl font-bold ${Number(result.netIncome || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {Number(result.netIncome || 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderBalanceSheet = () => {
    if (!result) return null;
    const Section = ({ title, data }: { title: string; data: any }) => (
      <div>
        <h3 className="font-semibold text-gray-800 mb-2">{title}</h3>
        <table className="w-full text-sm border-collapse mb-4">
          <tbody>
            {(data?.lines || []).map((r: any, i: number) => (
              <tr key={i} className="border-b border-gray-100">
                <td className="px-4 py-2 font-mono text-xs text-gray-500">{r.code}</td>
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2 text-right">{Number(r.balance || r.amount || 0).toFixed(2)}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold">
              <td colSpan={2} className="px-4 py-2">Total {title}</td>
              <td className="px-4 py-2 text-right">{Number(data?.total || 0).toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    );
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            onClick={() => exportCsv(['Section', 'Code', 'Name', 'Amount'], [], 'balance-sheet.csv')}
            className="text-xs border border-gray-300 rounded px-3 py-1 hover:bg-gray-50"
          >
            Export CSV
          </button>
        </div>
        <Section title="Assets" data={result.assets} />
        <Section title="Liabilities" data={result.liabilities} />
        <Section title="Equity" data={result.equity} />
      </div>
    );
  };

  const renderGlDetail = () => {
    if (!result) return null;
    const lines: any[] = result.lines || [];
    return (
      <div>
        <div className="flex justify-end mb-3">
          <button
            onClick={() => exportCsv(
              ['Date', 'Entry #', 'Description', 'Debit', 'Credit', 'Balance'],
              lines.map(r => [r.date, r.entryNumber || '', r.description || '', String(r.debit || 0), String(r.credit || 0), String(r.runningBalance || 0)]),
              'gl-detail.csv'
            )}
            className="text-xs border border-gray-300 rounded px-3 py-1 hover:bg-gray-50"
          >
            Export CSV
          </button>
        </div>
        <div className="mb-2 text-sm text-gray-600">
          Opening Balance: <strong>{Number(result.openingBalance || 0).toFixed(2)}</strong>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50">
            <tr>
              {['Date', 'Entry #', 'Description', 'Debit', 'Credit', 'Balance'].map(h => (
                <th key={h} className="px-4 py-2 text-left border-b border-gray-200 font-medium text-gray-600">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((r: any, i: number) => (
              <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">{r.date}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.entryNumber}</td>
                <td className="px-4 py-2">{r.description}</td>
                <td className="px-4 py-2 text-right">{r.debit > 0 ? Number(r.debit).toFixed(2) : ''}</td>
                <td className="px-4 py-2 text-right">{r.credit > 0 ? Number(r.credit).toFixed(2) : ''}</td>
                <td className="px-4 py-2 text-right font-medium">{Number(r.runningBalance || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 text-sm text-gray-600">
          Closing Balance: <strong>{Number(result.closingBalance || 0).toFixed(2)}</strong>
        </div>
      </div>
    );
  };

  const renderCashFlow = () => {
    if (!result) return null;
    return (
      <div className="space-y-4">
        <div className="flex justify-end">
          <button
            onClick={() => exportCsv(['Section', 'Amount'], [
              ['Net Income', String(result.operatingActivities?.netIncome || 0)],
              ['Total Operating', String(result.operatingActivities?.total || 0)],
              ['Net Cash Flow', String(result.total || 0)],
            ], 'cash-flow.csv')}
            className="text-xs border border-gray-300 rounded px-3 py-1 hover:bg-gray-50"
          >
            Export CSV
          </button>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-800 mb-3">Operating Activities</h3>
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">Net Income</span>
            <span className="text-sm font-medium">{Number(result.operatingActivities?.netIncome || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between py-2 font-semibold">
            <span>Total Operating Activities</span>
            <span>{Number(result.operatingActivities?.total || 0).toFixed(2)}</span>
          </div>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 flex justify-between items-center">
          <span className="font-bold text-gray-900">Net Cash Flow</span>
          <span className={`text-xl font-bold ${Number(result.total || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
            {Number(result.total || 0).toFixed(2)}
          </span>
        </div>
      </div>
    );
  };

  const renderResult = () => {
    switch (activeTab) {
      case 'trial-balance': return renderTrialBalance();
      case 'profit-loss': return renderProfitLoss();
      case 'balance-sheet': return renderBalanceSheet();
      case 'gl-detail': return renderGlDetail();
      case 'cash-flow': return renderCashFlow();
      default: return null;
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Finance Reports</h1>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setResult(null); setError(null); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          {activeTab !== 'balance-sheet' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">From</label>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">To</label>
                <input type="date" value={to} onChange={e => setTo(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-2 text-sm" />
              </div>
            </>
          )}
          {activeTab === 'balance-sheet' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">As Of</label>
              <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2 text-sm" />
            </div>
          )}
          {activeTab === 'gl-detail' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Account ID (UUID)</label>
              <input type="text" value={accountId} onChange={e => setAccountId(e.target.value)}
                placeholder="Enter account UUID..."
                className="border border-gray-300 rounded px-3 py-2 text-sm w-72" />
            </div>
          )}
          <button
            onClick={runReport}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Running...' : 'Run Report'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      )}

      {/* Results */}
      {result && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          {renderResult()}
        </div>
      )}

      {!result && !loading && !error && (
        <div className="text-center py-16 text-gray-400">
          Select a date range and click "Run Report" to generate the report.
        </div>
      )}
    </div>
  );
}
