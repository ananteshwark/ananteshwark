import { useState, useEffect } from 'react';
import { financeApi } from '../../api/finance';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

const PROMISE_STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  KEPT: 'bg-green-100 text-green-700',
  BROKEN: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};
const DISPUTE_STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-orange-100 text-orange-700',
  IN_REVIEW: 'bg-yellow-100 text-yellow-700',
  RESOLVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-gray-100 text-gray-500',
};

const CONTACT_METHODS = ['CALL', 'EMAIL', 'LETTER', 'MEETING', 'NOTE'];
const DISPUTE_REASONS = ['PRICING', 'QUALITY', 'QUANTITY', 'DELIVERY', 'DUPLICATE', 'OTHER'];

const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CollectionsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // forms
  const [noteForm, setNoteForm] = useState({ contactMethod: 'CALL', note: '' });
  const [promiseForm, setPromiseForm] = useState({ amountPromised: 0, promiseDate: '', notes: '' });
  const [disputeForm, setDisputeForm] = useState({ invoiceId: '', disputedAmount: 0, reason: 'PRICING', description: '' });

  useEffect(() => { loadWorkbench(); }, []);

  async function loadWorkbench() {
    setLoading(true);
    try {
      setRows(unwrap(await financeApi.getCollectionsWorkbench()));
    } finally {
      setLoading(false);
    }
  }

  async function openCustomer(customerId: string) {
    setSelected(customerId);
    setDetail(unwrap(await financeApi.getCollectionsCustomer(customerId)) || (await financeApi.getCollectionsCustomer(customerId)).data);
    const res = await financeApi.getCollectionsCustomer(customerId);
    setDetail(res.data?.data ?? res.data);
  }

  async function refreshDetail() {
    if (selected) {
      const res = await financeApi.getCollectionsCustomer(selected);
      setDetail(res.data?.data ?? res.data);
      loadWorkbench();
    }
  }

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    await financeApi.addCollectionNote({ customerId: selected, ...noteForm });
    setNoteForm({ contactMethod: 'CALL', note: '' });
    refreshDetail();
  }

  async function handleCreatePromise(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    await financeApi.createPromise({ customerId: selected, ...promiseForm });
    setPromiseForm({ amountPromised: 0, promiseDate: '', notes: '' });
    refreshDetail();
  }

  async function handleResolvePromise(id: string, status: string) {
    await financeApi.resolvePromise(id, { status });
    refreshDetail();
  }

  async function handleRaiseDispute(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    await financeApi.raiseDispute({ customerId: selected, ...disputeForm });
    setDisputeForm({ invoiceId: '', disputedAmount: 0, reason: 'PRICING', description: '' });
    refreshDetail();
  }

  async function handleUpdateDispute(id: string, status: string) {
    await financeApi.updateDispute(id, { status });
    refreshDetail();
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Collections Workbench</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Collections parity — aging drill-down, contact history, promise-to-pay tracking, and
          dispute management. Active disputes suspend dunning automatically.
        </p>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Customer list */}
        <div className="col-span-2 border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-right">Outstanding</th>
                <th className="px-3 py-2 text-right">90+</th>
                <th className="px-3 py-2 text-center">P / D</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-400">No outstanding receivables.</td></tr>
              ) : rows.map((r) => (
                <tr
                  key={r.customerId}
                  onClick={() => openCustomer(r.customerId)}
                  className={`cursor-pointer hover:bg-gray-50 ${selected === r.customerId ? 'bg-indigo-50' : ''}`}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.customerName}</div>
                    <div className="text-xs text-gray-400">{r.maxDaysOverdue}d overdue · {r.invoiceCount} inv</div>
                  </td>
                  <td className="px-3 py-2 text-right">{money(r.totalOutstanding)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{r.b90plus > 0 ? money(r.b90plus) : '—'}</td>
                  <td className="px-3 py-2 text-center text-xs">
                    {r.openPromises > 0 && <span className="text-blue-600">{r.openPromises}P </span>}
                    {r.openDisputes > 0 && <span className="text-orange-600">{r.openDisputes}D</span>}
                    {!r.openPromises && !r.openDisputes && <span className="text-gray-300">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detail */}
        <div className="col-span-3 border rounded-lg p-4">
          {!detail ? (
            <p className="text-gray-400 text-sm">Select a customer to view aging, contact history, promises and disputes.</p>
          ) : (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">{detail.customer?.name}</h2>

              {/* Open invoices */}
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-1">Open Invoices</h3>
                <div className="border rounded overflow-hidden max-h-40 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50"><tr><th className="px-2 py-1 text-left">Invoice</th><th className="px-2 py-1 text-left">Due</th><th className="px-2 py-1 text-right">Balance</th><th className="px-2 py-1 text-right">Overdue</th></tr></thead>
                    <tbody className="divide-y">
                      {(detail.openInvoices ?? []).length === 0 ? <tr><td colSpan={4} className="px-2 py-3 text-center text-gray-400">None</td></tr> : detail.openInvoices.map((i: any) => (
                        <tr key={i.id}>
                          <td className="px-2 py-1 font-mono">{i.invoiceNumber}</td>
                          <td className="px-2 py-1">{i.dueDate}</td>
                          <td className="px-2 py-1 text-right">{money(i.balanceDue)}</td>
                          <td className={`px-2 py-1 text-right ${i.daysOverdue > 0 ? 'text-red-600' : 'text-gray-400'}`}>{i.daysOverdue > 0 ? `${i.daysOverdue}d` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Promises */}
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-1">Promises to Pay</h3>
                {(detail.promises ?? []).map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between text-xs py-1 border-b">
                    <span>{money(p.amountPromised)} by {p.promiseDate}</span>
                    <span className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded ${PROMISE_STATUS_STYLES[p.status]}`}>{p.status}</span>
                      {p.status === 'OPEN' && (
                        <>
                          <button onClick={() => handleResolvePromise(p.id, 'KEPT')} className="text-green-600 hover:underline">kept</button>
                          <button onClick={() => handleResolvePromise(p.id, 'BROKEN')} className="text-red-500 hover:underline">broken</button>
                        </>
                      )}
                    </span>
                  </div>
                ))}
                <form onSubmit={handleCreatePromise} className="flex gap-1 mt-1">
                  <input type="number" required placeholder="amount" value={promiseForm.amountPromised || ''} onChange={(e) => setPromiseForm({ ...promiseForm, amountPromised: Number(e.target.value) })} className="border rounded px-2 py-1 text-xs w-24" />
                  <input type="date" required value={promiseForm.promiseDate} onChange={(e) => setPromiseForm({ ...promiseForm, promiseDate: e.target.value })} className="border rounded px-2 py-1 text-xs" />
                  <button type="submit" className="bg-blue-600 text-white px-2 py-1 rounded text-xs">+ Promise</button>
                </form>
              </div>

              {/* Disputes */}
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-1">Disputes</h3>
                {(detail.disputes ?? []).map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between text-xs py-1 border-b">
                    <span>{d.reason} · {money(d.disputedAmount)} — {d.description}</span>
                    <span className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded ${DISPUTE_STATUS_STYLES[d.status]}`}>{d.status}</span>
                      {(d.status === 'OPEN' || d.status === 'IN_REVIEW') && (
                        <>
                          <button onClick={() => handleUpdateDispute(d.id, 'RESOLVED')} className="text-green-600 hover:underline">resolve</button>
                          <button onClick={() => handleUpdateDispute(d.id, 'REJECTED')} className="text-red-500 hover:underline">reject</button>
                        </>
                      )}
                    </span>
                  </div>
                ))}
                <form onSubmit={handleRaiseDispute} className="grid grid-cols-2 gap-1 mt-1">
                  <input required placeholder="invoiceId" value={disputeForm.invoiceId} onChange={(e) => setDisputeForm({ ...disputeForm, invoiceId: e.target.value })} className="border rounded px-2 py-1 text-xs font-mono" />
                  <input type="number" placeholder="amount" value={disputeForm.disputedAmount || ''} onChange={(e) => setDisputeForm({ ...disputeForm, disputedAmount: Number(e.target.value) })} className="border rounded px-2 py-1 text-xs" />
                  <select value={disputeForm.reason} onChange={(e) => setDisputeForm({ ...disputeForm, reason: e.target.value })} className="border rounded px-2 py-1 text-xs">{DISPUTE_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
                  <input required placeholder="description" value={disputeForm.description} onChange={(e) => setDisputeForm({ ...disputeForm, description: e.target.value })} className="border rounded px-2 py-1 text-xs" />
                  <button type="submit" className="col-span-2 bg-orange-600 text-white px-2 py-1 rounded text-xs">Raise Dispute (suspends dunning)</button>
                </form>
              </div>

              {/* Notes */}
              <div>
                <h3 className="text-sm font-medium text-gray-600 mb-1">Contact History</h3>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {(detail.notes ?? []).map((n: any) => (
                    <div key={n.id} className="text-xs border-b py-1">
                      <span className="font-medium">{n.contactMethod}</span> · <span className="text-gray-400">{new Date(n.createdAt).toLocaleString()}</span>
                      <div>{n.note}</div>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleAddNote} className="flex gap-1 mt-1">
                  <select value={noteForm.contactMethod} onChange={(e) => setNoteForm({ ...noteForm, contactMethod: e.target.value })} className="border rounded px-2 py-1 text-xs">{CONTACT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
                  <input required placeholder="note" value={noteForm.note} onChange={(e) => setNoteForm({ ...noteForm, note: e.target.value })} className="border rounded px-2 py-1 text-xs flex-1" />
                  <button type="submit" className="bg-gray-600 text-white px-2 py-1 rounded text-xs">Log</button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
