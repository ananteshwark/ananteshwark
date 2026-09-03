import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qualityApi } from '../../api/quality';
import { clsx } from 'clsx';
import { CheckCircle, XCircle, ClipboardList, Save, ThumbsUp, ThumbsDown, AlertTriangle } from 'lucide-react';

const unwrap = (res: any) => res?.data?.data ?? res?.data;

// Mirror of backend MEASURED verdict derivation for live indication
function deriveVerdict(char: any, measured: string, qualitative: string): 'PASS' | 'FAIL' | null {
  if (char.type === 'MEASURED') {
    if (measured === '' || measured === null || measured === undefined) return null;
    const v = Number(measured);
    if (Number.isNaN(v)) return null;
    const hasLower = char.lowerLimit !== null && char.lowerLimit !== undefined;
    const hasUpper = char.upperLimit !== null && char.upperLimit !== undefined;
    if (hasLower || hasUpper) {
      if (hasLower && v < Number(char.lowerLimit)) return 'FAIL';
      if (hasUpper && v > Number(char.upperLimit)) return 'FAIL';
      return 'PASS';
    }
    if (char.target !== null && char.target !== undefined) {
      const target = Number(char.target);
      const tolerance = Math.max(Math.abs(target) * 0.01, 0.0001);
      return Math.abs(v - target) <= tolerance ? 'PASS' : 'FAIL';
    }
    return 'FAIL';
  }
  // QUALITATIVE: verdict is the user-selected value
  if (qualitative === 'PASS') return 'PASS';
  if (qualitative === 'FAIL') return 'FAIL';
  return null;
}

interface RowState { measured: string; qualitative: string; verdict: 'PASS' | 'FAIL' | '' }

