import { useState, useEffect } from 'react';
import { Plus, X, Rocket, CheckCircle2, Scale, RefreshCw } from 'lucide-react';
import { meritApi } from '../../api/merit';

const unwrap = (res: any) => res.data?.data ?? res.data;
const listOf = (res: any) => {
  const p = unwrap(res);
  return Array.isArray(p) ? p : p?.data ?? [];
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  HRBP_REVIEW: 'bg-amber-100 text-amber-700',
  LAUNCHED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
};

function PlanModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', cycleType: 'MERIT', effectiveDate: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await meritApi.createPlan(form);
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not create plan');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Merit Plan</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Plan name (e.g. FY27 Merit Cycle)"
            value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.cycleType}
            onChange={e => setForm(p => ({ ...p, cycleType: e.target.value }))}>
            {['MERIT', 'PROMOTION', 'MARKET_ADJUSTMENT', 'OFF_CYCLE'].map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
          <label className="block text-xs text-gray-500">Effective date
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
              value={form.effectiveDate} onChange={e => setForm(p => ({ ...p, effectiveDate: e.target.value }))} />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !form.name.trim() || !form.effectiveDate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GridModal({ plan, onClose, onDone }: { plan: any; onClose: () => void; onDone: () => void }) {
  const [budgetPct, setBudgetPct] = useState('4');
  const [spreadPct, setSpreadPct] = useState('1');
  const [ratings, setRatings] = useState([
    { rating: 'OUTSTANDING', multiplier: 1.5, populationPct: 15 },
    { rating: 'EXCEEDS', multiplier: 1.2, populationPct: 25 },
    { rating: 'MEETS', multiplier: 1.0, populationPct: 50 },
    { rating: 'BELOW', multiplier: 0.5, populationPct: 10 },
  ]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await meritApi.modelGrid(plan.id, { overallBudgetPct: Number(budgetPct), spreadPct: Number(spreadPct), ratings });
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not model the grid');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Model Increment Grid — {plan.name}</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <label className="text-xs text-gray-500">Overall budget %
            <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" value={budgetPct} onChange={e => setBudgetPct(e.target.value)} />
          </label>
          <label className="text-xs text-gray-500">Spread ± %
            <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" value={spreadPct} onChange={e => setSpreadPct(e.target.value)} />
          </label>
        </div>
        <table className="w-full text-sm mb-3">
          <thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Rating</th><th>Multiplier</th><th>Population %</th></tr></thead>
          <tbody>
            {ratings.map((r, i) => (
              <tr key={r.rating}>
                <td className="py-1 font-medium">{r.rating}</td>
                <td><input type="number" step="0.1" className="w-20 border rounded px-2 py-1" value={r.multiplier}
                  onChange={e => setRatings(prev => prev.map((x, j) => j === i ? { ...x, multiplier: Number(e.target.value) } : x))} /></td>
                <td><input type="number" className="w-20 border rounded px-2 py-1" value={r.populationPct}
                  onChange={e => setRatings(prev => prev.map((x, j) => j === i ? { ...x, populationPct: Number(e.target.value) } : x))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Modelling…' : 'Apply Grid'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MeritPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [bias, setBias] = useState<any>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [gridPlan, setGridPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await meritApi.listPlans();
      const list = listOf(res);
      setPlans(list);
      if (selected) {
        const still = list.find((p: any) => p.id === selected.id);
        setSelected(still ?? null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!selected) { setLines([]); setBias(null); return; }
    meritApi.listLines(selected.id).then(r => setLines(listOf(r))).catch(() => setLines([]));
    meritApi.getBiasScreen(selected.id).then(r => setBias(unwrap(r))).catch(() => setBias(null));
  }, [selected?.id, selected?.status]);

  const act = async (fn: () => Promise<any>, label: string) => {
    try {
      await fn();
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || `Could not ${label}`);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Merit Planning</h1>
          <p className="text-sm text-gray-500">Model increment grids, run worksheets, screen for bias and approve cycles.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="px-3 py-2 border rounded-lg text-sm flex items-center gap-1"><RefreshCw className="h-4 w-4" />Refresh</button>
          <button onClick={() => setShowPlanModal(true)} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700">
            <Plus className="h-4 w-4" />New Plan
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border divide-y">
          {loading && <p className="p-4 text-sm text-gray-400">Loading…</p>}
          {!loading && plans.length === 0 && <p className="p-4 text-sm text-gray-400">No merit plans yet.</p>}
          {plans.map(p => (
            <button key={p.id} onClick={() => setSelected(p)}
              className={`w-full text-left p-3 hover:bg-gray-50 ${selected?.id === p.id ? 'bg-blue-50' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{p.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>{p.status}</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{p.cycleType} · effective {p.effectiveDate}</p>
            </button>
          ))}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {!selected && <div className="bg-white rounded-xl border p-8 text-center text-sm text-gray-400">Select a plan to work on it.</div>}
          {selected && (
            <>
              <div className="bg-white rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setGridPlan(selected)} disabled={selected.status !== 'DRAFT'}
                    className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40">Model Grid</button>
                  <button onClick={() => act(() => meritApi.submitHrbp(selected.id), 'submit for HRBP review')} disabled={selected.status !== 'DRAFT'}
                    className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 flex items-center gap-1"><Scale className="h-3.5 w-3.5" />HRBP Review</button>
                  <button onClick={() => act(() => meritApi.launch(selected.id), 'launch')} disabled={selected.status !== 'HRBP_REVIEW'}
                    className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 flex items-center gap-1"><Rocket className="h-3.5 w-3.5" />Launch</button>
                  <button onClick={() => act(() => meritApi.approve(selected.id), 'approve')} disabled={selected.status !== 'LAUNCHED'}
                    className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm disabled:opacity-40 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Approve Plan</button>
                </div>
                {(selected.incrementRanges ?? []).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.incrementRanges.map((r: any) => (
                      <span key={r.rating} className="text-xs bg-gray-100 rounded-full px-2 py-1">
                        {r.rating}: {r.minPct}–{r.maxPct}% (target {r.targetPct}%)
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b">
                      <th className="p-3">Employee</th><th>Rating</th><th>Current</th><th>Proposed %</th><th>Status</th><th className="text-right pr-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lines.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-400">No worksheet lines. Lines are added when the plan is populated from HR.</td></tr>}
                    {lines.map(l => (
                      <tr key={l.id}>
                        <td className="p-3">{l.employeeName ?? l.employeeId}</td>
                        <td>{l.performanceRating ?? '—'}</td>
                        <td>{Number(l.currentSalary).toLocaleString()} {l.currency ?? ''}</td>
                        <td>{l.proposedPct != null ? `${l.proposedPct}%` : '—'}</td>
                        <td><span className="text-xs bg-gray-100 rounded-full px-2 py-0.5">{l.status}</span></td>
                        <td className="text-right pr-3 space-x-2">
                          <button onClick={() => {
                            const pct = prompt('Proposed increase %', String(l.proposedPct ?? ''));
                            if (pct != null) act(() => meritApi.proposeLine(l.id, { proposedPct: Number(pct) }), 'propose');
                          }} className="text-blue-600 text-xs">Propose</button>
                          <button onClick={() => act(() => meritApi.approveLine(l.id), 'approve line')} className="text-green-600 text-xs">Approve</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {bias && (Array.isArray(bias) ? bias.length > 0 : (bias.alerts ?? []).length > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-amber-800 mb-2">Bias screen</h3>
                  <ul className="text-sm text-amber-700 list-disc ml-4 space-y-1">
                    {(Array.isArray(bias) ? bias : bias.alerts ?? []).map((a: any, i: number) => (
                      <li key={i}>{a.message ?? a.detail ?? JSON.stringify(a)}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showPlanModal && <PlanModal onClose={() => setShowPlanModal(false)} onDone={() => { setShowPlanModal(false); load(); }} />}
      {gridPlan && <GridModal plan={gridPlan} onClose={() => setGridPlan(null)} onDone={() => { setGridPlan(null); load(); }} />}
    </div>
  );
}
