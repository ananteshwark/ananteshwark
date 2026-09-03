import { useState, useEffect } from 'react';
import { financeApi } from '../../api/finance';

const EVENT_CLASSES = [
  'AP_INVOICE', 'AP_PAYMENT', 'AR_INVOICE', 'AR_RECEIPT',
  'BANK_TRANSACTION', 'ASSET_DEPRECIATION', 'ASSET_DISPOSAL',
  'LEASE_RECOGNITION', 'LEASE_PAYMENT', 'PAYROLL',
  'INVENTORY_VALUATION', 'STOCK_MOVEMENT',
];

const LINE_TYPES = ['DEBIT', 'CREDIT'];

const RULE_BADGE: Record<string, string> = {
  AP_INVOICE: 'bg-orange-100 text-orange-700',
  AP_PAYMENT: 'bg-orange-100 text-orange-700',
  AR_INVOICE: 'bg-blue-100 text-blue-700',
  AR_RECEIPT: 'bg-blue-100 text-blue-700',
  BANK_TRANSACTION: 'bg-purple-100 text-purple-700',
  ASSET_DEPRECIATION: 'bg-yellow-100 text-yellow-700',
  ASSET_DISPOSAL: 'bg-yellow-100 text-yellow-700',
  LEASE_RECOGNITION: 'bg-green-100 text-green-700',
  LEASE_PAYMENT: 'bg-green-100 text-green-700',
  PAYROLL: 'bg-pink-100 text-pink-700',
  INVENTORY_VALUATION: 'bg-indigo-100 text-indigo-700',
  STOCK_MOVEMENT: 'bg-indigo-100 text-indigo-700',
};

const BLANK_FORM = {
  name: '',
  description: '',
  eventClass: 'AR_INVOICE',
  lineType: 'DEBIT',
  priority: 50,
  accountId: '',
  conditionExpressionStr: '',
  isActive: true,
};

