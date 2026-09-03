import { useState, useEffect } from 'react';
import { Plus, X, Trash2, PackageCheck, FileText, Send, CheckCircle, RotateCcw } from 'lucide-react';
import { salesReturnsApi } from '../../api/salesReturns';

const unwrap = (res: any) => res.data?.data ?? res.data;
const REASONS = ['DEFECTIVE', 'WRONG_ITEM', 'NOT_NEEDED', 'OTHER'];
const fmt = (n: number) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });

function statusBadge(status: string) {
  const map: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    RECEIVED: 'bg-blue-100 text-blue-700',
    CREDITED: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-700',
    ISSUED: 'bg-blue-100 text-blue-700',
    APPLIED: 'bg-green-100 text-green-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

interface LineForm {
  itemId: string;
  itemDescription: string;
  quantity: string;
  unitPrice: string;
  warehouseId: string;
}

function NewReturnModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    customerId: '',
    customerName: '',
    salesOrderId: '',
    invoiceId: '',
    returnDate: new Date().toISOString().slice(0, 10),
    reason: 'DEFECTIVE',
  });
  const emptyLine: LineForm = { itemId: '', itemDescription: '', quantity: '1', unitPrice: '0', warehouseId: '' };
  const [lines, setLines] = useState<LineForm[]>([{ ...emptyLine }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLine = (i: number, key: keyof LineForm, val: string) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, [key]: val } : l)));
  const addLine = () => setLines((p) => [...p, { ...emptyLine }]);
  const removeLine = (i: number) => setLines((p) => p.filter((_, idx) => idx !== i));

  const total = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0);

  const save = async () => {
    setError(null);
    const validLines = lines
      .filter((l) => l.itemDescription.trim())
      .map((l) => ({
        itemId: l.itemId || null,
        itemDescription: l.itemDescription,
        quantity: parseFloat(l.quantity) || 0,
        unitPrice: parseFloat(l.unitPrice) || 0,
        warehouseId: l.warehouseId || null,
      }));
    if (validLines.length === 0) {
      setError('Add at least one line with a description');
      return;
    }
    setSaving(true);
    try {
      await salesReturnsApi.createReturn({
        customerId: form.customerId || null,
        customerName: form.customerName || null,
        salesOrderId: form.salesOrderId || null,
        invoiceId: form.invoiceId || null,
        returnDate: form.returnDate,
        reason: form.reason,
        lines: validLines,
      });
      onSaved();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to create return');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold">New Return Order</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Customer Name</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.customerName}
              onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))} placeholder="Customer name" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Customer ID (optional)</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.customerId}
              onChange={(e) => setForm((p) => ({ ...p, customerId: e.target.value }))} placeholder="UUID" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sales Order ID (optional)</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.salesOrderId}
              onChange={(e) => setForm((p) => ({ ...p, salesOrderId: e.target.value }))} placeholder="UUID" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Invoice ID (optional)</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.invoiceId}
              onChange={(e) => setForm((p) => ({ ...p, invoiceId: e.target.value }))} placeholder="UUID" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Return Date</label>
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.returnDate}
              onChange={(e) => setForm((p) => ({ ...p, returnDate: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Reason</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.reason}
              onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium">Lines</span>
          <button onClick={addLine} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700">
            <Plus className="h-4 w-4" /> Add Line
          </button>
        </div>
        <div className="border rounded-lg overflow-hidden mb-3">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Description', 'Item ID', 'Qty', 'Unit Price', 'Warehouse', 'Amount', ''].map((h) => (
                  <th key={h} className="text-left px-2 py-1.5 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l, i) => (
                <tr key={i}>
                  <td className="px-2 py-1">
                    <input className="w-full border rounded px-2 py-1 text-sm" value={l.itemDescription}
                      onChange={(e) => setLine(i, 'itemDescription', e.target.value)} placeholder="Item description" />
                  </td>
                  <td className="px-2 py-1">
                    <input className="w-28 border rounded px-2 py-1 text-sm" value={l.itemId}
                      onChange={(e) => setLine(i, 'itemId', e.target.value)} placeholder="UUID" />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" className="w-16 border rounded px-2 py-1 text-sm" value={l.quantity}
                      onChange={(e) => setLine(i, 'quantity', e.target.value)} />
                  </td>
                  <td className="px-2 py-1">
                    <input type="number" className="w-20 border rounded px-2 py-1 text-sm" value={l.unitPrice}
                      onChange={(e) => setLine(i, 'unitPrice', e.target.value)} />
                  </td>
                  <td className="px-2 py-1">
                    <input className="w-28 border rounded px-2 py-1 text-sm" value={l.warehouseId}
                      onChange={(e) => setLine(i, 'warehouseId', e.target.value)} placeholder="UUID" />
                  </td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">
                    {fmt((parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0))}
                  </td>
                  <td className="px-2 py-1">
                    <button onClick={() => removeLine(i)} className="text-gray-400 hover:text-red-600">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-right text-sm font-medium mb-3">Total: {fmt(total)}</div>

        {error && <div className="text-sm text-red-600 mb-3">{error}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Saving...' : 'Create Return'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApplyCreditModal({ cn, onClose, onApplied }: { cn: any; onClose: () => void; onApplied: () => void }) {
  const [invoiceId, setInvoiceId] = useState(cn.invoiceId || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apply = async () => {
    if (!invoiceId.trim()) { setError('Invoice ID is required'); return; }
    setSaving(true);
    setError(null);
    try {
      await salesReturnsApi.applyCreditNote(cn.id, invoiceId.trim());
      onApplied();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to apply');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-4">
          <h2 className="text-lg font-semibold">Apply {cn.creditNoteNumber}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3">
          <div className="text-sm text-gray-500">Amount: {fmt(cn.amount)}</div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Apply to Invoice ID</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)} placeholder="Invoice UUID" />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button onClick={apply} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Applying...' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReturnsPage() {
  const [tab, setTab] = useState<'returns' | 'credits'>('returns');
  const [returns, setReturns] = useState<any[]>([]);
  const [credits, setCredits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [applying, setApplying] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([salesReturnsApi.listReturns(), salesReturnsApi.listCreditNotes()])
      .then(([r, c]) => {
        setReturns(unwrap(r) || []);
        setCredits(unwrap(c) || []);
      })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const doAction = async (fn: () => Promise<any>, key: string) => {
    setBusy(key);
    try {
      await fn();
      load();
    } finally {
      setBusy(null);
    }
  };

  const createCreditFromReturn = (ro: any) =>
    doAction(() => salesReturnsApi.createCreditNote({ returnOrderId: ro.id }), `cn-${ro.id}`);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Returns &amp; Credit Notes</h1>
          <p className="text-sm text-gray-500 mt-0.5">Customer returns, goods receipt and credit memos</p>
        </div>
        {tab === 'returns' && (
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="h-4 w-4" /> New Return
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b">
        <button onClick={() => setTab('returns')}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === 'returns' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
          Return Orders
        </button>
        <button onClick={() => setTab('credits')}
          className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === 'credits' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
          Credit Notes
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-gray-400">Loading...</div>
      ) : tab === 'returns' ? (
        <div className="bg-white rounded-xl border">
          {returns.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No return orders yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Return #', 'Customer', 'Date', 'Reason', 'Total', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {returns.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono">{r.returnNumber}</td>
                    <td className="px-4 py-2">{r.customerName || '—'}</td>
                    <td className="px-4 py-2">{r.returnDate}</td>
                    <td className="px-4 py-2">{r.reason}</td>
                    <td className="px-4 py-2 text-right">{fmt(r.totalAmount)}</td>
                    <td className="px-4 py-2">{statusBadge(r.status)}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-3 justify-end">
                        {r.status === 'DRAFT' && (
                          <button onClick={() => doAction(() => salesReturnsApi.receiveReturn(r.id), `rcv-${r.id}`)}
                            disabled={busy === `rcv-${r.id}`}
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs" title="Receive returned goods">
                            <PackageCheck className="h-4 w-4" /> Receive
                          </button>
                        )}
                        {(r.status === 'DRAFT' || r.status === 'RECEIVED') && (
                          <button onClick={() => createCreditFromReturn(r)} disabled={busy === `cn-${r.id}`}
                            className="flex items-center gap-1 text-green-600 hover:text-green-700 text-xs" title="Create credit note">
                            <FileText className="h-4 w-4" /> Credit Note
                          </button>
                        )}
                        {(r.status === 'DRAFT' || r.status === 'RECEIVED') && (
                          <button onClick={() => doAction(() => salesReturnsApi.cancelReturn(r.id), `cn-cancel-${r.id}`)}
                            disabled={busy === `cn-cancel-${r.id}`}
                            className="flex items-center gap-1 text-gray-400 hover:text-red-600 text-xs" title="Cancel return">
                            <RotateCcw className="h-4 w-4" /> Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border">
          {credits.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No credit notes yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Credit Note #', 'Customer', 'Date', 'Amount', 'Status', 'Applied To', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {credits.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono">{c.creditNoteNumber}</td>
                    <td className="px-4 py-2">{c.customerName || '—'}</td>
                    <td className="px-4 py-2">{c.creditDate}</td>
                    <td className="px-4 py-2 text-right">{fmt(c.amount)}</td>
                    <td className="px-4 py-2">{statusBadge(c.status)}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">{c.appliedToInvoiceId ? c.appliedToInvoiceId.slice(0, 8) : '—'}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-3 justify-end">
                        {c.status === 'DRAFT' && (
                          <button onClick={() => doAction(() => salesReturnsApi.issueCreditNote(c.id), `issue-${c.id}`)}
                            disabled={busy === `issue-${c.id}`}
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-700 text-xs" title="Issue credit note">
                            <Send className="h-4 w-4" /> Issue
                          </button>
                        )}
                        {c.status !== 'APPLIED' && (
                          <button onClick={() => setApplying(c)}
                            className="flex items-center gap-1 text-green-600 hover:text-green-700 text-xs" title="Apply to invoice">
                            <CheckCircle className="h-4 w-4" /> Apply
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showNew && <NewReturnModal onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
      {applying && <ApplyCreditModal cn={applying} onClose={() => setApplying(null)} onApplied={() => { setApplying(null); load(); }} />}
    </div>
  );
}
