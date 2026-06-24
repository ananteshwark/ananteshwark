import { useState, useEffect, useCallback } from 'react';
import { financeApi } from '../../api/finance';
import { Plus, RefreshCw, ChevronDown, ChevronRight, TrendingUp } from 'lucide-react';

type Tab = 'orders' | 'copa';

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  RELEASED: 'bg-green-100 text-green-700',
  TECHNICALLY_CLOSED: 'bg-yellow-100 text-yellow-700',
  CLOSED: 'bg-gray-100 text-gray-700',
};

const CLASS_COLORS: Record<string, string> = {
  OVERHEAD: 'bg-orange-100 text-orange-700',
  INVESTMENT: 'bg-purple-100 text-purple-700',
  ACCRUAL: 'bg-teal-100 text-teal-700',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ─── New Order Dialog ────────────────────────────────────────────────────────

function NewOrderDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    objectClass: 'OVERHEAD',
    budget: '',
    responsibleCostCenterId: '',
    settlementCostCenterId: '',
    settlementAccountId: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await financeApi.createInternalOrder({
        ...form,
        budget: Number(form.budget) || 0,
        responsibleCostCenterId: form.responsibleCostCenterId || null,
        settlementCostCenterId: form.settlementCostCenterId || null,
        settlementAccountId: form.settlementAccountId || null,
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create internal order');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-6 border-b"><h2 className="text-lg font-semibold">New Internal Order</h2></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.name} required
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Object Class</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.objectClass}
                onChange={e => setForm(f => ({ ...f, objectClass: e.target.value }))}>
                <option value="OVERHEAD">Overhead</option>
                <option value="INVESTMENT">Investment</option>
                <option value="ACCRUAL">Accrual</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Budget</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" type="number" value={form.budget}
                onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Responsible Cost Center ID</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.responsibleCostCenterId}
                onChange={e => setForm(f => ({ ...f, responsibleCostCenterId: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Settlement Account ID</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.settlementAccountId}
                onChange={e => setForm(f => ({ ...f, settlementAccountId: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Internal Orders Tab ─────────────────────────────────────────────────────

function InternalOrdersTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actuals, setActuals] = useState<Record<string, any>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeApi.getInternalOrders();
      setOrders(res.data?.data ?? res.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const expandOrder = async (id: string) => {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (!actuals[id]) {
      try {
        const res = await financeApi.getInternalOrderActuals(id);
        setActuals(prev => ({ ...prev, [id]: res.data?.data ?? res.data }));
      } catch {}
    }
  };

  const doAction = async (fn: () => Promise<any>, key: string) => {
    setActionLoading(key);
    try { await fn(); await load(); } catch (e: any) { alert(e.response?.data?.message || 'Error'); }
    finally { setActionLoading(null); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600">Track overhead, investment, and accrual costs by internal order.</p>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowDialog(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Order
          </button>
        </div>
      </div>

      {showDialog && <NewOrderDialog onClose={() => setShowDialog(false)} onSaved={load} />}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No internal orders created yet</div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3 text-left">Order #</th>
                <th className="px-4 py-3 text-left">Name</th>
                <th className="px-4 py-3 text-left">Class</th>
                <th className="px-4 py-3 text-right">Budget</th>
                <th className="px-4 py-3 text-right">Actual Cost</th>
                <th className="px-4 py-3 text-right">Variance</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map(o => {
                const variance = Number(o.budget) - Number(o.actualCost);
                return (
                  <>
                    <tr key={o.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button onClick={() => expandOrder(o.id)} className="text-gray-400 hover:text-gray-600">
                          {expanded === o.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono font-medium">{o.orderNumber}</td>
                      <td className="px-4 py-3">{o.name}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${CLASS_COLORS[o.objectClass] ?? ''}`}>
                          {o.objectClass}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{Number(o.budget).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right">{Number(o.actualCost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className={`px-4 py-3 text-right font-medium ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {variance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-1 justify-center">
                          {o.status === 'OPEN' && (
                            <button disabled={actionLoading === o.id + 'r'}
                              onClick={() => doAction(() => financeApi.releaseInternalOrder(o.id), o.id + 'r')}
                              className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50">Release</button>
                          )}
                          {(o.status === 'OPEN' || o.status === 'RELEASED') && (
                            <button disabled={actionLoading === o.id + 's'}
                              onClick={() => doAction(() => financeApi.settleInternalOrder(o.id), o.id + 's')}
                              className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50">Settle</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expanded === o.id && (
                      <tr key={`${o.id}-detail`}>
                        <td colSpan={9} className="px-8 py-4 bg-gray-50">
                          {actuals[o.id] ? (
                            <>
                              <p className="text-xs font-semibold text-gray-500 mb-2">Actual Cost Breakdown — Net: {Number(actuals[o.id].netCost).toFixed(2)}</p>
                              <table className="text-xs max-w-md">
                                <thead>
                                  <tr className="text-gray-500">
                                    <th className="text-left pb-1 pr-4">Account ID</th>
                                    <th className="text-right pb-1 pr-4">Total Debit</th>
                                    <th className="text-right pb-1">Total Credit</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(actuals[o.id].rows ?? []).map((r: any, i: number) => (
                                    <tr key={i} className="border-t">
                                      <td className="py-1 pr-4 font-mono">{r.account_id.slice(0, 8)}…</td>
                                      <td className="py-1 pr-4 text-right">{Number(r.total_debit).toFixed(2)}</td>
                                      <td className="py-1 text-right">{Number(r.total_credit).toFixed(2)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </>
                          ) : <p className="text-xs text-gray-500">Loading actuals...</p>}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── CO-PA Tab ───────────────────────────────────────────────────────────────

function CopaTab() {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-01-01`;
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await financeApi.getCopaReport(fromDate, toDate);
      setRows(res.data?.data ?? res.data ?? []);
      setRan(true);
    } catch (e: any) {
      alert(e.response?.data?.message || 'Failed to load CO-PA report');
    } finally { setLoading(false); }
  };

  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue), 0);
  const totalExpenses = rows.reduce((s, r) => s + Number(r.expenses), 0);
  const totalGP = rows.reduce((s, r) => s + Number(r.grossProfit), 0);

  return (
    <div>
      <div className="flex items-end gap-4 mb-6 p-4 bg-gray-50 rounded-xl border">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
          <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
          <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={run} disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          <TrendingUp className="w-4 h-4" />
          {loading ? 'Running...' : 'Run Report'}
        </button>
      </div>

      {!ran ? (
        <div className="text-center py-12 text-gray-500">Set date range and run the CO-PA report</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No posted journal entries in selected period</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-xs text-green-600 font-medium mb-1">Total Revenue</p>
              <p className="text-xl font-bold text-green-700">{totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs text-red-600 font-medium mb-1">Total Expenses</p>
              <p className="text-xl font-bold text-red-700">{totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</p>
            </div>
            <div className={`border rounded-xl p-4 ${totalGP >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
              <p className={`text-xs font-medium mb-1 ${totalGP >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>Gross Profit</p>
              <p className={`text-xl font-bold ${totalGP >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                {totalGP.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-3 text-left">Profit Center</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Expenses</th>
                  <th className="px-4 py-3 text-right">Gross Profit</th>
                  <th className="px-4 py-3 text-right">GP %</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => {
                  const gpPct = r.revenue > 0 ? (r.grossProfit / r.revenue * 100) : 0;
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{r.profitCenterName}</td>
                      <td className="px-4 py-3 text-right text-green-700">{Number(r.revenue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right text-red-600">{Number(r.expenses).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${r.grossProfit >= 0 ? 'text-blue-700' : 'text-orange-600'}`}>
                        {Number(r.grossProfit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`px-4 py-3 text-right ${gpPct >= 0 ? 'text-gray-700' : 'text-red-600'}`}>
                        {gpPct.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-gray-50 font-semibold border-t-2">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-4 py-3 text-right text-green-700">{totalRevenue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right text-red-600">{totalExpenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className={`px-4 py-3 text-right ${totalGP >= 0 ? 'text-blue-700' : 'text-orange-600'}`}>{totalGP.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right">{totalRevenue > 0 ? (totalGP / totalRevenue * 100).toFixed(1) : '0.0'}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function InternalOrdersPage() {
  const [tab, setTab] = useState<Tab>('orders');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">CO Controlling</h1>
        <p className="text-gray-500 mt-1">Internal Orders and CO-PA Profitability Analysis</p>
      </div>

      <div className="flex gap-1 border-b mb-6">
        {[
          { key: 'orders' as Tab, label: 'Internal Orders' },
          { key: 'copa' as Tab, label: 'CO-PA Report' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'orders' && <InternalOrdersTab />}
      {tab === 'copa' && <CopaTab />}
    </div>
  );
}