export default function ResultsRecordingPage() {
  const qc = useQueryClient();
  const [lotId, setLotId] = useState<string>('');
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [decisionNotes, setDecisionNotes] = useState('');
  const [raisedNcr, setRaisedNcr] = useState<any>(null);

  const { data: lotsRes } = useQuery({ queryKey: ['quality-lots'], queryFn: () => qualityApi.getLots() });
  const lots = unwrap(lotsRes)?.items ?? unwrap(lotsRes) ?? [];

  const { data: resultsRes } = useQuery({
    queryKey: ['quality-lot-results', lotId],
    queryFn: () => qualityApi.getLotResults(lotId),
    enabled: !!lotId,
  });
  const payload = unwrap(resultsRes);
  const lot = payload?.lot;
  const characteristics: any[] = payload?.characteristics ?? [];

  useEffect(() => {
    if (!characteristics.length) { setRows({}); return; }
    const next: Record<string, RowState> = {};
    for (const entry of characteristics) {
      const c = entry.characteristic;
      const r = entry.result;
      next[c.id] = {
        measured: r?.measuredValue?.toString() ?? '',
        qualitative: c.type === 'QUALITATIVE' ? (r?.verdict ?? '') : (r?.qualitativeValue ?? ''),
        verdict: r?.verdict ?? '',
      };
    }
    setRows(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultsRes, lotId]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['quality-lot-results', lotId] });
    qc.invalidateQueries({ queryKey: ['quality-lots'] });
  };

  const recordMut = useMutation({
    mutationFn: (data: any) => qualityApi.recordLotResults(lotId, data),
    onSuccess: () => invalidate(),
  });
  const decisionMut = useMutation({
    mutationFn: (data: any) => qualityApi.setUsageDecision(lotId, data),
    onSuccess: (res) => {
      const out = unwrap(res);
      setRaisedNcr(out?.ncr ?? null);
      invalidate();
    },
  });

  const setRow = (charId: string, patch: Partial<RowState>) => {
    setRows((prev) => ({ ...prev, [charId]: { ...prev[charId], ...patch } }));
  };

  const saveResults = () => {
    const results = characteristics.map((entry) => {
      const c = entry.characteristic;
      const r = rows[c.id] ?? { measured: '', qualitative: '', verdict: '' };
      if (c.type === 'MEASURED') {
        return { characteristicId: c.id, measuredValue: r.measured === '' ? null : Number(r.measured) };
      }
      return {
        characteristicId: c.id,
        qualitativeValue: r.qualitative || null,
        verdict: r.qualitative === 'PASS' || r.qualitative === 'FAIL' ? r.qualitative : undefined,
      };
    });
    recordMut.mutate({ results });
  };

  const setDecision = (decision: 'ACCEPT' | 'REJECT' | 'CONDITIONAL') => {
    setRaisedNcr(null);
    decisionMut.mutate({ decision, notes: decisionNotes || undefined });
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><ClipboardList className="h-6 w-6" /> Results Recording</h1>
        <p className="text-gray-500 text-sm mt-1">Enter inspection results per characteristic and set the usage decision</p>
      </div>

      <div className="bg-white rounded-xl p-4 border mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Inspection Lot</label>
        <select value={lotId} onChange={(e) => { setLotId(e.target.value); setRaisedNcr(null); }} className="w-full max-w-md border rounded-lg px-3 py-2 text-sm">
          <option value="">Select an inspection lot…</option>
          {lots.map((l: any) => (
            <option key={l.id} value={l.id}>{l.lotNumber} — {l.itemCode} ({l.status})</option>
          ))}
        </select>
      </div>

      {lotId && lot && (
        <>
          <div className="bg-white rounded-xl border overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-gray-500">
                <tr>
                  <th className="px-4 py-3">Characteristic</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Spec</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {characteristics.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No characteristics defined for this lot's plan.</td></tr>
                )}
                {characteristics.map((entry) => {
                  const c = entry.characteristic;
                  const r = rows[c.id] ?? { measured: '', qualitative: '', verdict: '' };
                  const liveVerdict = deriveVerdict(c, r.measured, r.qualitative);
                  const spec = c.type === 'MEASURED'
                    ? `${c.lowerLimit ?? '−∞'} … ${c.upperLimit ?? '+∞'}${c.target != null ? ` (tgt ${c.target})` : ''}${c.uom ? ' ' + c.uom : ''}`
                    : '—';
                  return (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{c.name} {c.mandatory && <span className="text-red-500">*</span>}</td>
                      <td className="px-4 py-3">{c.type}</td>
                      <td className="px-4 py-3 text-gray-500">{spec}</td>
                      <td className="px-4 py-3">
                        {c.type === 'MEASURED' ? (
                          <input type="number" value={r.measured} onChange={(e) => setRow(c.id, { measured: e.target.value })} className="w-32 border rounded-lg px-2 py-1 text-sm" placeholder="value" />
                        ) : (
                          <select value={r.qualitative} onChange={(e) => setRow(c.id, { qualitative: e.target.value })} className="w-32 border rounded-lg px-2 py-1 text-sm">
                            <option value="">—</option>
                            <option value="PASS">PASS</option>
                            <option value="FAIL">FAIL</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {liveVerdict === 'PASS' && <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle className="h-4 w-4" /> PASS</span>}
                        {liveVerdict === 'FAIL' && <span className="inline-flex items-center gap-1 text-red-600"><XCircle className="h-4 w-4" /> FAIL</span>}
                        {liveVerdict === null && <span className="text-gray-400">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-3 mb-8">
            <button onClick={saveResults} disabled={recordMut.isPending || characteristics.length === 0} className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              <Save className="h-4 w-4" /> {recordMut.isPending ? 'Saving…' : 'Save Results'}
            </button>
            {recordMut.isSuccess && <span className="text-sm text-green-600">Results saved.</span>}
          </div>

          <div className="bg-white rounded-xl p-4 border">
            <h2 className="text-lg font-bold mb-1">Usage Decision</h2>
            <p className="text-sm text-gray-500 mb-3">Current: <span className="font-medium">{lot.usageDecision ?? 'Not decided'}</span> · Lot status: <span className="font-medium">{lot.status}</span></p>
            <textarea value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} placeholder="Notes (optional)" className="w-full border rounded-lg px-3 py-2 text-sm mb-3" rows={2} />
            <div className="flex gap-2">
              <button onClick={() => setDecision('ACCEPT')} disabled={decisionMut.isPending} className="inline-flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                <ThumbsUp className="h-4 w-4" /> Accept
              </button>
              <button onClick={() => setDecision('CONDITIONAL')} disabled={decisionMut.isPending} className="inline-flex items-center gap-1 px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600 disabled:opacity-50">
                <AlertTriangle className="h-4 w-4" /> Conditional
              </button>
              <button onClick={() => setDecision('REJECT')} disabled={decisionMut.isPending} className="inline-flex items-center gap-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
                <ThumbsDown className="h-4 w-4" /> Reject
              </button>
            </div>
            {raisedNcr && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <div>Non-conformance <span className="font-semibold">{raisedNcr.ncrNumber}</span> was automatically raised for this rejected lot.</div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
