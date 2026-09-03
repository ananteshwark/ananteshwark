import { useState, useEffect, useCallback } from 'react';
import { GitMerge, RefreshCw } from 'lucide-react';
import { grirApi } from '../../api/grir';

interface GrirEntry {
  id: string;
  poId: string | null;
  grnId: string | null;
  billId: string | null;
  itemDescription: string | null;
  quantity: number;
  unitCost: number;
  totalAmount: number;
  type: 'GR' | 'IV';
  status: 'OPEN' | 'CLEARED';
  postingDate: string | null;
  createdAt: string;
  ageDays?: number;
}

export default function GrirPage() {
  const [grItems, setGrItems] = useState<GrirEntry[]>([]);
  const [ivItems, setIvItems] = useState<GrirEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchResult, setMatchResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await grirApi.getReport();
      const data = res.data?.data ?? res.data ?? {};
      setGrItems(data.grItems ?? []);
      setIvItems(data.ivItems ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load GR/IR data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAutoMatch = async () => {
    setMatching(true);
    setMatchResult(null);
    try {
      const res = await grirApi.autoMatch();
      const data = res.data?.data ?? res.data ?? {};
      setMatchResult(`Auto-match complete: ${data.matched ?? 0} pair(s) cleared.`);
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Auto-match failed');
    } finally {
      setMatching(false);
    }
  };

  const fmt = (n: number) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totalGrValue = grItems.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
  const totalIvValue = ivItems.reduce((s, r) => s + Number(r.totalAmount || 0), 0);
  const netDiff = totalGrValue - totalIvValue;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitMerge className="h-6 w-6 text-indigo-600" />
          <h1 className="text-2xl font-semibold text-gray-900">GR/IR Reconciliation</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleAutoMatch}
            disabled={matching || loading}
            className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <GitMerge className="h-4 w-4" />
            {matching ? 'Matching...' : 'Auto Match'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      {matchResult && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{matchResult}</div>
      )}

      {/* Summary Bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total GR Value (Received Not Invoiced)</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{fmt(totalGrValue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{grItems.length} open item(s)</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total IV Value (Invoiced Not Received)</p>
          <p className="text-xl font-semibold text-gray-900 mt-1">{fmt(totalIvValue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{ivItems.length} open item(s)</p>
        </div>
        <div className={`border rounded-lg p-4 ${netDiff >= 0 ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Net Difference (GR - IV)</p>
          <p className={`text-xl font-semibold mt-1 ${netDiff >= 0 ? 'text-amber-700' : 'text-blue-700'}`}>
            {netDiff >= 0 ? '' : '-'}{fmt(Math.abs(netDiff))}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {netDiff > 0 ? 'More received than invoiced' : netDiff < 0 ? 'More invoiced than received' : 'Balanced'}
          </p>
        </div>
      </div>

      {/* GR Items — Received Not Invoiced */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">Received Not Invoiced (GR Entries)</h2>
          <p className="text-xs text-gray-500 mt-0.5">Goods received from vendors with no matching invoice yet</p>
        </div>
        {grItems.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">No open GR entries</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">GRN ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO Ref</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Unit Cost</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Value</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Age (Days)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {grItems.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{row.itemDescription ?? '-'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500">{row.grnId ? row.grnId.substring(0, 8) + '...' : '-'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500">{row.poId ? row.poId.substring(0, 8) + '...' : '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.postingDate ?? row.createdAt?.split('T')[0] ?? '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{Number(row.quantity).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700 text-right">{fmt(row.unitCost)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{fmt(row.totalAmount)}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        (row.ageDays ?? 0) > 30 ? 'bg-red-100 text-red-700' :
                        (row.ageDays ?? 0) > 14 ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {row.ageDays ?? 0}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={6} className="px-4 py-3 text-sm font-semibold text-gray-700">Total</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{fmt(totalGrValue)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* IV Items — Invoiced Not Received */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">Invoiced Not Received (IV Entries)</h2>
          <p className="text-xs text-gray-500 mt-0.5">Vendor invoices approved without a matching goods receipt</p>
        </div>
        {ivItems.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">No open IV entries</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice Ref</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bill ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PO Ref</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Age (Days)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {ivItems.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{row.itemDescription ?? '-'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500">{row.billId ? row.billId.substring(0, 8) + '...' : '-'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500">{row.poId ? row.poId.substring(0, 8) + '...' : '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{row.postingDate ?? row.createdAt?.split('T')[0] ?? '-'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 text-right">{fmt(row.totalAmount)}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        (row.ageDays ?? 0) > 30 ? 'bg-red-100 text-red-700' :
                        (row.ageDays ?? 0) > 14 ? 'bg-amber-100 text-amber-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {row.ageDays ?? 0}d
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-700">Total</td>
                  <td className="px-4 py-3 text-sm font-semibold text-gray-900 text-right">{fmt(totalIvValue)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
