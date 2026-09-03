import { useState, useEffect } from 'react';
import { financeApi } from '../../api/finance';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_STYLES: Record<string, string> = {
  COMMITMENT: 'bg-blue-100 text-blue-700',
  OBLIGATION: 'bg-yellow-100 text-yellow-700',
  EXPENDITURE: 'bg-green-100 text-green-700',
};
const FUNDS_STYLES: Record<string, string> = {
  OK: 'text-green-600',
  WARNING: 'text-yellow-600',
  EXCEEDED: 'text-red-600',
};

export default function EncumbrancePage() {
  const [encumbrances, setEncumbrances] = useState<any[]>([]);
  const [report, setReport] = useState<any[]>([]);
  const [fiscalYear, setFiscalYear] = useState(2026);
  const [check, setCheck] = useState({ glAccountId: '', fiscalYear: 2026, amount: 10000 });
  const [checkResult, setCheckResult] = useState<any>(null);
  const [commit, setCommit] = useState({ sourceType: 'PO', sourceId: '', glAccountId: '', fiscalYear: 2026, amount: 0, enforceFunds: true });
  const [msg, setMsg] = useState('');

  useEffect(() => { load(); }, [fiscalYear]);

  async function load() {
    setEncumbrances(unwrap(await financeApi.listEncumbrances()));
    setReport(unwrap(await financeApi.encumbranceBalanceReport(fiscalYear)));
  }

  async function runCheck() {
    setCheckResult(unwrap(await financeApi.encumbranceFundsCheck(check)) || (await financeApi.encumbranceFundsCheck(check)).data);
    const res = await financeApi.encumbranceFundsCheck(check);
    setCheckResult(res.data?.data ?? res.data);
  }

  async function createCommit(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      await financeApi.createCommitment(commit);
      setMsg('Commitment recorded.');
      load();
    } catch (err: any) {
      setMsg(err.response?.data?.message ?? 'Failed');
    }
  }

  async function liquidate(enc: any) {
    const amt = prompt(`Liquidate ${enc.type} (balance ${Number(enc.amount) - Number(enc.liquidatedAmount)}):`);
    if (!amt) return;
    const nextSourceType = enc.type === 'COMMITMENT' ? 'GRN' : 'INVOICE';
    const nextSourceId = prompt(`${nextSourceType} ID:`) || 'manual';
    try {
      await financeApi.liquidateEncumbrance(enc.id, { amount: Number(amt), nextSourceType, nextSourceId });
      load();
    } catch (err: any) {
      alert(err.response?.data?.message ?? 'Liquidation failed');
    }
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Encumbrance Accounting</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Budgetary Control parity — commitment → obligation → expenditure lifecycle with real-time
          funds check. Available = appropriation − commitments − obligations − expenditures.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Funds check */}
        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-medium text-sm">Funds Check</h3>
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="GL Account ID" value={check.glAccountId} onChange={(e) => setCheck({ ...check, glAccountId: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono col-span-2" />
            <input type="number" placeholder="amount" value={check.amount} onChange={(e) => setCheck({ ...check, amount: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" />
          </div>
          <button onClick={runCheck} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Check</button>
          {checkResult && (
            <div className="text-sm border-t pt-2 space-y-1">
              <div className="flex justify-between"><span>Budget</span><span>{money(checkResult.budget)}</span></div>
              <div className="flex justify-between text-blue-600"><span>Committed</span><span>{money(checkResult.committed)}</span></div>
              <div className="flex justify-between text-yellow-600"><span>Obligated</span><span>{money(checkResult.obligated)}</span></div>
              <div className="flex justify-between text-green-600"><span>Expended</span><span>{money(checkResult.expended)}</span></div>
              <div className="flex justify-between font-medium"><span>Available</span><span>{money(checkResult.available)}</span></div>
              <div className={`flex justify-between font-bold ${FUNDS_STYLES[checkResult.status]}`}><span>Status</span><span>{checkResult.status}</span></div>
            </div>
          )}
        </div>

        {/* Create commitment */}
        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="font-medium text-sm">Record Commitment</h3>
          <form onSubmit={createCommit} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="Source type (PO)" value={commit.sourceType} onChange={(e) => setCommit({ ...commit, sourceType: e.target.value })} className="border rounded px-2 py-1 text-sm" />
              <input placeholder="Source ID" value={commit.sourceId} onChange={(e) => setCommit({ ...commit, sourceId: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono" />
              <input placeholder="GL Account ID" value={commit.glAccountId} onChange={(e) => setCommit({ ...commit, glAccountId: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono col-span-2" required />
              <input type="number" placeholder="amount" value={commit.amount || ''} onChange={(e) => setCommit({ ...commit, amount: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" required />
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={commit.enforceFunds} onChange={(e) => setCommit({ ...commit, enforceFunds: e.target.checked })} /> Block over-budget</label>
            </div>
            <button type="submit" className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm">Record</button>
            {msg && <p className="text-xs text-gray-600">{msg}</p>}
          </form>
        </div>
      </div>

      {/* Balance report */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 flex justify-between items-center">
          <span className="text-sm font-medium">Balance Report</span>
          <input type="number" value={fiscalYear} onChange={(e) => setFiscalYear(Number(e.target.value))} className="border rounded px-2 py-1 text-sm w-24" />
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Account</th><th className="px-3 py-2 text-right">Budget</th><th className="px-3 py-2 text-right">Committed</th><th className="px-3 py-2 text-right">Obligated</th><th className="px-3 py-2 text-right">Expended</th><th className="px-3 py-2 text-right">Available</th></tr></thead>
          <tbody className="divide-y">
            {report.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No budget/encumbrance data for {fiscalYear}.</td></tr> : report.map((r) => (
              <tr key={r.glAccountId} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{r.glAccountId}</td>
                <td className="px-3 py-2 text-right">{money(r.budget)}</td>
                <td className="px-3 py-2 text-right text-blue-600">{money(r.committed)}</td>
                <td className="px-3 py-2 text-right text-yellow-600">{money(r.obligated)}</td>
                <td className="px-3 py-2 text-right text-green-600">{money(r.expended)}</td>
                <td className={`px-3 py-2 text-right font-medium ${r.available < 0 ? 'text-red-600' : ''}`}>{money(r.available)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Encumbrance ledger */}
      <div className="border rounded-lg overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 text-sm font-medium">Encumbrance Ledger</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Source</th><th className="px-3 py-2 text-left">Account</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Liquidated</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">
            {encumbrances.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No encumbrances.</td></tr> : encumbrances.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${TYPE_STYLES[e.type]}`}>{e.type}</span></td>
                <td className="px-3 py-2 text-xs">{e.sourceType} {e.sourceId?.slice(0, 8)}</td>
                <td className="px-3 py-2 font-mono text-xs">{e.glAccountId?.slice(0, 8)}</td>
                <td className="px-3 py-2 text-right">{money(e.amount)}</td>
                <td className="px-3 py-2 text-right text-gray-500">{money(e.liquidatedAmount)}</td>
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${e.status === 'LIQUIDATED' ? 'bg-gray-100 text-gray-500' : 'bg-indigo-100 text-indigo-700'}`}>{e.status}</span></td>
                <td className="px-3 py-2">
                  {e.status === 'OUTSTANDING' && e.type !== 'EXPENDITURE' && (
                    <button onClick={() => liquidate(e)} className="text-indigo-600 text-xs hover:underline">Liquidate</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
