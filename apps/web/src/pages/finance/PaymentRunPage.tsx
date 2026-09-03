import { useState, useEffect } from 'react';
import { Banknote, Plus, X, Download, Check } from 'lucide-react';
import { paymentRunApi } from '../../api/paymentRun';
import { financeApi } from '../../api/finance';
import { apiClient } from '../../api/client';

const STATUS_COLORS: Record<string, string> = {
  PROPOSED: 'bg-blue-100 text-blue-800',
  APPROVED: 'bg-amber-100 text-amber-800',
  POSTED: 'bg-green-100 text-green-800',
};

export default function PaymentRunPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);
  const [detail, setDetail] = useState<any | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ dueByDate: '', paymentMethod: 'NEFT', bankAccountId: '' });
  const [msg, setMsg] = useState<string | null>(null);

  const unwrap = (res: any) => { const d = res.data?.data ?? res.data ?? {}; return d.items ?? d ?? []; };

  const loadRuns = () => paymentRunApi.list().then(r => setRuns(unwrap(r))).catch(() => {});

  useEffect(() => {
    financeApi.getBankAccounts({ limit: 200 }).then(r => setBankAccounts(unwrap(r))).catch(() => {});
    loadRuns();
  }, []);

  const openDetail = (id: string) => {
    paymentRunApi.get(id).then(r => setDetail(r.data?.data ?? r.data)).catch(() => {});
  };

  const createRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const payload: any = { ...form };
      if (!payload.bankAccountId) delete payload.bankAccountId;
      const res = await paymentRunApi.create(payload);
      const run = res.data?.data ?? res.data;
      setShowNew(false);
      loadRuns();
      if (run?.id) openDetail(run.id);
    } catch (err: any) {
      setMsg(err?.response?.data?.message ?? 'Failed to create payment run');
    }
  };

  const toggleItem = async (itemId: string, included: boolean) => {
    await paymentRunApi.toggleItem(itemId, included);
    if (detail) openDetail(detail.id ?? detail.run?.id);
  };

  const approve = async () => { if (!detail) return; await paymentRunApi.approve(detail.id ?? detail.run?.id); openDetail(detail.id ?? detail.run?.id); loadRuns(); };
  const post = async () => { if (!detail) return; await paymentRunApi.post(detail.id ?? detail.run?.id); openDetail(detail.id ?? detail.run?.id); loadRuns(); };

  const downloadBankFile = async () => {
    if (!detail) return;
    const id = detail.id ?? detail.run?.id;
    const res = await apiClient.get(paymentRunApi.bankFileUrl(id), { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url; a.download = `payment-run-${id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const run = detail ? (detail.run ?? detail) : null;
  const items = detail ? (detail.items ?? []) : [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Payment Run</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">Propose, approve &amp; post vendor payments in bulk</p>
        </div>
        <button onClick={() => { setForm({ dueByDate: '', paymentMethod: 'NEFT', bankAccountId: '' }); setShowNew(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus className="h-4 w-4" /> New Payment Run
        </button>
      </div>

      {msg && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{msg}</div>}

      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b text-xs font-semibold text-gray-600 uppercase">Runs</div>
          <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
            {runs.length === 0 ? (
              <div className="p-4 text-sm text-gray-400">No payment runs</div>
            ) : runs.map(r => (
              <button key={r.id} onClick={() => openDetail(r.id)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 ${run?.id === r.id ? 'bg-blue-50' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">{r.runDate}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] ?? 'bg-gray-100'}`}>{r.status}</span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{r.vendorCount ?? 0} vendors · {Number(r.totalAmount ?? 0).toLocaleString()}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="col-span-2 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600 uppercase">Proposal Items</span>
            {run && (
              <div className="flex gap-2">
                {run.status === 'PROPOSED' && <button onClick={approve} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600">Approve</button>}
                {run.status === 'APPROVED' && <button onClick={post} className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700"><Check className="h-3.5 w-3.5" /> Post</button>}
                {run.status === 'POSTED' && <button onClick={downloadBankFile} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700"><Download className="h-3.5 w-3.5" /> Bank File</button>}
              </div>
            )}
          </div>
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="text-center px-4 py-2 font-medium text-gray-600 w-10">Pay</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Vendor</th>
                  <th className="text-left px-4 py-2 font-medium text-gray-600">Bill</th>
                  <th className="text-right px-4 py-2 font-medium text-gray-600">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-gray-400">Select or create a payment run</td></tr>
                ) : items.map((it: any) => (
                  <tr key={it.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-center">
                      <input type="checkbox" checked={it.included !== false} disabled={run?.status !== 'PROPOSED'}
                        onChange={e => toggleItem(it.id, e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                    </td>
                    <td className="px-4 py-2 text-gray-800">{it.vendorName}</td>
                    <td className="px-4 py-2 text-gray-500">{it.billNumber}</td>
                    <td className="px-4 py-2 text-right font-medium text-gray-700">{Number(it.amount).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">New Payment Run</h2>
              <button onClick={() => setShowNew(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={createRun} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pay bills due on or before *</label>
                <input required type="date" value={form.dueByDate} onChange={e => setForm(f => ({ ...f, dueByDate: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {['NEFT', 'RTGS', 'ACH', 'CHECK'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bank Account</label>
                <select value={form.bankAccountId} onChange={e => setForm(f => ({ ...f, bankAccountId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name ?? b.accountName ?? b.accountNumber}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowNew(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">Create Proposal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
