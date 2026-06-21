import { useState, useEffect } from 'react';
import { expensesApi } from '../../api/expenses';

type Tab = 'my-claims' | 'approvals' | 'categories';

export default function ExpensesPage() {
  const [activeTab, setActiveTab] = useState<Tab>('my-claims');
  const [claims, setClaims] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: '', claimDate: new Date().toISOString().slice(0, 10), currency: 'INR' });
  const [expenseLines, setExpenseLines] = useState([{ categoryId: '', description: '', amount: '', receiptUrl: '' }]);

  const fetchClaims = () => {
    setLoading(true);
    expensesApi.getClaims()
      .then((r: any) => {
        const data = r.data?.data?.items || r.data?.items || r.data || [];
        setClaims(Array.isArray(data) ? data : []);
      })
      .catch(() => setClaims([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchClaims();
    expensesApi.getCategories()
      .then((r: any) => {
        const data = r.data?.data?.items || r.data?.items || r.data || [];
        setCategories(Array.isArray(data) ? data : []);
      })
      .catch(() => setCategories([]));
  }, []);

  const statusColor = (s: string) => {
    if (s === 'APPROVED' || s === 'PAID') return 'bg-green-100 text-green-800';
    if (s === 'SUBMITTED') return 'bg-blue-100 text-blue-800';
    if (s === 'REJECTED') return 'bg-red-100 text-red-800';
    if (s === 'DRAFT') return 'bg-gray-100 text-gray-700';
    return 'bg-yellow-100 text-yellow-800';
  };

  const handleCreate = async () => {
    try {
      const validLines = expenseLines
        .filter(l => l.description && Number(l.amount) > 0)
        .map(l => ({
          categoryId: l.categoryId || undefined,
          description: l.description,
          amount: Number(l.amount),
          receiptUrl: l.receiptUrl || undefined,
        }));
      await expensesApi.createClaim({ ...form, lines: validLines });
      setShowNew(false);
      setExpenseLines([{ categoryId: '', description: '', amount: '', receiptUrl: '' }]);
      fetchClaims();
    } catch (e) { alert('Failed to create claim'); }
  };

  const handleSubmit = async (id: string) => {
    try { await expensesApi.submitClaim(id); fetchClaims(); } catch (e) { alert('Failed'); }
  };

  const handleApprove = async (id: string) => {
    try { await expensesApi.approveClaim(id); fetchClaims(); } catch (e) { alert('Failed'); }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Rejection reason:');
    if (!reason) return;
    try { await expensesApi.rejectClaim(id, { rejectionReason: reason }); fetchClaims(); } catch (e) { alert('Failed'); }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'my-claims', label: 'My Claims' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'categories', label: 'Categories' },
  ];

  const pendingApprovals = claims.filter((c: any) => c.status === 'SUBMITTED');

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Expenses</h1>
        {activeTab === 'my-claims' && (
          <button onClick={() => setShowNew(true)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            + New Claim
          </button>
        )}
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}{t.key === 'approvals' && pendingApprovals.length > 0 ? ` (${pendingApprovals.length})` : ''}
            </button>
          ))}
        </nav>
      </div>

      {loading && <p className="text-gray-500 text-sm">Loading…</p>}

      {!loading && (activeTab === 'my-claims' || activeTab === 'approvals') && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Claim #', 'Title', 'Date', 'Amount', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(activeTab === 'my-claims' ? claims : pendingApprovals).map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-700">{c.claimNumber || c.id?.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{c.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{c.claimDate}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{c.currency} {Number(c.totalAmount || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(c.status)}`}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {c.status === 'DRAFT' && (
                        <button onClick={() => handleSubmit(c.id)} className="text-xs text-blue-600 hover:text-blue-800">Submit</button>
                      )}
                      {activeTab === 'approvals' && c.status === 'SUBMITTED' && (
                        <>
                          <button onClick={() => handleApprove(c.id)} className="text-xs text-green-600 hover:text-green-800">Approve</button>
                          <button onClick={() => handleReject(c.id)} className="text-xs text-red-600 hover:text-red-800">Reject</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(activeTab === 'my-claims' ? claims : pendingApprovals).length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No claims found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && activeTab === 'categories' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Name', 'GL Account', 'Max Amount', 'Requires Receipt', 'Active'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {categories.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{c.glAccountCode || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{c.maxAmount ? Number(c.maxAmount).toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-sm">{c.requiresReceipt ? '✓' : '✗'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                </tr>
              ))}
              {categories.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No categories configured.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Expense Claim</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Claim title" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input type="date" value={form.claimDate} onChange={(e) => setForm({ ...form, claimDate: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">Expense Lines</label>
                  <button type="button" onClick={() => setExpenseLines(l => [...l, { categoryId: '', description: '', amount: '', receiptUrl: '' }])}
                    className="text-xs text-blue-600 hover:underline">+ Add Line</button>
                </div>
                <div className="space-y-2">
                  {expenseLines.map((line, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <select value={line.categoryId} onChange={e => setExpenseLines(ls => ls.map((l, idx) => idx === i ? { ...l, categoryId: e.target.value } : l))}
                        className="col-span-3 border rounded-lg px-2 py-1.5 text-sm">
                        <option value="">Category</option>
                        {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <input value={line.description} onChange={e => setExpenseLines(ls => ls.map((l, idx) => idx === i ? { ...l, description: e.target.value } : l))}
                        placeholder="Description *" className="col-span-4 border rounded-lg px-2 py-1.5 text-sm" />
                      <input type="number" min="0" step="0.01" value={line.amount} onChange={e => setExpenseLines(ls => ls.map((l, idx) => idx === i ? { ...l, amount: e.target.value } : l))}
                        placeholder="Amount *" className="col-span-3 border rounded-lg px-2 py-1.5 text-sm" />
                      <button type="button" onClick={() => setExpenseLines(ls => ls.filter((_, idx) => idx !== i))}
                        disabled={expenseLines.length === 1}
                        className="col-span-1 text-red-400 hover:text-red-600 disabled:opacity-30 text-sm">✕</button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Total: {form.currency} {expenseLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleCreate} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Create</button>
              <button onClick={() => { setShowNew(false); setExpenseLines([{ categoryId: '', description: '', amount: '', receiptUrl: '' }]); }}
                className="flex-1 px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
