import { useState, useEffect } from 'react';
import { financeApi } from '../../api/finance';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

const STRATEGIES = [
  { value: 'OLDEST_FIRST', label: 'Oldest first' },
  { value: 'EXACT_MATCH', label: 'Exact balance match' },
  { value: 'BY_REFERENCE', label: 'By invoice reference' },
];

const RECEIPT_STATUS_STYLES: Record<string, string> = {
  UNAPPLIED: 'bg-blue-100 text-blue-700',
  APPLIED: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-yellow-100 text-yellow-700',
  UNMATCHED: 'bg-red-100 text-red-700',
};

const BATCH_STATUS_STYLES: Record<string, string> = {
  PARSED: 'bg-blue-100 text-blue-700',
  APPLIED: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-yellow-100 text-yellow-700',
};

const SAMPLE: Record<string, string> = {
  NORMALIZED: 'ACME|1500.00|2026-06-01|Invoice payment\nBETA|750.00|2026-06-02|REF INV-042',
  MT940: ':20:STMT001\n:61:2606010601C1500,00NTRFNONREF\n:86:REF:ACME payment',
  BAI2: '16,165,150000,,ACME,Invoice payment',
};

const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function LockboxPage() {
  const [batches, setBatches] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [strategy, setStrategy] = useState('OLDEST_FIRST');
  const [importForm, setImportForm] = useState({ format: 'NORMALIZED', content: SAMPLE.NORMALIZED, fileReference: '' });
  const [showImport, setShowImport] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { loadBatches(); loadReceipts(); }, []);

  async function loadBatches() { setBatches(unwrap(await financeApi.listLockboxBatches())); }
  async function loadReceipts(batchId?: string) {
    setReceipts(unwrap(await financeApi.listLockboxReceipts(batchId ? { batchId } : {})));
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      await financeApi.importLockboxBatch(importForm);
      setShowImport(false);
      loadBatches();
      loadReceipts();
    } catch (err: any) {
      setMsg(err.response?.data?.message ?? 'Import failed');
    }
  }

  async function handleApplyBatch(id: string) {
    setMsg('');
    try {
      const res = await financeApi.applyLockboxBatch(id, strategy);
      const r = res.data?.data ?? res.data;
      setMsg(`Applied ${r.applied} receipt(s), ${money(r.appliedAmount)} total; ${r.skipped} skipped.`);
      loadBatches();
      loadReceipts(selectedBatch ?? undefined);
    } catch (err: any) {
      setMsg(err.response?.data?.message ?? 'Apply failed');
    }
  }

  async function handleApplyReceipt(id: string) {
    try {
      await financeApi.applyLockboxReceipt(id, strategy);
      loadReceipts(selectedBatch ?? undefined);
      loadBatches();
    } catch (err: any) {
      setMsg(err.response?.data?.message ?? 'Apply failed');
    }
  }

  async function handleAssign(id: string) {
    const customerId = window.prompt('Customer ID to assign:');
    if (!customerId) return;
    try {
      await financeApi.assignLockboxCustomer(id, customerId);
      loadReceipts(selectedBatch ?? undefined);
    } catch (err: any) {
      setMsg(err.response?.data?.message ?? 'Assign failed');
    }
  }

  function selectBatch(id: string) {
    setSelectedBatch(id);
    loadReceipts(id);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">AR Lockbox</h1>
          <p className="text-gray-500 text-sm mt-1">
            Oracle AR Lockbox parity — import MT940 / BAI2 / normalized bank files, auto-apply receipts
            to invoices (oldest-first / exact / by-reference), and manage the unapplied queue.
          </p>
        </div>
        <button onClick={() => setShowImport(!showImport)} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700">+ Import File</button>
      </div>

      {msg && <div className="bg-indigo-50 text-indigo-700 text-sm px-3 py-2 rounded">{msg}</div>}

      {showImport && (
        <form onSubmit={handleImport} className="border rounded-lg p-4 bg-gray-50 space-y-3">
          <div className="flex gap-3">
            <div>
              <label className="text-xs text-gray-500">Format</label>
              <select value={importForm.format} onChange={(e) => setImportForm({ ...importForm, format: e.target.value, content: SAMPLE[e.target.value] })} className="w-full border rounded px-2 py-1 text-sm">
                {Object.keys(SAMPLE).map((f) => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500">File Reference</label>
              <input value={importForm.fileReference} onChange={(e) => setImportForm({ ...importForm, fileReference: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500">File Content</label>
            <textarea value={importForm.content} onChange={(e) => setImportForm({ ...importForm, content: e.target.value })} rows={6} className="w-full border rounded px-2 py-1 text-xs font-mono" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowImport(false)} className="border rounded px-3 py-1 text-sm">Cancel</button>
            <button type="submit" className="bg-indigo-600 text-white px-3 py-1 rounded text-sm">Import & Parse</button>
          </div>
        </form>
      )}

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-600">Application strategy:</span>
        <select value={strategy} onChange={(e) => setStrategy(e.target.value)} className="border rounded px-2 py-1 text-sm">
          {STRATEGIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-2 border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Batch</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y">
              {batches.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No batches.</td></tr> : batches.map((b) => (
                <tr key={b.id} onClick={() => selectBatch(b.id)} className={`cursor-pointer hover:bg-gray-50 ${selectedBatch === b.id ? 'bg-indigo-50' : ''}`}>
                  <td className="px-3 py-2"><div className="font-mono text-xs">{b.batchNumber}</div><div className="text-xs text-gray-400">{b.format} · {b.receiptCount} rcpts</div></td>
                  <td className="px-3 py-2 text-right">{money(b.totalAmount)}<div className="text-xs text-green-600">{money(b.appliedAmount)} applied</div></td>
                  <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${BATCH_STATUS_STYLES[b.status]}`}>{b.status}</span></td>
                  <td className="px-3 py-2">{b.status !== 'APPLIED' && <button onClick={(e) => { e.stopPropagation(); handleApplyBatch(b.id); }} className="text-indigo-600 text-xs hover:underline">Apply</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="col-span-3 border rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-gray-50 text-sm font-medium flex justify-between">
            <span>{selectedBatch ? 'Batch Receipts' : 'All Receipts'}</span>
            {selectedBatch && <button onClick={() => { setSelectedBatch(null); loadReceipts(); }} className="text-xs text-indigo-600">show all</button>}
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Ref</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y">
              {receipts.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No receipts.</td></tr> : receipts.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2"><div>{r.customerRef ?? '—'}</div>{r.memo && <div className="text-xs text-gray-400">{r.memo}</div>}</td>
                  <td className="px-3 py-2 text-right">{money(r.amount)}{Number(r.appliedAmount) > 0 && <div className="text-xs text-green-600">{money(r.appliedAmount)}</div>}</td>
                  <td className="px-3 py-2 text-xs">{r.receiptDate}</td>
                  <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${RECEIPT_STATUS_STYLES[r.status]}`}>{r.status}</span></td>
                  <td className="px-3 py-2 text-xs">
                    {r.status === 'UNMATCHED' && <button onClick={() => handleAssign(r.id)} className="text-orange-600 hover:underline">assign</button>}
                    {r.status === 'UNAPPLIED' && <button onClick={() => handleApplyReceipt(r.id)} className="text-indigo-600 hover:underline">apply</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