function RulesTab() {
  const [rules, setRules] = useState<any[]>([]);
  const [filterClass, setFilterClass] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...BLANK_FORM });
  const [condError, setCondError] = useState('');
  const [deriveResult, setDeriveResult] = useState<any>(null);
  const [testContext, setTestContext] = useState('{"currency":"USD","amount":1000}');

  useEffect(() => { load(); }, [filterClass]);

  async function load() {
    try {
      const res = await financeApi.listSlaRules(filterClass || undefined);
      setRules(res.data?.data ?? res.data ?? []);
    } catch {}
  }

  function openCreate() {
    setEditing(null);
    setForm({ ...BLANK_FORM });
    setCondError('');
    setShowForm(true);
  }

  function openEdit(rule: any) {
    setEditing(rule);
    setForm({
      name: rule.name,
      description: rule.description ?? '',
      eventClass: rule.eventClass,
      lineType: rule.lineType,
      priority: rule.priority,
      accountId: rule.accountId ?? '',
      conditionExpressionStr: rule.conditionExpression ? JSON.stringify(rule.conditionExpression, null, 2) : '',
      isActive: rule.isActive,
    });
    setCondError('');
    setShowForm(true);
  }

  function parseCondition(): any | undefined {
    const s = form.conditionExpressionStr.trim();
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch {
      setCondError('Invalid JSON in condition expression');
      return undefined;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCondError('');
    const cond = parseCondition();
    if (cond === undefined) return;

    const payload: any = {
      name: form.name,
      description: form.description || null,
      eventClass: form.eventClass,
      lineType: form.lineType,
      priority: Number(form.priority),
      accountId: form.accountId,
      conditionExpression: cond,
      isActive: form.isActive,
    };
    try {
      if (editing) {
        await financeApi.updateSlaRule(editing.id, payload);
      } else {
        await financeApi.createSlaRule(payload);
      }
      setShowForm(false);
      load();
    } catch (err: any) {
      setCondError(err.response?.data?.message ?? 'Save failed');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this rule?')) return;
    await financeApi.deleteSlaRule(id);
    load();
  }

  async function handleDeriveTest() {
    try {
      const ctx = JSON.parse(testContext);
      const res = await financeApi.deriveAccount({
        eventClass: form.eventClass,
        lineType: form.lineType,
        eventContext: ctx,
      });
      setDeriveResult(res.data?.data ?? res.data);
    } catch (err: any) {
      setDeriveResult({ error: err.response?.data?.message ?? 'Failed' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex gap-2 items-center">
          <h2 className="text-lg font-semibold">Account Derivation Rules</h2>
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">All Events</option>
            {EVENT_CLASSES.map((ec) => (
              <option key={ec} value={ec}>{ec}</option>
            ))}
          </select>
        </div>
        <button
          onClick={openCreate}
          className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700"
        >
          + New Rule
        </button>
      </div>

      {showForm && (
        <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
          <h3 className="font-medium">{editing ? 'Edit Rule' : 'New Account Derivation Rule'}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm mt-0.5"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Account ID *</label>
              <input
                required
                value={form.accountId}
                onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                placeholder="UUID of GL account"
                className="w-full border rounded px-2 py-1 text-sm mt-0.5 font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Event Class</label>
              <select
                value={form.eventClass}
                onChange={(e) => setForm({ ...form, eventClass: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm mt-0.5"
              >
                {EVENT_CLASSES.map((ec) => <option key={ec}>{ec}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Line Type</label>
              <select
                value={form.lineType}
                onChange={(e) => setForm({ ...form, lineType: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm mt-0.5"
              >
                {LINE_TYPES.map((lt) => <option key={lt}>{lt}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Priority (lower = higher precedence)</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })}
                className="w-full border rounded px-2 py-1 text-sm mt-0.5"
              />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <label htmlFor="isActive" className="text-sm">Active</label>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500">Description</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full border rounded px-2 py-1 text-sm mt-0.5"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500">
                Condition Expression (JSON — leave blank for catch-all)
              </label>
              <textarea
                value={form.conditionExpressionStr}
                onChange={(e) => setForm({ ...form, conditionExpressionStr: e.target.value })}
                rows={4}
                placeholder={'{\n  "field": "currency",\n  "op": "neq",\n  "value": "USD"\n}'}
                className="w-full border rounded px-2 py-1 text-sm font-mono mt-0.5"
              />
              {condError && <p className="text-red-500 text-xs mt-1">{condError}</p>}
              <p className="text-xs text-gray-400 mt-1">
                Ops: eq, neq, gt, gte, lt, lte, in, nin, contains, startsWith, null, notNull.
                Combine with {'{'}and: [...]{'}'}  {'{'}or: [...]{'}'}  {'{'}not: ...{'}'}.
                Field supports dot-notation (e.g. "vendor.category").
              </p>
            </div>

            <div className="col-span-2 border-t pt-3">
              <p className="text-xs font-medium text-gray-600 mb-2">Dry-run: Test current rule against an event context</p>
              <div className="flex gap-2">
                <textarea
                  value={testContext}
                  onChange={(e) => setTestContext(e.target.value)}
                  rows={2}
                  className="flex-1 border rounded px-2 py-1 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={handleDeriveTest}
                  className="bg-gray-200 px-3 py-1 rounded text-sm hover:bg-gray-300"
                >
                  Derive
                </button>
              </div>
              {deriveResult && (
                <pre className="mt-2 text-xs bg-white border rounded p-2 overflow-x-auto">
                  {JSON.stringify(deriveResult, null, 2)}
                </pre>
              )}
            </div>

            <div className="col-span-2 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border rounded px-3 py-1 text-sm hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-indigo-600 text-white px-3 py-1 rounded text-sm hover:bg-indigo-700"
              >
                {editing ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Event Class</th>
              <th className="px-3 py-2 text-left font-medium">Name</th>
              <th className="px-3 py-2 text-left font-medium">Line</th>
              <th className="px-3 py-2 text-left font-medium">Priority</th>
              <th className="px-3 py-2 text-left font-medium">Account</th>
              <th className="px-3 py-2 text-left font-medium">Condition</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rules.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-400">
                  No rules configured. Create the first rule to override DEFAULT_ACCOUNT_CODES.
                </td>
              </tr>
            ) : (
              rules.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${RULE_BADGE[r.eventClass] ?? 'bg-gray-100'}`}>
                      {r.eventClass}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${r.lineType === 'DEBIT' ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}>
                      {r.lineType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">{r.priority}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-600 max-w-[160px] truncate">{r.accountId}</td>
                  <td className="px-3 py-2 text-xs text-gray-500 max-w-[180px]">
                    {r.conditionExpression ? (
                      <span title={JSON.stringify(r.conditionExpression)} className="cursor-help underline dotted">
                        {JSON.stringify(r.conditionExpression).slice(0, 40)}…
                      </span>
                    ) : (
                      <span className="text-gray-300 italic">catch-all</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {r.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(r)} className="text-indigo-600 hover:underline text-xs">Edit</button>
                      <button onClick={() => handleDelete(r.id)} className="text-red-500 hover:underline text-xs">Del</button>
                    </div>
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

function AuditTrailTab() {
  const [events, setEvents] = useState<any[]>([]);
  const [filterDocId, setFilterDocId] = useState('');
  const [filterJeId, setFilterJeId] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const params: any = {};
      if (filterDocId) params.sourceDocumentId = filterDocId;
      if (filterJeId) params.journalEntryId = filterJeId;
      if (filterClass) params.eventClass = filterClass;
      const res = await financeApi.getSlaAuditTrail(params);
      setEvents(res.data?.data ?? res.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <label className="text-xs text-gray-500 block">Event Class</label>
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">All</option>
            {EVENT_CLASSES.map((ec) => <option key={ec}>{ec}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block">Source Document ID</label>
          <input
            value={filterDocId}
            onChange={(e) => setFilterDocId(e.target.value)}
            placeholder="UUID"
            className="border rounded px-2 py-1 text-sm font-mono w-72"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block">Journal Entry ID</label>
          <input
            value={filterJeId}
            onChange={(e) => setFilterJeId(e.target.value)}
            placeholder="UUID"
            className="border rounded px-2 py-1 text-sm font-mono w-72"
          />
        </div>
        <button
          onClick={load}
          className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700"
        >
          Search
        </button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Event Class</th>
              <th className="px-3 py-2 text-left font-medium">Document Type</th>
              <th className="px-3 py-2 text-left font-medium">Source Doc</th>
              <th className="px-3 py-2 text-left font-medium">Account</th>
              <th className="px-3 py-2 text-right font-medium">Debit</th>
              <th className="px-3 py-2 text-right font-medium">Credit</th>
              <th className="px-3 py-2 text-left font-medium">Rule Used</th>
              <th className="px-3 py-2 text-left font-medium">JE</th>
              <th className="px-3 py-2 text-left font-medium">When</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">Loading…</td></tr>
            ) : events.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">No XLA events found. Events are recorded when invoices/bills are posted with SLA rules active.</td></tr>
            ) : (
              events.map((ev) => (
                <tr key={ev.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${RULE_BADGE[ev.eventClass] ?? 'bg-gray-100'}`}>
                      {ev.eventClass}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{ev.sourceDocumentType}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-600 max-w-[120px] truncate" title={ev.sourceDocumentId}>
                    {ev.sourceDocumentId?.slice(0, 8)}…
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {ev.accountCode ? <span>{ev.accountCode}</span> : <span className="text-gray-400 font-mono text-xs">{ev.accountId?.slice(0, 8)}…</span>}
                  </td>
                  <td className="px-3 py-2 text-right">{Number(ev.debit) > 0 ? Number(ev.debit).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-right">{Number(ev.credit) > 0 ? Number(ev.credit).toLocaleString() : '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    {ev.slaRuleName
                      ? <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded">{ev.slaRuleName}</span>
                      : <span className="text-gray-400 italic">default fallback</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-500" title={ev.journalEntryId}>
                    {ev.journalEntryId ? `${ev.journalEntryId.slice(0, 8)}…` : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400">
                    {ev.createdAt ? new Date(ev.createdAt).toLocaleString() : ''}
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

const TABS = ['Rules', 'Audit Trail'];

export default function SubledgerAccountingPage() {
  const [tab, setTab] = useState('Rules');

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Subledger Accounting Engine</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle-style configurable Account Derivation Rules (ADR) — map business events to GL accounts
          without code changes. Rules override DEFAULT_ACCOUNT_CODES; fallback to defaults when no rule matches.
        </p>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Rules' && <RulesTab />}
      {tab === 'Audit Trail' && <AuditTrailTab />}
    </div>
  );
}
