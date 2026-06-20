import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { vendorPortalApi } from '../../api/procurement';
import { FileText, ShoppingCart, Receipt, Wallet, LogOut, Send } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ISSUED: 'bg-blue-100 text-blue-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  UNDER_REVIEW: 'bg-indigo-100 text-indigo-700',
  MATCHED: 'bg-teal-100 text-teal-700',
  APPROVED: 'bg-green-100 text-green-700',
  RELEASED: 'bg-green-100 text-green-700',
  SENT: 'bg-blue-100 text-blue-700',
  REJECTED: 'bg-red-100 text-red-700',
  PARTIALLY_PAID: 'bg-amber-100 text-amber-700',
  PAID: 'bg-emerald-100 text-emerald-700',
  CLOSED: 'bg-purple-100 text-purple-700',
};

const TABS = [
  { key: 'rfqs', label: 'RFQs', icon: <FileText className="h-4 w-4" /> },
  { key: 'pos', label: 'Purchase Orders', icon: <ShoppingCart className="h-4 w-4" /> },
  { key: 'invoices', label: 'Invoices', icon: <Receipt className="h-4 w-4" /> },
  { key: 'payments', label: 'Payments', icon: <Wallet className="h-4 w-4" /> },
];

function Badge({ value }: { value: string }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[value] || 'bg-gray-100 text-gray-600'}`}>{value}</span>;
}

function RfqQuoteDialog({ rfq, onClose, onSaved }: { rfq: any; onClose: () => void; onSaved: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    vendorPortalApi.getRfqDetail(rfq.id).then((r) => {
      const d = r.data?.data ?? r.data;
      setDetail(d);
      const existing = d.quotes || [];
      setLines((d.lines || []).map((l: any) => {
        const q = existing.find((qq: any) => qq.lineId === l.id);
        return { lineId: l.id, description: l.description, quantity: l.quantity, uom: l.uom, unitPrice: q?.unitPrice ?? 0, leadTimeDays: q?.leadTimeDays ?? '', notes: q?.notes ?? '' };
      }));
    }).catch(() => {}).finally(() => setLoading(false));
  }, [rfq.id]);

  const update = (i: number, field: string, value: any) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      await vendorPortalApi.submitQuote(rfq.id, {
        lines: lines.map((l) => ({
          lineId: l.lineId,
          unitPrice: Number(l.unitPrice),
          leadTimeDays: l.leadTimeDays === '' ? undefined : Number(l.leadTimeDays),
          notes: l.notes || undefined,
        })),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to submit quote');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">{detail?.rfqNumber || rfq.rfqNumber} — Submit Quote</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          {loading ? <div className="text-center py-8 text-gray-500">Loading...</div> : (
            <>
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Item</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Unit Price *</th>
                    <th className="px-3 py-2 text-right">Lead (days)</th>
                    <th className="px-3 py-2 text-left">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={l.lineId} className="border-t">
                      <td className="px-3 py-2">{l.description}</td>
                      <td className="px-3 py-2 text-right">{l.quantity} {l.uom}</td>
                      <td className="px-3 py-2"><input type="number" min={0} className="w-24 border rounded px-2 py-1 text-sm text-right" value={l.unitPrice} onChange={(e) => update(i, 'unitPrice', e.target.value)} /></td>
                      <td className="px-3 py-2"><input type="number" min={0} className="w-20 border rounded px-2 py-1 text-sm text-right" value={l.leadTimeDays} onChange={(e) => update(i, 'leadTimeDays', e.target.value)} /></td>
                      <td className="px-3 py-2"><input className="w-full border rounded px-2 py-1 text-sm" value={l.notes} onChange={(e) => update(i, 'notes', e.target.value)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end gap-3">
                <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={handleSubmit} disabled={saving || lines.length === 0} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"><Send className="h-3.5 w-3.5" /> {saving ? 'Submitting...' : 'Submit Quote'}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function SubmitInvoiceDialog({ pos, onClose, onSaved }: { pos: any[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    poId: '',
    vendorInvoiceRef: '',
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: '',
    currency: 'INR',
    notes: '',
    lines: [{ description: '', itemCode: '', quantity: 1, unitPrice: 0, uom: 'EA', taxRate: 0 }],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addLine = () => setForm((f) => ({ ...f, lines: [...f.lines, { description: '', itemCode: '', quantity: 1, unitPrice: 0, uom: 'EA', taxRate: 0 }] }));
  const removeLine = (i: number) => setForm((f) => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  const updateLine = (i: number, field: string, value: any) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)) }));

  const handlePo = (id: string) => {
    const po = pos.find((p) => p.id === id);
    if (po && po.lines?.length) {
      setForm((f) => ({
        ...f,
        poId: id,
        lines: po.lines.map((l: any) => ({ description: l.description, itemCode: l.itemCode || '', quantity: l.quantity, unitPrice: l.unitPrice, uom: l.uom || 'EA', taxRate: l.taxRate || 0 })),
      }));
    } else {
      setForm((f) => ({ ...f, poId: id }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await vendorPortalApi.submitInvoice({
        poId: form.poId || undefined,
        vendorInvoiceRef: form.vendorInvoiceRef || undefined,
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
      setError(e.response?.data?.message || 'Failed to submit invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b"><h2 className="text-lg font-semibold">Submit Invoice</h2></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Against PO</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.poId} onChange={(e) => handlePo(e.target.value)}>
                <option value="">— None —</option>
                {pos.map((p) => <option key={p.id} value={p.id}>{p.poNumber} ({Number(p.total).toLocaleString()} {p.currency})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your Invoice Ref</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.vendorInvoiceRef} onChange={(e) => setForm((f) => ({ ...f, vendorInvoiceRef: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
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
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? 'Submitting...' : 'Submit'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function VendorPortalPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('rfqs');
  const [rfqs, setRfqs] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [quoteRfq, setQuoteRfq] = useState<any>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const vendorName = sessionStorage.getItem('vendor_name') || 'Vendor';

  useEffect(() => {
    if (!sessionStorage.getItem('vendor_token')) navigate('/vendor/login');
  }, [navigate]);

  const unwrap = (r: any) => r.data?.data ?? r.data;

  const loadTab = async () => {
    setLoading(true);
    try {
      if (tab === 'rfqs') setRfqs(unwrap(await vendorPortalApi.getMyRfqs()) || []);
      else if (tab === 'pos') setPos(unwrap(await vendorPortalApi.getMyPurchaseOrders()) || []);
      else if (tab === 'invoices') {
        const res = unwrap(await vendorPortalApi.getMyInvoices());
        setInvoices(res.items || res || []);
      } else if (tab === 'payments') setPayments(unwrap(await vendorPortalApi.getMyPayments()));
    } catch (e: any) {
      if (e.response?.status === 401) { logout(); }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTab(); /* eslint-disable-next-line */ }, [tab]);

  const logout = () => {
    sessionStorage.removeItem('vendor_token');
    sessionStorage.removeItem('vendor_tenant');
    sessionStorage.removeItem('vendor_name');
    navigate('/vendor/login');
  };

  const openInvoiceDialog = async () => {
    if (pos.length === 0) {
      try { setPos(unwrap(await vendorPortalApi.getMyPurchaseOrders()) || []); } catch {}
    }
    setShowInvoice(true);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Vendor Portal</h1>
            <p className="text-xs text-gray-500">{vendorName}</p>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"><LogOut className="h-4 w-4" /> Sign Out</button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="flex gap-2 mb-6 border-b">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {loading ? <div className="text-center py-12 text-gray-500">Loading...</div> : (
          <>
            {tab === 'rfqs' && (
              <div className="bg-white rounded-xl border overflow-hidden">
                {rfqs.length === 0 ? <div className="text-center py-12 text-gray-400">No RFQs assigned to you</div> : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b"><tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">RFQ #</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Title</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Due</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Action</th>
                    </tr></thead>
                    <tbody className="divide-y">
                      {rfqs.map((r) => (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{r.rfqNumber}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{r.title || '—'}</td>
                          <td className="px-4 py-3"><Badge value={r.status} /></td>
                          <td className="px-4 py-3 text-gray-500">{r.dueDate || r.responseDeadline || '—'}</td>
                          <td className="px-4 py-3 text-right"><button onClick={() => setQuoteRfq(r)} className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100">Submit Quote</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === 'pos' && (
              <div className="bg-white rounded-xl border overflow-hidden">
                {pos.length === 0 ? <div className="text-center py-12 text-gray-400">No purchase orders</div> : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b"><tr>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">PO #</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">PO Date</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Delivery</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                    </tr></thead>
                    <tbody className="divide-y">
                      {pos.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.poNumber}</td>
                          <td className="px-4 py-3"><Badge value={p.status} /></td>
                          <td className="px-4 py-3 text-gray-500">{p.poDate}</td>
                          <td className="px-4 py-3 text-gray-500">{p.deliveryDate || '—'}</td>
                          <td className="px-4 py-3 text-right font-medium">{Number(p.total).toLocaleString()} {p.currency}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === 'invoices' && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <button onClick={openInvoiceDialog} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"><Send className="h-4 w-4" /> Submit Invoice</button>
                </div>
                <div className="bg-white rounded-xl border overflow-hidden">
                  {invoices.length === 0 ? <div className="text-center py-12 text-gray-400">No invoices submitted yet</div> : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b"><tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Invoice #</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Your Ref</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Date</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Paid</th>
                      </tr></thead>
                      <tbody className="divide-y">
                        {invoices.map((inv) => (
                          <tr key={inv.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs text-gray-600">{inv.invoiceNumber}</td>
                            <td className="px-4 py-3 text-gray-700">{inv.vendorInvoiceRef || '—'}</td>
                            <td className="px-4 py-3"><Badge value={inv.status} /></td>
                            <td className="px-4 py-3 text-gray-500">{inv.invoiceDate}</td>
                            <td className="px-4 py-3 text-right font-medium">{Number(inv.total).toLocaleString()} {inv.currency}</td>
                            <td className="px-4 py-3 text-right">{Number(inv.paidAmount).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {tab === 'payments' && payments && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl border p-4"><div className="text-sm text-gray-500">Total Paid</div><div className="text-2xl font-bold text-emerald-600">{Number(payments.summary?.totalPaid || 0).toLocaleString()}</div></div>
                  <div className="bg-white rounded-xl border p-4"><div className="text-sm text-gray-500">Outstanding</div><div className="text-2xl font-bold text-amber-600">{Number(payments.summary?.totalOutstanding || 0).toLocaleString()}</div></div>
                  <div className="bg-white rounded-xl border p-4"><div className="text-sm text-gray-500">Invoices</div><div className="text-2xl font-bold text-gray-900">{payments.summary?.invoiceCount || 0}</div></div>
                </div>
                <div className="bg-white rounded-xl border overflow-hidden">
                  {(payments.invoices || []).length === 0 ? <div className="text-center py-12 text-gray-400">No payment activity</div> : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b"><tr>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Invoice #</th>
                        <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Paid</th>
                        <th className="px-4 py-3 text-right font-medium text-gray-600">Outstanding</th>
                      </tr></thead>
                      <tbody className="divide-y">
                        {payments.invoices.map((inv: any) => (
                          <tr key={inv.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs text-gray-600">{inv.invoiceNumber}</td>
                            <td className="px-4 py-3"><Badge value={inv.status} /></td>
                            <td className="px-4 py-3 text-right font-medium">{Number(inv.total).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-emerald-600">{Number(inv.paidAmount).toLocaleString()}</td>
                            <td className="px-4 py-3 text-right text-amber-600">{Math.max(0, Number(inv.total) - Number(inv.paidAmount)).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {quoteRfq && <RfqQuoteDialog rfq={quoteRfq} onClose={() => setQuoteRfq(null)} onSaved={loadTab} />}
      {showInvoice && <SubmitInvoiceDialog pos={pos} onClose={() => setShowInvoice(false)} onSaved={loadTab} />}
    </div>
  );
}
