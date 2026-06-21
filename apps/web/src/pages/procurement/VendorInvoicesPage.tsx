import { useState, useEffect } from 'react';
import { procurementApi } from '../../api/procurement';
import { financeApi } from '../../api/finance';
import { Plus, CheckCircle2, XCircle, AlertTriangle, ScanLine, CreditCard } from 'lucide-react';
import CurrencySelect from '../../components/ui/CurrencySelect';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  UNDER_REVIEW: 'bg-indigo-100 text-indigo-700',
  MATCHED: 'bg-teal-100 text-teal-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700',
  PAID: 'bg-emerald-100 text-emerald-700',
};

const MATCH_COLORS: Record<string, string> = {
  NOT_MATCHED: 'bg-gray-100 text-gray-600',
  MATCHED: 'bg-green-100 text-green-700',
  DISCREPANCY: 'bg-red-100 text-red-700',
};

function NewInvoiceDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [vendors, setVendors] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [form, setForm] = useState({
    vendorId: '',
    vendorName: '',
    vendorInvoiceRef: '',
    poId: '',
    grnId: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    currency: 'INR',
    notes: '',
    lines: [{ description: '', itemCode: '', quantity: 1, unitPrice: 0, uom: 'EA', taxRate: 0 }],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    financeApi.getVendors({ limit: 100 }).then((r) => setVendors(r.data.items || [])).catch(() => {});
    procurementApi.getPurchaseOrders({ limit: 100 }).then((r) => setPos(r.data.items || [])).catch(() => {});
  }, []);

  const addLine = () =>
    setForm((f) => ({ ...f, lines: [...f.lines, { description: '', itemCode: '', quantity: 1, unitPrice: 0, uom: 'EA', taxRate: 0 }] }));
  const removeLine = (i: number) => setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  const updateLine = (i: number, field: string, value: any) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)) }));

  const handleVendorChange = (id: string) => {
    const v = vendors.find((v) => v.id === id);
    setForm((f) => ({ ...f, vendorId: id, vendorName: v?.name || '' }));
  };

  const handlePoChange = (id: string) => {
    const po = pos.find((p) => p.id === id);
    if (po) {
      setForm((f) => ({
        ...f,
        poId: id,
        vendorId: po.vendorId || f.vendorId,
        vendorName: po.vendorName || f.vendorName,
      }));
    } else {
      setForm((f) => ({ ...f, poId: '' }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await procurementApi.createVendorInvoice({
        vendorInvoiceRef: form.vendorInvoiceRef || undefined,
        vendorId: form.vendorId,
        vendorName: form.vendorName,
        poId: form.poId || undefined,
        grnId: form.grnId || undefined,
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate || undefined,
        currency: form.currency,
        notes: form.notes || undefined,
        lines: form.lines.map((l) => ({
          description: l.description,
          itemCode: l.itemCode || undefined,
          uom: l.uom,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          taxRate: Number(l.taxRate),
        })),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create invoice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b"><h2 className="text-lg font-semibold">New Vendor Invoice</h2></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor *</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.vendorId} onChange={(e) => handleVendorChange(e.target.value)} required>
                <option value="">Select vendor...</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.code})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Against PO</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.poId} onChange={(e) => handlePoChange(e.target.value)}>
                <option value="">— None —</option>
                {pos.map((p) => <option key={p.id} value={p.id}>{p.poNumber} — {p.vendorName}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Invoice Ref</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.vendorInvoiceRef} onChange={(e) => setForm((f) => ({ ...f, vendorInvoiceRef: e.target.value }))} placeholder="Vendor's own invoice #" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <CurrencySelect className="w-full border rounded-lg px-3 py-2 text-sm" value={form.currency} onChange={(code) => setForm((f) => ({ ...f, currency: code }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Date *</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.invoiceDate} onChange={(e) => setForm((f) => ({ ...f, invoiceDate: e.target.value }))} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Lines *</label>
              <button type="button" onClick={addLine} className="text-sm text-blue-600 hover:underline">+ Add Line</button>
            </div>
            {form.lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center mb-2">
                <input className="col-span-4 border rounded-lg px-2 py-1.5 text-sm" placeholder="Description *" value={line.description} onChange={(e) => updateLine(i, 'description', e.target.value)} required />
                <input className="col-span-2 border rounded-lg px-2 py-1.5 text-sm" placeholder="UOM" value={line.uom} onChange={(e) => updateLine(i, 'uom', e.target.value)} />
                <input type="number" className="col-span-2 border rounded-lg px-2 py-1.5 text-sm" placeholder="Qty *" value={line.quantity} min={0} onChange={(e) => updateLine(i, 'quantity', e.target.value)} required />
                <input type="number" className="col-span-2 border rounded-lg px-2 py-1.5 text-sm" placeholder="Price *" value={line.unitPrice} min={0} onChange={(e) => updateLine(i, 'unitPrice', e.target.value)} required />
                <input type="number" className="col-span-1 border rounded-lg px-2 py-1.5 text-sm" placeholder="Tax%" value={line.taxRate} min={0} onChange={(e) => updateLine(i, 'taxRate', e.target.value)} />
                <button type="button" onClick={() => removeLine(i)} className="col-span-1 text-red-500 text-sm" disabled={form.lines.length === 1}>✕</button>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{loading ? 'Creating...' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function InvoiceDetail({ invoice, onClose, onChanged }: { invoice: any; onClose: () => void; onChanged: () => void }) {
  const [detail, setDetail] = useState<any>(invoice);
  const [busy, setBusy] = useState(false);
  const [payAmount, setPayAmount] = useState('');

  const reload = async () => {
    try {
      const res = await procurementApi.getVendorInvoice(invoice.id);
      setDetail(res.data);
      onChanged();
    } catch {}
  };

  const act = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      await reload();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = () => {
    const reason = prompt('Reason for rejection:');
    if (reason) act(() => procurementApi.rejectVendorInvoice(invoice.id, { reason }));
  };

  const handlePay = () => {
    const amt = Number(payAmount);
    if (!amt || amt <= 0) return;
    act(async () => {
      await procurementApi.recordInvoicePayment(invoice.id, { amount: amt });
      setPayAmount('');
    });
  };

  const outstanding = (Number(detail.total) || 0) - (Number(detail.paidAmount) || 0);
  const md = detail.matchDetails;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{detail.invoiceNumber} — {detail.vendorName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[detail.status] || ''}`}>{detail.status}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${MATCH_COLORS[detail.matchStatus] || ''}`}>3-Way: {detail.matchStatus}</span>
              {detail.source === 'VENDOR_PORTAL' && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">Vendor Portal</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div><div className="text-gray-500">Invoice Date</div><div className="font-medium">{detail.invoiceDate}</div></div>
            <div><div className="text-gray-500">Due Date</div><div className="font-medium">{detail.dueDate || '—'}</div></div>
            <div><div className="text-gray-500">Vendor Ref</div><div className="font-medium">{detail.vendorInvoiceRef || '—'}</div></div>
            <div><div className="text-gray-500">Total</div><div className="font-semibold">{Number(detail.total).toLocaleString()} {detail.currency}</div></div>
          </div>

          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit Price</th>
                <th className="px-3 py-2 text-right">Tax</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {detail.lines?.map((l: any) => (
                <tr key={l.id} className="border-t">
                  <td className="px-3 py-2">{l.lineNumber}</td>
                  <td className="px-3 py-2">{l.description}</td>
                  <td className="px-3 py-2 text-right">{l.quantity} {l.uom}</td>
                  <td className="px-3 py-2 text-right">{Number(l.unitPrice).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{Number(l.taxAmount).toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{Number(l.lineTotal).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {md && (
            <div className={`rounded-lg p-4 text-sm ${detail.matchStatus === 'DISCREPANCY' ? 'bg-red-50' : 'bg-green-50'}`}>
              <div className="font-medium mb-2 flex items-center gap-2">
                {detail.matchStatus === 'DISCREPANCY' ? <AlertTriangle className="h-4 w-4 text-red-600" /> : <CheckCircle2 className="h-4 w-4 text-green-600" />}
                3-Way Match Result
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><div className="text-gray-500">PO Total</div><div className="font-medium">{Number(md.poTotal).toLocaleString()}</div></div>
                <div><div className="text-gray-500">GRN Value</div><div className="font-medium">{Number(md.grnTotal).toLocaleString()}</div></div>
                <div><div className="text-gray-500">Invoice Total</div><div className="font-medium">{Number(md.invoiceTotal).toLocaleString()}</div></div>
              </div>
              {md.lineDiscrepancies?.length > 0 && (
                <div className="mt-2 text-red-700">
                  {md.lineDiscrepancies.length} line(s) with discrepancies (variance shown vs PO).
                </div>
              )}
            </div>
          )}

          {detail.rejectionReason && (
            <div className="bg-red-50 text-red-700 text-sm p-3 rounded-lg">Rejected: {detail.rejectionReason}</div>
          )}

          <div className="border-t pt-4 flex items-center justify-between text-sm">
            <div>Paid: <span className="font-medium">{Number(detail.paidAmount).toLocaleString()}</span> · Outstanding: <span className="font-medium">{outstanding.toLocaleString()}</span></div>
          </div>

          {/* Workflow actions */}
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {detail.status === 'DRAFT' && <button disabled={busy} onClick={() => act(() => procurementApi.submitVendorInvoice(invoice.id))} className="text-sm px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">Submit</button>}
            {detail.status === 'SUBMITTED' && <button disabled={busy} onClick={() => act(() => procurementApi.reviewVendorInvoice(invoice.id))} className="text-sm px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100">Start Review</button>}
            {['UNDER_REVIEW', 'MATCHED'].includes(detail.status) && <button disabled={busy} onClick={() => act(() => procurementApi.matchVendorInvoice(invoice.id))} className="text-sm px-3 py-1.5 bg-teal-50 text-teal-700 rounded-lg hover:bg-teal-100 flex items-center gap-1"><ScanLine className="h-3.5 w-3.5" /> Run 3-Way Match</button>}
            {detail.status === 'MATCHED' && <button disabled={busy} onClick={() => act(() => procurementApi.approveVendorInvoice(invoice.id))} className="text-sm px-3 py-1.5 bg-green-50 text-green-700 rounded-lg hover:bg-green-100 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Approve</button>}
            {!['PAID', 'REJECTED'].includes(detail.status) && <button disabled={busy} onClick={handleReject} className="text-sm px-3 py-1.5 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> Reject</button>}
          </div>

          {['APPROVED', 'PARTIALLY_PAID'].includes(detail.status) && (
            <div className="flex items-end gap-2 border-t pt-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Payment Amount</label>
                <input type="number" className="border rounded-lg px-3 py-1.5 text-sm w-40" value={payAmount} min={0} max={outstanding} onChange={(e) => setPayAmount(e.target.value)} placeholder={`Max ${outstanding}`} />
              </div>
              <button disabled={busy} onClick={handlePay} className="text-sm px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-1"><CreditCard className="h-3.5 w-3.5" /> Record Payment</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VendorInvoicesPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await procurementApi.getVendorInvoices(statusFilter ? { status: statusFilter, limit: 100 } : { limit: 100 });
      setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); /* eslint-disable-next-line */ }, [statusFilter]);

  const items = data?.items || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vendor Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} invoices · book, 3-way match &amp; pay</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus className="h-4 w-4" /> Book Invoice
        </button>
      </div>

      <div className="flex gap-2">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border rounded-lg px-3 py-1.5 text-sm">
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No vendor invoices found</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Invoice #</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Vendor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">3-Way</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((inv: any) => (
                <tr key={inv.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(inv)}>
                  <td className="px-4 py-3 font-mono text-xs text-blue-600">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{inv.vendorName}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[inv.status] || ''}`}>{inv.status}</span></td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${MATCH_COLORS[inv.matchStatus] || ''}`}>{inv.matchStatus}</span></td>
                  <td className="px-4 py-3 text-gray-500">{inv.invoiceDate}</td>
                  <td className="px-4 py-3 text-right font-medium">{Number(inv.total).toLocaleString()} {inv.currency}</td>
                  <td className="px-4 py-3 text-right">{Math.max(0, (Number(inv.total) || 0) - (Number(inv.paidAmount) || 0)).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <InvoiceDetail invoice={selected} onClose={() => setSelected(null)} onChanged={loadData} />}
      {showNew && <NewInvoiceDialog onClose={() => setShowNew(false)} onSaved={loadData} />}
    </div>
  );
}
