import { useState, useEffect } from 'react';
import {
  FileText,
  Plus,
  Trash2,
  CheckCircle2,
  Play,
  TrendingDown,
  Layers,
} from 'lucide-react';
import { revenueRecognitionApi } from '../../api/revenueRecognition';
import { financeApi } from '../../api/finance';

const unwrapList = (res: any) => {
  const d = res.data?.data ?? res.data;
  return Array.isArray(d) ? d : d?.items ?? [];
};
const unwrap = (res: any) => res.data?.data ?? res.data;
const num = (v: any) => Number(v) || 0;
const fmt = (v: any) =>
  num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ACTIVE: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  PENDING: 'bg-gray-100 text-gray-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  FULFILLED: 'bg-green-100 text-green-700',
};

type Tab = 'contracts' | 'recognize' | 'waterfall';

interface ObligationLine {
  name: string;
  standaloneSellingPrice: string;
  method: 'POINT_IN_TIME' | 'OVER_TIME';
  startDate: string;
  endDate: string;
}

const blankObligation = (): ObligationLine => ({
  name: '',
  standaloneSellingPrice: '',
  method: 'POINT_IN_TIME',
  startDate: '',
  endDate: '',
});

export default function RevenueRecognitionPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<Tab>('contracts');
  const [contracts, setContracts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [waterfall, setWaterfall] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    customerId: '',
    contractDate: today,
    totalTransactionPrice: '',
    currency: 'USD',
    notes: '',
  });
  const [obligations, setObligations] = useState<ObligationLine[]>([blankObligation()]);

  const [recForm, setRecForm] = useState({ periodEnd: today, contractId: '' });
  const [recResult, setRecResult] = useState<any>(null);

  const loadContracts = () =>
    revenueRecognitionApi
      .listContracts()
      .then((res) => setContracts(unwrapList(res)))
      .catch(() => setContracts([]));
  const loadWaterfall = () =>
    revenueRecognitionApi
      .waterfall()
      .then((res) => setWaterfall(unwrap(res)))
      .catch(() => setWaterfall(null));

  useEffect(() => {
    loadContracts();
    loadWaterfall();
    financeApi
      .getCustomers({ limit: 500 })
      .then((res) => setCustomers(unwrapList(res)))
      .catch(() => setCustomers([]));
  }, []);

  const customerName = (id: string) =>
    customers.find((c) => c.id === id)?.name ?? customers.find((c) => c.id === id)?.displayName ?? id;

  // ── SSP allocation preview ──
  const totalSsp = obligations.reduce((s, o) => s + num(o.standaloneSellingPrice), 0);
  const previewAllocated = (ssp: string) => {
    const price = num(form.totalTransactionPrice);
    if (totalSsp <= 0) return 0;
    return (num(ssp) / totalSsp) * price;
  };

  const addObligation = () => setObligations((o) => [...o, blankObligation()]);
  const removeObligation = (i: number) =>
    setObligations((o) => (o.length > 1 ? o.filter((_, idx) => idx !== i) : o));
  const updateObligation = (i: number, patch: Partial<ObligationLine>) =>
    setObligations((o) => o.map((ob, idx) => (idx === i ? { ...ob, ...patch } : ob)));

  const createContract = async () => {
    if (!form.totalTransactionPrice || num(form.totalTransactionPrice) <= 0) {
      setMsg('Total transaction price must be greater than zero');
      return;
    }
    for (const ob of obligations) {
      if (!ob.name || !ob.standaloneSellingPrice) {
        setMsg('Each obligation needs a name and standalone selling price');
        return;
      }
      if (ob.method === 'OVER_TIME' && (!ob.startDate || !ob.endDate)) {
        setMsg(`OVER_TIME obligation "${ob.name || '(unnamed)'}" needs start and end dates`);
        return;
      }
    }
    setMsg(null);
    try {
      await revenueRecognitionApi.createContract({
        customerId: form.customerId || undefined,
        customerName: form.customerId ? customerName(form.customerId) : undefined,
        contractDate: form.contractDate,
        totalTransactionPrice: num(form.totalTransactionPrice),
        currency: form.currency || 'USD',
        notes: form.notes || undefined,
        obligations: obligations.map((ob) => ({
          name: ob.name,
          standaloneSellingPrice: num(ob.standaloneSellingPrice),
          method: ob.method,
          startDate: ob.method === 'OVER_TIME' ? ob.startDate : undefined,
          endDate: ob.method === 'OVER_TIME' ? ob.endDate : undefined,
        })),
      });
      setForm({ customerId: '', contractDate: today, totalTransactionPrice: '', currency: 'USD', notes: '' });
      setObligations([blankObligation()]);
      setShowForm(false);
      loadContracts();
      loadWaterfall();
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? 'Failed to create contract');
    }
  };

  const openContract = async (id: string) => {
    try {
      const res = await revenueRecognitionApi.getContract(id);
      setSelected(unwrap(res));
    } catch {
      setMsg('Failed to load contract');
    }
  };

  const fulfill = async (obligationId: string) => {
    try {
      await revenueRecognitionApi.fulfillObligation(obligationId, today);
      if (selected) openContract(selected.contract.id);
      loadContracts();
      loadWaterfall();
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? 'Failed to fulfil obligation');
    }
  };

  const runRecognition = async () => {
    if (!recForm.periodEnd) {
      setMsg('Period end is required');
      return;
    }
    setMsg(null);
    try {
      const res = await revenueRecognitionApi.recognize({
        periodEnd: recForm.periodEnd,
        contractId: recForm.contractId || undefined,
      });
      setRecResult(unwrap(res));
      loadContracts();
      loadWaterfall();
      if (selected) openContract(selected.contract.id);
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? 'Failed to recognise revenue');
    }
  };

  const Chip = ({ status }: { status: string }) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );

  const TABS: { key: Tab; label: string }[] = [
    { key: 'contracts', label: 'Contracts' },
    { key: 'recognize', label: 'Recognize Revenue' },
    { key: 'waterfall', label: 'Deferred Waterfall' },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Revenue Recognition</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            IFRS 15 / ASC 606 — performance obligations, transaction-price allocation, and scheduled recognition
          </p>
        </div>
        {tab === 'contracts' && (
          <button onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            <Plus className="h-4 w-4" /> New Contract
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

      {/* ─── Contracts ─── */}
      {tab === 'contracts' && (
        <>
          {showForm && (
            <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-end gap-2 mb-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Customer</label>
                  <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-52">
                    <option value="">(optional)</option>
                    {customers.map((c) => <option key={c.id} value={c.id}>{c.name ?? c.displayName}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Contract Date</label>
                  <input type="date" value={form.contractDate} onChange={(e) => setForm({ ...form, contractDate: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Transaction Price</label>
                  <input type="number" value={form.totalTransactionPrice} onChange={(e) => setForm({ ...form, totalTransactionPrice: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-36" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Currency</label>
                  <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-20" />
                </div>
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs text-gray-500 mb-1">Notes</label>
                  <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full" />
                </div>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <Layers className="h-4 w-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Performance Obligations</span>
                {totalSsp > 0 && num(form.totalTransactionPrice) > 0 && Math.abs(totalSsp - num(form.totalTransactionPrice)) > 0.01 && (
                  <span className="text-xs text-amber-600">
                    SSP total {fmt(totalSsp)} ≠ price {fmt(form.totalTransactionPrice)} — price will be allocated proportionally
                  </span>
                )}
              </div>

              <div className="space-y-2">
                {obligations.map((ob, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2 bg-gray-50 rounded-lg p-2">
                    <div className="flex-1 min-w-[140px]">
                      <label className="block text-xs text-gray-500 mb-1">Name</label>
                      <input value={ob.name} onChange={(e) => updateObligation(i, { name: e.target.value })}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-full" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">SSP</label>
                      <input type="number" value={ob.standaloneSellingPrice} onChange={(e) => updateObligation(i, { standaloneSellingPrice: e.target.value })}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm w-24" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Method</label>
                      <select value={ob.method} onChange={(e) => updateObligation(i, { method: e.target.value as any })}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                        <option value="POINT_IN_TIME">Point in time</option>
                        <option value="OVER_TIME">Over time</option>
                      </select>
                    </div>
                    {ob.method === 'OVER_TIME' && (
                      <>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Start</label>
                          <input type="date" value={ob.startDate} onChange={(e) => updateObligation(i, { startDate: e.target.value })}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">End</label>
                          <input type="date" value={ob.endDate} onChange={(e) => updateObligation(i, { endDate: e.target.value })}
                            className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
                        </div>
                      </>
                    )}
                    <div className="text-xs text-gray-500">
                      <div className="mb-1">Allocated</div>
                      <div className="font-medium text-gray-900 py-1.5">{fmt(previewAllocated(ob.standaloneSellingPrice))}</div>
                    </div>
                    <button onClick={() => removeObligation(i)} className="p-1.5 text-red-500 hover:text-red-700" title="Remove">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 mt-3">
                <button onClick={addObligation} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
                  <Plus className="h-4 w-4" /> Add obligation
                </button>
                <div className="flex-1" />
                <button onClick={createContract}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                  <Plus className="h-4 w-4" /> Create Contract
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Contract #</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Customer</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Transaction Price</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Recognized</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Deferred</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {contracts.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">No revenue contracts</td></tr>
                ) : contracts.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openContract(c.id)}>
                    <td className="px-4 py-3 font-medium text-blue-600">{c.contractNumber}</td>
                    <td className="px-4 py-3 text-gray-700">{c.customerName ?? (c.customerId ? customerName(c.customerId) : '—')}</td>
                    <td className="px-4 py-3 text-gray-600">{c.contractDate}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">{fmt(c.totalTransactionPrice)} {c.currency}</td>
                    <td className="px-4 py-3 text-right text-green-700">{fmt(c.recognizedAmount)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(num(c.totalTransactionPrice) - num(c.recognizedAmount))}</td>
                    <td className="px-4 py-3"><Chip status={c.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Contract detail */}
          {selected && (
            <div className="mt-6 bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-900">{selected.contract.contractNumber}</h3>
                  <p className="text-xs text-gray-500">
                    Allocated {fmt(selected.totals.allocated)} · Recognized {fmt(selected.totals.recognized)} · Deferred {fmt(selected.totals.deferred)}
                  </p>
                </div>
                <button onClick={() => setSelected(null)} className="text-sm text-gray-400 hover:text-gray-600">Close</button>
              </div>

              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-y border-gray-200">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Obligation</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Method</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Allocated</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Recognized</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Deferred</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {selected.obligations.map((o: any) => (
                    <tr key={o.id}>
                      <td className="px-3 py-2 font-medium text-gray-900">{o.name}</td>
                      <td className="px-3 py-2 text-gray-600">{o.method === 'OVER_TIME' ? `Over time (${o.startDate} → ${o.endDate})` : 'Point in time'}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{fmt(o.allocatedAmount)}</td>
                      <td className="px-3 py-2 text-right text-green-700">{fmt(o.recognizedAmount)}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{fmt(o.deferredAmount)}</td>
                      <td className="px-3 py-2"><Chip status={o.status} /></td>
                      <td className="px-3 py-2 text-right">
                        {o.method === 'POINT_IN_TIME' && o.status !== 'FULFILLED' && (
                          <button onClick={() => fulfill(o.id)} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs ml-auto">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Fulfil
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {selected.schedules.length > 0 && (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-gray-500 mb-2">Recognition Schedule</div>
                  <div className="flex flex-wrap gap-2">
                    {selected.schedules.map((s: any) => (
                      <div key={s.id} className={`px-3 py-1.5 rounded-lg text-xs border ${s.recognized ? 'bg-green-50 border-green-200 text-green-700' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                        {s.periodEnd}: {fmt(s.scheduledAmount)} {s.recognized && '✓'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ─── Recognize ─── */}
      {tab === 'recognize' && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 max-w-xl">
          <div className="flex items-center gap-2 mb-4">
            <Play className="h-4 w-4 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Run Revenue Recognition</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Posts a journal entry (Dr deferred revenue, Cr revenue) for every unrecognised schedule
            row dated on or before the period end, then advances obligation and contract status.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Period End</label>
              <input type="date" value={recForm.periodEnd} onChange={(e) => setRecForm({ ...recForm, periodEnd: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Contract (optional — blank = all)</label>
              <select value={recForm.contractId} onChange={(e) => setRecForm({ ...recForm, contractId: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full">
                <option value="">All contracts</option>
                {contracts.map((c) => <option key={c.id} value={c.id}>{c.contractNumber}</option>)}
              </select>
            </div>
            <button onClick={runRecognition}
              className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              Recognize Due Revenue
            </button>
            {recResult && (
              <div className={`mt-2 p-3 rounded-lg text-sm ${recResult.recognizedCount > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
                {recResult.recognizedCount === 0 ? (
                  <div>No schedule rows due as of this date.</div>
                ) : (
                  <>
                    <div>Recognized: <strong>{recResult.recognizedCount} schedule row{recResult.recognizedCount === 1 ? '' : 's'}</strong></div>
                    <div>Total: <strong>{fmt(recResult.totalRecognized)}</strong></div>
                    <div>Journal Entry: <strong>{recResult.journalEntryId}</strong></div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Waterfall ─── */}
      {tab === 'waterfall' && (
        <>
          {waterfall && (
            <div className="mb-4 bg-white rounded-lg border border-gray-200 p-4 inline-block">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <TrendingDown className="h-3.5 w-3.5" /> Total Deferred Revenue
              </div>
              <div className="text-2xl font-bold text-gray-900 mt-1">{fmt(waterfall.totalDeferred)}</div>
            </div>
          )}
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Period End</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Scheduled to Recognize</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!waterfall || (waterfall.rows ?? []).length === 0 ? (
                  <tr><td colSpan={2} className="text-center py-8 text-gray-400">No deferred revenue scheduled</td></tr>
                ) : waterfall.rows.map((r: any, i: number) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700">{r.periodEnd}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(r.scheduled)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
