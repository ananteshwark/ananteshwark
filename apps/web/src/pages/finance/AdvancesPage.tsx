import { useState, useEffect } from 'react';
import { Wallet, Plus, CreditCard, CheckCircle2 } from 'lucide-react';
import { advancesApi } from '../../api/advances';
import { financeApi } from '../../api/finance';

const unwrap = (res: any) => {
  const d = res.data?.data ?? res.data;
  return Array.isArray(d) ? d : d?.items ?? [];
};
const num = (v: any) => Number(v) || 0;

const STATUS_STYLES: Record<string, string> = {
  REQUESTED: 'bg-gray-100 text-gray-700',
  PAID: 'bg-blue-100 text-blue-700',
  RECEIVED: 'bg-blue-100 text-blue-700',
  PARTIALLY_CLEARED: 'bg-amber-100 text-amber-700',
  CLEARED: 'bg-green-100 text-green-700',
};

export default function AdvancesPage() {
  const [tab, setTab] = useState<'vendor' | 'customer'>('vendor');
  const [vendorAdv, setVendorAdv] = useState<any[]>([]);
  const [customerAdv, setCustomerAdv] = useState<any[]>([]);
  const [aging, setAging] = useState<any>(null);
  const [vendors, setVendors] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ partyId: '', date: today, amount: '', reference: '' });

  const load = () => {
    advancesApi.listVendor().then(res => setVendorAdv(unwrap(res))).catch(() => setVendorAdv([]));
    advancesApi.listCustomer().then(res => setCustomerAdv(unwrap(res))).catch(() => setCustomerAdv([]));
    advancesApi.aging().then(res => setAging(res.data?.data ?? res.data)).catch(() => setAging(null));
  };

  useEffect(() => {
    load();
    financeApi.getVendors({ limit: 500 }).then(res => setVendors(unwrap(res))).catch(() => {});
    financeApi.getCustomers({ limit: 500 }).then(res => setCustomers(unwrap(res))).catch(() => {});
    financeApi.getBills({ limit: 500 }).then(res => setBills(unwrap(res))).catch(() => {});
    financeApi.getInvoices({ limit: 500 }).then(res => setInvoices(unwrap(res))).catch(() => {});
  }, []);

  const create = async () => {
    if (!form.partyId || !form.amount) { setMsg('Party and amount required'); return; }
    setMsg(null);
    try {
      if (tab === 'vendor') {
        await advancesApi.createVendor({ vendorId: form.partyId, requestDate: form.date, amount: Number(form.amount), reference: form.reference || undefined });
      } else {
        await advancesApi.createCustomer({ customerId: form.partyId, receiptDate: form.date, amount: Number(form.amount), reference: form.reference || undefined });
      }
      setForm({ partyId: '', date: today, amount: '', reference: '' });
      setShowCreate(false);
      load();
    } catch {
      setMsg('Failed to create advance');
    }
  };

  const pay = async (id: string) => {
    try { await advancesApi.payVendor(id, {}); load(); } catch { setMsg('Failed to record payment'); }
  };

  const clearVendor = async (adv: any) => {
    const remaining = num(adv.paidAmount) - num(adv.clearedAmount);
    const billId = prompt('Bill ID to clear against:');
    if (!billId) return;
    const amtStr = prompt(`Amount to clear (max ${remaining}):`, String(remaining));
    if (!amtStr) return;
    try { await advancesApi.clearVendor(adv.id, { billId, amount: Number(amtStr) }); load(); }
    catch { setMsg('Failed to clear advance'); }
  };

  const clearCustomer = async (adv: any) => {
    const remaining = num(adv.amount) - num(adv.clearedAmount);
    const invoiceId = prompt('Invoice ID to clear against:');
    if (!invoiceId) return;
    const amtStr = prompt(`Amount to clear (max ${remaining}):`, String(remaining));
    if (!amtStr) return;
    try { await advancesApi.clearCustomer(adv.id, { invoiceId, amount: Number(amtStr) }); load(); }
    catch { setMsg('Failed to clear advance'); }
  };

  const vendorName = (id: string) => vendors.find(v => v.id === id)?.name ?? id;
  const customerName = (id: string) => customers.find(c => c.id === id)?.name ?? id;

  const partyOptions = tab === 'vendor' ? vendors : customers;

  const Chip = ({ status }: { status: string }) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Advances</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">Vendor down-payments and customer advance receipts</p>
        </div>
        <button onClick={() => setShowCreate(s => !s)}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
          <Plus className="h-4 w-4" /> New {tab === 'vendor' ? 'Vendor' : 'Customer'} Advance
        </button>
      </div>

      {aging && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Uncleared Vendor Advances</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{num(aging.summary?.vendorUncleared).toLocaleString()}</div>
            <div className="text-xs text-gray-400 mt-1">{aging.vendor?.length ?? 0} open</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Uncleared Customer Advances</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{num(aging.summary?.customerUncleared).toLocaleString()}</div>
            <div className="text-xs text-gray-400 mt-1">{aging.customer?.length ?? 0} open</div>
          </div>
        </div>
      )}

      {msg && <div className="mb-4 p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">{msg}</div>}

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(['vendor', 'customer'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'vendor' ? 'Vendor Advances' : 'Customer Advances'}
          </button>
        ))}
      </div>

      {showCreate && (
        <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{tab === 'vendor' ? 'Vendor' : 'Customer'}</label>
            <select value={form.partyId} onChange={e => setForm({ ...form, partyId: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56">
              <option value="">Select...</option>
              {partyOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Amount</label>
            <input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Reference</label>
            <input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <button onClick={create}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
            <Plus className="h-4 w-4" /> Create
          </button>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">{tab === 'vendor' ? 'Vendor' : 'Customer'}</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Reference</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Amount</th>
              {tab === 'vendor' && <th className="text-right px-4 py-3 font-medium text-gray-600">Paid</th>}
              <th className="text-right px-4 py-3 font-medium text-gray-600">Cleared</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {tab === 'vendor' ? (
              vendorAdv.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">No vendor advances</td></tr>
              ) : vendorAdv.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{vendorName(a.vendorId)}</td>
                  <td className="px-4 py-3 text-gray-600">{a.requestDate}</td>
                  <td className="px-4 py-3 text-gray-600">{a.reference || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{num(a.amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{num(a.paidAmount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{num(a.clearedAmount).toLocaleString()}</td>
                  <td className="px-4 py-3"><Chip status={a.status} /></td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      {a.status === 'REQUESTED' && (
                        <button onClick={() => pay(a.id)} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs">
                          <CreditCard className="h-3.5 w-3.5" /> Pay
                        </button>
                      )}
                      {(a.status === 'PAID' || a.status === 'PARTIALLY_CLEARED') && (
                        <button onClick={() => clearVendor(a)} className="flex items-center gap-1 text-green-600 hover:text-green-800 text-xs">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Clear
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              customerAdv.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">No customer advances</td></tr>
              ) : customerAdv.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{customerName(a.customerId)}</td>
                  <td className="px-4 py-3 text-gray-600">{a.receiptDate}</td>
                  <td className="px-4 py-3 text-gray-600">{a.reference || '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{num(a.amount).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-700">{num(a.clearedAmount).toLocaleString()}</td>
                  <td className="px-4 py-3"><Chip status={a.status} /></td>
                  <td className="px-4 py-3 text-right">
                    {a.status !== 'CLEARED' && (
                      <button onClick={() => clearCustomer(a)} className="flex items-center gap-1 text-green-600 hover:text-green-800 text-xs ml-auto">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Clear
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
