import { useEffect, useState } from 'react';
import { Zap, Plus, X, Trash2, Play, RefreshCw, Bell, Mail, Webhook } from 'lucide-react';
import { automationApi } from '../../api/automation';

const unwrap = (res: any) => res.data?.data ?? res.data;

const OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'exists'];
const ACTION_TYPES = [
  { type: 'NOTIFY', label: 'In-app notification', icon: <Bell className="h-3.5 w-3.5" /> },
  { type: 'EMAIL', label: 'Email', icon: <Mail className="h-3.5 w-3.5" /> },
  { type: 'WEBHOOK', label: 'Webhook', icon: <Webhook className="h-3.5 w-3.5" /> },
];

const RUN_COLORS: Record<string, string> = {
  SUCCESS: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-amber-100 text-amber-700',
  FAILED: 'bg-red-100 text-red-700',
};

const emptyForm = () => ({
  name: '', description: '', triggerEvent: '', isActive: true,
  conditions: [] as any[], actions: [{ type: 'NOTIFY', params: { userIdField: 'employeeId', title: '', body: '' } }] as any[],
});

export default function AutomationPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [tab, setTab] = useState<'rules' | 'runs'>('rules');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [ev, rl, rn] = await Promise.all([
        automationApi.getEvents(), automationApi.getRules(), automationApi.getRuns(),
      ]);
      setEvents(unwrap(ev) ?? []);
      setRules(unwrap(rl) ?? []);
      setRuns(unwrap(rn) ?? []);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to load automation data');
    }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditingId(null); setForm(emptyForm()); setError(null); setShowForm(true); };
  const openEdit = (r: any) => {
    setEditingId(r.id);
    setForm({
      name: r.name, description: r.description ?? '', triggerEvent: r.triggerEvent,
      isActive: r.isActive, conditions: r.conditions ?? [], actions: r.actions ?? [],
    });
    setError(null); setShowForm(true);
  };

  const save = async () => {
    setBusy(true); setError(null);
    try {
      if (editingId) await automationApi.updateRule(editingId, form);
      else await automationApi.createRule(form);
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save rule');
    } finally { setBusy(false); }
  };

  const remove = async (r: any) => {
    if (!confirm(`Delete automation "${r.name}"?`)) return;
    await automationApi.deleteRule(r.id); await load();
  };

  const toggleActive = async (r: any) => {
    await automationApi.updateRule(r.id, { isActive: !r.isActive }); await load();
  };

  const test = async (r: any) => {
    const raw = prompt('Sample payload (JSON) to test against', '{"totalAmount": 5000}');
    if (raw == null) return;
    try {
      const res = await automationApi.testRule(r.id, JSON.parse(raw));
      alert(unwrap(res)?.matched ? 'Rule matched — actions executed (see Runs tab).' : 'Rule did NOT match the payload.');
      await load();
    } catch (e: any) { alert(e?.response?.data?.message ?? 'Test failed (is the JSON valid?)'); }
  };

  const sweep = async () => {
    setBusy(true);
    try {
      const res = await automationApi.sweepNow();
      const r = unwrap(res);
      alert(`Sweep done — overdue invoices: ${r.overdueInvoices}, SLA breaches: ${r.slaBreaches}, expiring contracts: ${r.expiringContracts}`);
      await load();
    } finally { setBusy(false); }
  };

  const setCondition = (i: number, patch: any) =>
    setForm((f: any) => ({ ...f, conditions: f.conditions.map((c: any, j: number) => (j === i ? { ...c, ...patch } : c)) }));
  const setAction = (i: number, patch: any) =>
    setForm((f: any) => ({ ...f, actions: f.actions.map((a: any, j: number) => (j === i ? { ...a, ...patch } : a)) }));
  const setActionParam = (i: number, key: string, value: string) =>
    setForm((f: any) => ({
      ...f,
      actions: f.actions.map((a: any, j: number) => (j === i ? { ...a, params: { ...a.params, [key]: value } } : a)),
    }));

  const eventsByModule = events.reduce((acc: Record<string, any[]>, e: any) => {
    (acc[e.module] = acc[e.module] ?? []).push(e); return acc;
  }, {});

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Zap className="h-6 w-6 text-amber-500" /> Automation</h1>
          <p className="text-sm text-gray-500 mt-1">
            Every workflow emits events — attach rules that notify people, send emails, or call webhooks when they fire.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={sweep} disabled={busy} className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
            <RefreshCw className="h-4 w-4" /> Run sweeps now
          </button>
          <button onClick={openNew} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm">
            <Plus className="h-4 w-4" /> New Rule
          </button>
        </div>
      </div>

      {error && !showForm && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="flex gap-1 border-b">
        {(['rules', 'runs'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${tab === t ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'rules' ? `Rules (${rules.length})` : `Run log (${runs.length})`}
          </button>
        ))}
      </div>

      {tab === 'rules' && (
        <div className="bg-white border rounded-lg divide-y">
          {rules.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-gray-400">
              No automation rules yet. Create one to react to any workflow event.
            </p>
          )}
          {rules.map((r) => (
            <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{r.name}</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">{r.triggerEvent}</span>
                  {!r.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">paused</span>}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {(r.conditions?.length ?? 0) > 0 ? `${r.conditions.length} condition(s) · ` : 'no conditions · '}
                  {(r.actions ?? []).map((a: any) => a.type).join(', ')} · ran {r.runCount ?? 0}×
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => test(r)} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded"><Play className="h-3.5 w-3.5" /> Test</button>
                <button onClick={() => toggleActive(r)} className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 rounded border border-gray-200">{r.isActive ? 'Pause' : 'Resume'}</button>
                <button onClick={() => openEdit(r)} className="px-2 py-1 text-xs text-indigo-700 hover:bg-indigo-50 rounded border border-indigo-200">Edit</button>
                <button onClick={() => remove(r)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'runs' && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600 uppercase">
              <tr>
                <th className="text-left px-4 py-2">When</th>
                <th className="text-left px-4 py-2">Rule</th>
                <th className="text-left px-4 py-2">Event</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No runs yet.</td></tr>}
              {runs.map((run) => (
                <tr key={run.id}>
                  <td className="px-4 py-2 text-xs text-gray-500">{new Date(run.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-2">{run.ruleName ?? '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{run.event}</td>
                  <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${RUN_COLORS[run.status] ?? ''}`}>{run.status}</span></td>
                  <td className="px-4 py-2 text-xs text-gray-500 max-w-xs truncate">{run.detail ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">{editingId ? 'Edit Rule' : 'New Automation Rule'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Notify CFO of big expenses" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Trigger event *</label>
                  <select value={form.triggerEvent} onChange={(e) => setForm({ ...form, triggerEvent: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">Select event…</option>
                    {Object.entries(eventsByModule).map(([mod, evs]: any) => (
                      <optgroup key={mod} label={mod}>
                        {evs.map((e: any) => <option key={e.event} value={e.event}>{e.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">Conditions (all must match)</label>
                  <button onClick={() => setForm({ ...form, conditions: [...form.conditions, { field: '', operator: 'eq', value: '' }] })}
                    className="text-xs text-indigo-600 hover:underline">+ add condition</button>
                </div>
                {form.conditions.length === 0 && <p className="text-xs text-gray-400">No conditions — the rule fires on every event.</p>}
                {form.conditions.map((c: any, i: number) => (
                  <div key={i} className="flex gap-2 mb-2 items-center">
                    <input value={c.field} onChange={(e) => setCondition(i, { field: e.target.value })}
                      className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono" placeholder="payload field, e.g. totalAmount" />
                    <select value={c.operator} onChange={(e) => setCondition(i, { operator: e.target.value })}
                      className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                      {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    {c.operator !== 'exists' && (
                      <input value={c.value ?? ''} onChange={(e) => setCondition(i, { value: e.target.value })}
                        className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm" placeholder="value" />
                    )}
                    <button onClick={() => setForm({ ...form, conditions: form.conditions.filter((_: any, j: number) => j !== i) })}
                      className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">Actions *</label>
                  <button onClick={() => setForm({ ...form, actions: [...form.actions, { type: 'NOTIFY', params: {} }] })}
                    className="text-xs text-indigo-600 hover:underline">+ add action</button>
                </div>
                {form.actions.map((a: any, i: number) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3 mb-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <select value={a.type} onChange={(e) => setAction(i, { type: e.target.value, params: {} })}
                        className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
                        {ACTION_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
                      </select>
                      <button onClick={() => setForm({ ...form, actions: form.actions.filter((_: any, j: number) => j !== i) })}
                        className="ml-auto p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                    {a.type === 'NOTIFY' && (
                      <div className="grid grid-cols-2 gap-2">
                        <input value={a.params.userId ?? ''} onChange={(e) => setActionParam(i, 'userId', e.target.value)}
                          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" placeholder="User ID (fixed)" />
                        <input value={a.params.userIdField ?? ''} onChange={(e) => setActionParam(i, 'userIdField', e.target.value)}
                          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono" placeholder="or payload field, e.g. approvedById" />
                        <input value={a.params.title ?? ''} onChange={(e) => setActionParam(i, 'title', e.target.value)}
                          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm col-span-2" placeholder="Title — use {{field}} placeholders" />
                        <input value={a.params.body ?? ''} onChange={(e) => setActionParam(i, 'body', e.target.value)}
                          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm col-span-2" placeholder="Body — e.g. Claim {{claimNumber}} for {{totalAmount}}" />
                      </div>
                    )}
                    {a.type === 'EMAIL' && (
                      <div className="grid grid-cols-2 gap-2">
                        <input value={a.params.to ?? ''} onChange={(e) => setActionParam(i, 'to', e.target.value)}
                          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm" placeholder="Recipient email (fixed)" />
                        <input value={a.params.toField ?? ''} onChange={(e) => setActionParam(i, 'toField', e.target.value)}
                          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono" placeholder="or payload field, e.g. email" />
                        <input value={a.params.templateCode ?? ''} onChange={(e) => setActionParam(i, 'templateCode', e.target.value)}
                          className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm col-span-2" placeholder="Email template code (optional)" />
                      </div>
                    )}
                    {a.type === 'WEBHOOK' && (
                      <input value={a.params.event ?? ''} onChange={(e) => setActionParam(i, 'event', e.target.value)}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono" placeholder="Override event name (optional — defaults to the trigger)" />
                    )}
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  className="rounded border-gray-300 text-indigo-600" />
                Active
              </label>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button onClick={save} disabled={busy} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                  {busy ? 'Saving…' : editingId ? 'Save Rule' : 'Create Rule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
