import { useState, useEffect, useCallback } from 'react';
import { salesApi } from '../../api/sales';
import { Plus, RefreshCw, ChevronDown, ChevronRight, Bell } from 'lucide-react';

type Tab = 'plans' | 'rebates' | 'upcoming';

const MILESTONE_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  BILLED: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-700',
};

const REBATE_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-gray-100 text-gray-700',
  SETTLED: 'bg-purple-100 text-purple-700',
};

function StatusBadge({ status, map }: { status: string; map: Record<string, string> }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ─── Billing Plans Tab ───────────────────────────────────────────────────────

function NewPlanDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ salesOrderId: '', orderTotal: '', planType: 'MILESTONE', notes: '' });
  const [milestones, setMilestones] = useState([{ description: '', billingDate: '', percentage: '' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addMilestone = () => setMilestones(prev => [...prev, { description: '', billingDate: '', percentage: '' }]);
  const removeMilestone = (i: number) => setMilestones(prev => prev.filter((_, idx) => idx !== i));
  const updateMilestone = (i: number, field: string, value: string) =>
    setMilestones(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));

  const totalPct = milestones.reduce((s, m) => s + (Number(m.percentage) || 0), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await salesApi.createBillingPlan({
        salesOrderId: form.salesOrderId,
        orderTotal: Number(form.orderTotal),
        planType: form.planType,
        notes: form.notes || null,
        milestones: milestones.map(m => ({
          description: m.description,
          billingDate: m.billingDate,
          percentage: Number(m.percentage),
        })),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create billing plan');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b"><h2 className="text-lg font-semibold">New Billing Plan</h2></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Sales Order ID *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.salesOrderId} required
                onChange={e => setForm(f => ({ ...f, salesOrderId: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Order Total *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" type="number" value={form.orderTotal} required
                onChange={e => setForm(f => ({ ...f, orderTotal: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plan Type</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.planType}
                onChange={e => setForm(f => ({ ...f, planType: e.target.value }))}>
                <option value="MILESTONE">Milestone</option>
                <option value="PERIODIC">Periodic</option>
                <option value="PARTIAL">Partial</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Milestones <span className={totalPct === 100 ? 'text-green-600' : 'text-red-500'}>({totalPct}%)</span></label>
              <button type="button" onClick={addMilestone} className="text-xs text-blue-600 hover:underline">+ Add</button>
            </div>
            {milestones.map((m, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 mb-2 items-center">
                <input className="border rounded px-2 py-1 text-xs" placeholder="Description" value={m.description}
                  onChange={e => updateMilestone(i, 'description', e.target.value)} />
                <input className="border rounded px-2 py-1 text-xs" type="date" value={m.billingDate}
                  onChange={e => updateMilestone(i, 'billingDate', e.target.value)} />
                <div className="flex gap-1">
                  <input className="border rounded px-2 py-1 text-xs flex-1" placeholder="%" type="number" value={m.percentage}
                    onChange={e => updateMilestone(i, 'percentage', e.target.value)} />
                  {milestones.length > 1 && (
                    <button type="button" onClick={() => removeMilestone(i)} className="text-red-500 text-xs px-1">×</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading || totalPct !== 100} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BillingPlansTab() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await salesApi.getBillingPlans();
      setPlans(res.data?.data ?? res.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doAction = async (fn: () => Promise<any>, key: string) => {
    setActionLoading(key);
    try { await fn(); await load(); } catch (e: any) { alert(e.response?.data?.message || 'Error'); }
    finally { setActionLoading(null); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600">Installment billing plans — milestone, periodic, or partial.</p>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowDialog(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Plan
          </button>
        </div>
      </div>

      {showDialog && <NewPlanDialog onClose={() => setShowDialog(false)} onSaved={load} />}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : plans.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No billing plans yet</div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3 text-left">Order ID</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Milestones</th>
                <th className="px-4 py-3 text-right">Billed</th>
                <th className="px-4 py-3 text-right">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {plans.map(p => {
                const total = p.milestones?.length ?? 0;
                const billed = p.milestones?.filter((m: any) => m.status === 'BILLED' || m.status === 'PAID').length ?? 0;
                const paid = p.milestones?.filter((m: any) => m.status === 'PAID').length ?? 0;
                return (
                  <>
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} className="text-gray-400 hover:text-gray-600">
                          {expanded === p.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{p.salesOrderId.slice(0, 8)}…</td>
                      <td className="px-4 py-3">{p.planType}</td>
                      <td className="px-4 py-3 text-right">{Number(p.orderTotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3 text-right">{total}</td>
                      <td className="px-4 py-3 text-right">{billed}</td>
                      <td className="px-4 py-3 text-right text-green-600 font-medium">{paid}</td>
                    </tr>
                    {expanded === p.id && (
                      <tr key={`${p.id}-detail`}>
                        <td colSpan={7} className="px-8 py-4 bg-gray-50">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="text-left pb-1">#</th>
                                <th className="text-left pb-1">Description</th>
                                <th className="text-left pb-1">Date</th>
                                <th className="text-right pb-1">%</th>
                                <th className="text-right pb-1">Amount</th>
                                <th className="text-left pb-1">Status</th>
                                <th className="text-center pb-1">Action</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(p.milestones ?? []).map((m: any) => (
                                <tr key={m.milestoneNumber} className="border-t">
                                  <td className="py-1">{m.milestoneNumber}</td>
                                  <td className="py-1">{m.description}</td>
                                  <td className="py-1">{m.billingDate}</td>
                                  <td className="py-1 text-right">{m.percentage}%</td>
                                  <td className="py-1 text-right">{Number(m.amount).toFixed(2)}</td>
                                  <td className="py-1"><StatusBadge status={m.status} map={MILESTONE_STATUS_COLORS} /></td>
                                  <td className="py-1 text-center">
                                    {m.status === 'PENDING' && (
                                      <button disabled={actionLoading === `${p.id}-${m.milestoneNumber}`}
                                        onClick={() => doAction(() => salesApi.billMilestone(p.id, m.milestoneNumber), `${p.id}-${m.milestoneNumber}`)}
                                        className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50">Bill</button>
                                    )}
                                    {m.status === 'BILLED' && (
                                      <button disabled={actionLoading === `${p.id}-${m.milestoneNumber}-p`}
                                        onClick={() => doAction(() => salesApi.markMilestonePaid(p.id, m.milestoneNumber), `${p.id}-${m.milestoneNumber}-p`)}
                                        className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50">Mark Paid</button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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

// ─── Rebates Tab ─────────────────────────────────────────────────────────────

function NewRebateDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ customerId: '', customerName: '', name: '', validFrom: '', validTo: '', calculationBasis: 'REVENUE' });
  const [tiers, setTiers] = useState([{ from: '', to: '', rebatePct: '' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addTier = () => setTiers(prev => [...prev, { from: '', to: '', rebatePct: '' }]);
  const updateTier = (i: number, field: string, value: string) =>
    setTiers(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await salesApi.createRebate({
        ...form,
        tiers: tiers.map(t => ({
          from: Number(t.from),
          to: t.to ? Number(t.to) : null,
          rebatePct: Number(t.rebatePct),
        })),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create rebate');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="p-6 border-b"><h2 className="text-lg font-semibold">New Rebate Agreement</h2></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Agreement Name *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.name} required
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer ID *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.customerId} required
                onChange={e => setForm(f => ({ ...f, customerId: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.customerName}
                onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valid From *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" type="date" value={form.validFrom} required
                onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valid To *</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" type="date" value={form.validTo} required
                onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Calculation Basis</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.calculationBasis}
                onChange={e => setForm(f => ({ ...f, calculationBasis: e.target.value }))}>
                <option value="REVENUE">Revenue</option>
                <option value="QUANTITY">Quantity</option>
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Rebate Tiers</label>
              <button type="button" onClick={addTier} className="text-xs text-blue-600 hover:underline">+ Add Tier</button>
            </div>
            <div className="grid grid-cols-3 gap-1 text-xs text-gray-500 mb-1 px-1">
              <span>From</span><span>To (blank=∞)</span><span>Rebate %</span>
            </div>
            {tiers.map((t, i) => (
              <div key={i} className="grid grid-cols-3 gap-2 mb-1">
                <input className="border rounded px-2 py-1 text-xs" placeholder="From" type="number" value={t.from}
                  onChange={e => updateTier(i, 'from', e.target.value)} />
                <input className="border rounded px-2 py-1 text-xs" placeholder="To" type="number" value={t.to}
                  onChange={e => updateTier(i, 'to', e.target.value)} />
                <input className="border rounded px-2 py-1 text-xs" placeholder="%" type="number" step="0.01" value={t.rebatePct}
                  onChange={e => updateTier(i, 'rebatePct', e.target.value)} />
              </div>
            ))}
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

function RebatesTab() {
  const [agreements, setAgreements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [simValues, setSimValues] = useState<Record<string, string>>({});
  const [simResult, setSimResult] = useState<Record<string, any>>({});
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await salesApi.getRebates();
      setAgreements(res.data?.data ?? res.data ?? []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doAction = async (fn: () => Promise<any>, key: string) => {
    setActionLoading(key);
    try { await fn(); await load(); } catch (e: any) { alert(e.response?.data?.message || 'Error'); }
    finally { setActionLoading(null); }
  };

  const simulate = async (id: string) => {
    const val = Number(simValues[id]);
    if (!val) return;
    try {
      const res = await salesApi.simulateRebate(id, val);
      setSimResult(prev => ({ ...prev, [id]: res.data?.data ?? res.data }));
    } catch (e: any) { alert(e.response?.data?.message || 'Error'); }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-600">Tiered rebate agreements for customers with accrual and settlement.</p>
        <div className="flex gap-2">
          <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
          <button onClick={() => setShowDialog(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Rebate
          </button>
        </div>
      </div>

      {showDialog && <NewRebateDialog onClose={() => setShowDialog(false)} onSaved={load} />}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : agreements.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No rebate agreements yet</div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3 text-left">Agreement</th>
                <th className="px-4 py-3 text-left">Customer</th>
                <th className="px-4 py-3 text-left">Valid</th>
                <th className="px-4 py-3 text-right">Accrued</th>
                <th className="px-4 py-3 text-right">Settled</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {agreements.map(ag => (
                <>
                  <tr key={ag.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button onClick={() => setExpanded(expanded === ag.id ? null : ag.id)} className="text-gray-400 hover:text-gray-600">
                        {expanded === ag.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{ag.name}</div>
                      <div className="text-xs text-gray-500 font-mono">{ag.agreementNumber}</div>
                    </td>
                    <td className="px-4 py-3">{ag.customerName ?? ag.customerId.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-xs">{ag.validFrom} → {ag.validTo}</td>
                    <td className="px-4 py-3 text-right">{Number(ag.accruedAmount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">{Number(ag.settledAmount).toFixed(2)}</td>
                    <td className="px-4 py-3"><StatusBadge status={ag.status} map={REBATE_STATUS_COLORS} /></td>
                    <td className="px-4 py-3 text-center">
                      {ag.status === 'ACTIVE' && Number(ag.accruedAmount) > Number(ag.settledAmount) && (
                        <button disabled={actionLoading === ag.id}
                          onClick={() => doAction(() => salesApi.settleRebate(ag.id), ag.id)}
                          className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 disabled:opacity-50">Settle</button>
                      )}
                    </td>
                  </tr>
                  {expanded === ag.id && (
                    <tr key={`${ag.id}-detail`}>
                      <td colSpan={8} className="px-8 py-4 bg-gray-50">
                        <div className="grid grid-cols-2 gap-6">
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-2">Rebate Tiers</p>
                            <table className="text-xs">
                              <thead><tr className="text-gray-500"><th className="text-left pb-1 pr-4">From</th><th className="text-left pb-1 pr-4">To</th><th className="text-left pb-1">Rebate %</th></tr></thead>
                              <tbody>
                                {(ag.tiers ?? []).map((t: any, i: number) => (
                                  <tr key={i} className="border-t">
                                    <td className="py-1 pr-4">{t.from.toLocaleString()}</td>
                                    <td className="py-1 pr-4">{t.to ? t.to.toLocaleString() : '∞'}</td>
                                    <td className="py-1">{t.rebatePct}%</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-gray-500 mb-2">Simulate Rebate</p>
                            <div className="flex gap-2">
                              <input
                                className="border rounded px-2 py-1 text-xs w-28"
                                placeholder="Order value"
                                type="number"
                                value={simValues[ag.id] ?? ''}
                                onChange={e => setSimValues(prev => ({ ...prev, [ag.id]: e.target.value }))}
                              />
                              <button onClick={() => simulate(ag.id)}
                                className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200">Calc</button>
                            </div>
                            {simResult[ag.id] && (
                              <p className="text-xs mt-2 text-green-700 font-semibold">
                                Rebate: {Number(simResult[ag.id].rebateAmount).toFixed(2)}
                                {simResult[ag.id].tier && ` @ ${simResult[ag.id].tier.rebatePct}%`}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Upcoming Billings Tab ───────────────────────────────────────────────────

function UpcomingTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('30');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await salesApi.getUpcomingBillings(Number(days));
      setRows(res.data?.data ?? res.data ?? []);
    } finally { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <p className="text-sm text-gray-600">Upcoming billing milestones due within</p>
        <select value={days} onChange={e => setDays(e.target.value)} className="border rounded px-2 py-1 text-sm">
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
          <option value="60">60 days</option>
          <option value="90">90 days</option>
        </select>
        <button onClick={load} className="p-2 border rounded-lg hover:bg-gray-50"><RefreshCw className="w-4 h-4" /></button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-500 flex flex-col items-center gap-2">
          <Bell className="w-8 h-8 text-gray-300" />
          <p>No upcoming billings in the next {days} days</p>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Order ID</th>
                <th className="px-4 py-3 text-left">Milestone</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-left">Billing Date</th>
                <th className="px-4 py-3 text-right">%</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs">{r.salesOrderId.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-center">{r.milestoneNumber}</td>
                  <td className="px-4 py-3">{r.description}</td>
                  <td className="px-4 py-3 font-medium">{r.billingDate}</td>
                  <td className="px-4 py-3 text-right">{r.percentage}%</td>
                  <td className="px-4 py-3 text-right font-semibold">{Number(r.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function BillingPlansPage() {
  const [tab, setTab] = useState<Tab>('plans');

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Billing Plans & Rebates</h1>
        <p className="text-gray-500 mt-1">SD Billing Plans (milestone/periodic) and Customer Rebate Management</p>
      </div>

      <div className="flex gap-1 border-b mb-6">
        {[
          { key: 'plans' as Tab, label: 'Billing Plans' },
          { key: 'rebates' as Tab, label: 'Rebate Agreements' },
          { key: 'upcoming' as Tab, label: 'Upcoming Billings' },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>{t.label}</button>
        ))}
      </div>

      {tab === 'plans' && <BillingPlansTab />}
      {tab === 'rebates' && <RebatesTab />}
      {tab === 'upcoming' && <UpcomingTab />}
    </div>
  );
}
