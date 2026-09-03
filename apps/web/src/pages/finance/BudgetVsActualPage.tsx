import { useState, useEffect } from 'react';
import { Wallet, Plus, Trash2 } from 'lucide-react';
import { budgetApi } from '../../api/budget';

const unwrap = (res: any) => res.data?.data ?? res.data ?? [];
const num = (v: any) => Number(v) || 0;

export default function BudgetVsActualPage() {
  const now = new Date();
  const [fiscalYear, setFiscalYear] = useState(now.getFullYear());
  const [period, setPeriod] = useState('');
  const [costCenterId, setCostCenterId] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ glAccountId: '', costCenterId: '', period: '', amount: '' });

  const loadRefs = () => {
    budgetApi.listAccounts().then(res => {
      const d = res.data?.data ?? res.data;
      setAccounts(Array.isArray(d) ? d : d?.items ?? []);
    }).catch(() => {});
    budgetApi.listCostCenters().then(res => {
      const d = res.data?.data ?? res.data;
      setCostCenters(Array.isArray(d) ? d : d?.items ?? []);
    }).catch(() => {});
  };

  const load = () => {
    setLoading(true);
    budgetApi.vsActual({
      fiscalYear,
      period: period || undefined,
      costCenterId: costCenterId || undefined,
    })
      .then(res => setRows(unwrap(res)))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
    budgetApi.listLines(fiscalYear)
      .then(res => setLines(unwrap(res)))
      .catch(() => setLines([]));
  };

  useEffect(() => { loadRefs(); }, []);
  useEffect(() => { load(); }, [fiscalYear, period, costCenterId]);

  const accName = (id: string) => {
    const a = accounts.find(x => x.id === id);
    return a ? `${a.code} — ${a.name}` : id;
  };
  const ccName = (id: string) => costCenters.find(x => x.id === id)?.name ?? '—';

  const addLine = async () => {
    if (!form.glAccountId || !form.amount) { setMsg('Account and amount are required'); return; }
    setMsg(null);
    try {
      await budgetApi.createLine({
        fiscalYear,
        glAccountId: form.glAccountId,
        costCenterId: form.costCenterId || null,
        period: form.period || null,
        amount: Number(form.amount),
      });
      setForm({ glAccountId: '', costCenterId: '', period: '', amount: '' });
      load();
    } catch {
      setMsg('Failed to create budget line');
    }
  };

  const removeLine = async (id: string) => {
    try { await budgetApi.deleteLine(id); load(); } catch { setMsg('Failed to delete'); }
  };

  const utilColor = (u: number) =>
    u > 90 ? 'bg-red-500' : u >= 70 ? 'bg-amber-500' : 'bg-green-500';

  const totals = rows.reduce(
    (t, r) => ({
      budget: t.budget + num(r.budget),
      committed: t.committed + num(r.committed),
      actual: t.actual + num(r.actual),
      available: t.available + num(r.available),
    }),
    { budget: 0, committed: 0, actual: 0, available: 0 },
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Budget vs Actual</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">Budget, commitments and actual spend by account</p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Fiscal Year</label>
            <input type="number" value={fiscalYear} onChange={e => setFiscalYear(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Period</label>
            <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cost Center</label>
            <select value={costCenterId} onChange={e => setCostCenterId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">All</option>
              {costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button onClick={() => setShowEditor(s => !s)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            <Plus className="h-4 w-4" /> Budget Lines
          </button>
        </div>
      </div>

      {msg && <div className="mb-4 p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">{msg}</div>}

      {showEditor && (
        <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="font-semibold text-gray-800 mb-3">Budget Line Editor — FY {fiscalYear}</h2>
          <div className="flex flex-wrap items-end gap-2 mb-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Account</label>
              <select value={form.glAccountId} onChange={e => setForm({ ...form, glAccountId: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-64">
                <option value="">Select account...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cost Center</label>
              <select value={form.costCenterId} onChange={e => setForm({ ...form, costCenterId: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">None</option>
                {costCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Period (blank = annual)</label>
              <input type="month" value={form.period} onChange={e => setForm({ ...form, period: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Amount</label>
              <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32" />
            </div>
            <button onClick={addLine}
              className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
              <Plus className="h-4 w-4" /> Add
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-y border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Account</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Cost Center</th>
                <th className="text-left px-4 py-2 font-medium text-gray-600">Period</th>
                <th className="text-right px-4 py-2 font-medium text-gray-600">Amount</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {lines.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-6 text-gray-400">No budget lines for FY {fiscalYear}</td></tr>
              ) : lines.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-800">{l.glAccountId ? accName(l.glAccountId) : '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{l.costCenterId ? ccName(l.costCenterId) : '—'}</td>
                  <td className="px-4 py-2 text-gray-600">{l.period || 'Annual'}</td>
                  <td className="px-4 py-2 text-right text-gray-800">{num(l.amount).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">
                    <button onClick={() => removeLine(l.id)} className="text-red-500 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Account</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Cost Center</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Budget</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Committed</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Actual</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Available</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Variance</th>
                <th className="px-4 py-3 font-medium text-gray-600 w-1/5">Utilization</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">No budget data for this selection</td></tr>
              ) : rows.map((r, i) => {
                const util = num(r.utilization);
                const variance = num(r.variance);
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {r.accountCode ? <span className="font-mono text-xs text-gray-500 mr-1">{r.accountCode}</span> : null}
                      {r.accountName || '(unbudgeted)'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{r.costCenterName || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{num(r.budget).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{num(r.committed).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{num(r.actual).toLocaleString()}</td>
                    <td className={`px-4 py-3 text-right font-medium ${num(r.available) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {num(r.available).toLocaleString()}
                    </td>
                    <td className={`px-4 py-3 text-right ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {variance.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
                          <div className={`h-3 ${utilColor(util)}`} style={{ width: `${Math.min(100, util)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 w-12 text-right">{util.toFixed(0)}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-gray-50 border-t border-gray-200 font-semibold text-gray-800">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>Total</td>
                  <td className="px-4 py-3 text-right">{totals.budget.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{totals.committed.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">{totals.actual.toLocaleString()}</td>
                  <td className={`px-4 py-3 text-right ${totals.available >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {totals.available.toLocaleString()}
                  </td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
