import { useState, useEffect } from 'react';
import { financeApi } from '../../api/finance';

const STATUS_COLOR: Record<string, string> = {
  DONE: 'bg-green-100 text-green-700',
  PENDING: 'bg-yellow-100 text-yellow-700',
  WARNING: 'bg-orange-100 text-orange-700',
  ERROR: 'bg-red-100 text-red-700',
};

function RecurringJournalsTab() {
  const [journals, setJournals] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', frequency: 'MONTHLY', startDate: '', nextRunDate: '', templateLines: [] as any[] });

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await financeApi.getRecurringJournals();
      setJournals(res.data?.data ?? res.data ?? []);
    } catch {}
  }

  async function handleRun() {
    setRunning(true);
    try {
      const res = await financeApi.runRecurringJournals();
      setRunResult(res.data?.data ?? res.data);
      load();
    } finally { setRunning(false); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await financeApi.createRecurringJournal(form);
    setShowForm(false);
    setForm({ name: '', frequency: 'MONTHLY', startDate: '', nextRunDate: '', templateLines: [] });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Recurring Journals</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm"
          >
            + New Template
          </button>
          <button
            onClick={handleRun}
            disabled={running}
            className="px-3 py-1.5 bg-green-600 text-white rounded text-sm disabled:opacity-50"
          >
            {running ? 'Running…' : 'Run Due Journals'}
          </button>
        </div>
      </div>

      {runResult && (
        <div className="bg-green-50 border border-green-200 rounded p-3 text-sm">
          Ran {runResult.run} journal(s). Entry IDs: {runResult.entries?.join(', ') || 'none'}
          <button className="ml-3 text-xs text-gray-400" onClick={() => setRunResult(null)}>dismiss</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-gray-50 border rounded p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Name</label>
              <input className="w-full border rounded px-2 py-1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Frequency</label>
              <select className="w-full border rounded px-2 py-1" value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })}>
                {['DAILY','WEEKLY','MONTHLY','QUARTERLY','YEARLY'].map(f => <option key={f}>{f}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Start Date</label>
              <input type="date" className="w-full border rounded px-2 py-1" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Next Run Date</label>
              <input type="date" className="w-full border rounded px-2 py-1" value={form.nextRunDate} onChange={e => setForm({ ...form, nextRunDate: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 border rounded">Cancel</button>
          </div>
        </form>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2 border">Name</th>
            <th className="p-2 border">Frequency</th>
            <th className="p-2 border">Next Run</th>
            <th className="p-2 border">Last Run</th>
            <th className="p-2 border">Active</th>
            <th className="p-2 border">Debit</th>
            <th className="p-2 border">Credit</th>
          </tr>
        </thead>
        <tbody>
          {journals.map((j: any) => (
            <tr key={j.id} className="hover:bg-gray-50">
              <td className="p-2 border">{j.name}</td>
              <td className="p-2 border">{j.frequency}</td>
              <td className="p-2 border">{j.nextRunDate}</td>
              <td className="p-2 border">{j.lastRunDate ?? '—'}</td>
              <td className="p-2 border">
                <span className={`px-2 py-0.5 rounded text-xs ${j.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {j.isActive ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td className="p-2 border text-right">{Number(j.totalDebit).toLocaleString()}</td>
              <td className="p-2 border text-right">{Number(j.totalCredit).toLocaleString()}</td>
            </tr>
          ))}
          {journals.length === 0 && (
            <tr><td colSpan={7} className="p-4 text-center text-gray-400">No recurring journals</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AccrualEngineTab() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [postModal, setPostModal] = useState<{ id: string; name: string } | null>(null);
  const [period, setPeriod] = useState('');
  const [form, setForm] = useState({ name: '', accrualAccountId: '', offsetAccountId: '', monthlyAmount: '', autoReverse: true });

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await financeApi.getAccrualConfigs();
      setConfigs(res.data?.data ?? res.data ?? []);
    } catch {}
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await financeApi.createAccrualConfig({ ...form, monthlyAmount: Number(form.monthlyAmount) });
    setShowForm(false);
    setForm({ name: '', accrualAccountId: '', offsetAccountId: '', monthlyAmount: '', autoReverse: true });
    load();
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!postModal) return;
    await financeApi.postAccrual(postModal.id, period);
    setPostModal(null);
    setPeriod('');
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Accrual Configurations</h2>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">
          + New Accrual
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-gray-50 border rounded p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Name</label>
              <input className="w-full border rounded px-2 py-1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Monthly Amount</label>
              <input type="number" className="w-full border rounded px-2 py-1" value={form.monthlyAmount} onChange={e => setForm({ ...form, monthlyAmount: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Accrual Account ID</label>
              <input className="w-full border rounded px-2 py-1" value={form.accrualAccountId} onChange={e => setForm({ ...form, accrualAccountId: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Offset Account ID</label>
              <input className="w-full border rounded px-2 py-1" value={form.offsetAccountId} onChange={e => setForm({ ...form, offsetAccountId: e.target.value })} required />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.autoReverse} onChange={e => setForm({ ...form, autoReverse: e.target.checked })} />
            Auto-Reverse in Next Period
          </label>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 border rounded">Cancel</button>
          </div>
        </form>
      )}

      {postModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form onSubmit={handlePost} className="bg-white rounded-lg p-6 w-80 space-y-4">
            <h3 className="font-semibold">Post Accrual: {postModal.name}</h3>
            <div>
              <label className="block text-sm font-medium mb-1">Period (e.g. 2026-06)</label>
              <input className="w-full border rounded px-2 py-1 text-sm" value={period} onChange={e => setPeriod(e.target.value)} placeholder="YYYY-MM" required />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">Post</button>
              <button type="button" onClick={() => setPostModal(null)} className="px-3 py-1.5 border rounded text-sm">Cancel</button>
            </div>
          </form>
        </div>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2 border">Name</th>
            <th className="p-2 border">Monthly Amount</th>
            <th className="p-2 border">Auto-Reverse</th>
            <th className="p-2 border">Status</th>
            <th className="p-2 border">Last Posted</th>
            <th className="p-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {configs.map((c: any) => (
            <tr key={c.id} className="hover:bg-gray-50">
              <td className="p-2 border">{c.name}</td>
              <td className="p-2 border text-right">{Number(c.monthlyAmount).toLocaleString()}</td>
              <td className="p-2 border text-center">{c.autoReverse ? 'Yes' : 'No'}</td>
              <td className="p-2 border">
                <span className={`px-2 py-0.5 rounded text-xs ${c.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {c.status}
                </span>
              </td>
              <td className="p-2 border">{c.lastPostedPeriod ?? '—'}</td>
              <td className="p-2 border">
                <button
                  onClick={() => setPostModal({ id: c.id, name: c.name })}
                  className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded border border-indigo-200"
                >
                  Post
                </button>
              </td>
            </tr>
          ))}
          {configs.length === 0 && (
            <tr><td colSpan={6} className="p-4 text-center text-gray-400">No accrual configurations</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PeriodCockpitTab() {
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [cockpit, setCockpit] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    financeApi.getPeriods().then((res: any) => {
      const list = res.data?.data?.items ?? res.data?.items ?? res.data?.data ?? res.data ?? [];
      setPeriods(Array.isArray(list) ? list : []);
    }).catch(() => {});
  }, []);

  async function loadCockpit(id: string) {
    if (!id) return;
    setLoading(true);
    try {
      const res = await financeApi.getPeriodCloseCockpit(id);
      setCockpit(res.data?.data ?? res.data);
    } finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Period-Close Cockpit</h2>
      <div className="flex gap-3 items-end">
        <div>
          <label className="block text-sm font-medium mb-1">Select Period</label>
          <select
            className="border rounded px-3 py-1.5 text-sm"
            value={selectedId}
            onChange={e => { setSelectedId(e.target.value); setCockpit(null); }}
          >
            <option value="">— choose period —</option>
            {periods.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name ?? p.periodCode ?? p.id}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => loadCockpit(selectedId)}
          disabled={!selectedId || loading}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Load Cockpit'}
        </button>
      </div>

      {cockpit && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-sm text-gray-500">Period:</span>{' '}
              <span className="font-medium">{cockpit.period?.name ?? cockpit.period?.periodCode}</span>
            </div>
            <div>
              <span className="text-sm text-gray-500">Status:</span>{' '}
              <span className={`px-2 py-0.5 rounded text-xs ${cockpit.period?.status === 'CLOSED' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>
                {cockpit.period?.status}
              </span>
            </div>
            {cockpit.canClose && (
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm font-medium">
                Ready to Close
              </span>
            )}
          </div>

          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="p-2 border">Check Item</th>
                <th className="p-2 border">Status</th>
                <th className="p-2 border">Detail</th>
              </tr>
            </thead>
            <tbody>
              {(cockpit.checklist ?? []).map((item: any, i: number) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="p-2 border">{item.item}</td>
                  <td className="p-2 border">
                    <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLOR[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="p-2 border text-gray-600">{item.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { key: 'cockpit', label: 'Period-Close Cockpit' },
  { key: 'recurring', label: 'Recurring Journals' },
  { key: 'accruals', label: 'Accrual Engine' },
];

export default function PeriodCloseCockpitPage() {
  const [tab, setTab] = useState('cockpit');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Period Close &amp; Automation</h1>
        <p className="text-gray-500 text-sm mt-1">Manage recurring journals, accruals, and period-close checklists</p>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'cockpit' && <PeriodCockpitTab />}
        {tab === 'recurring' && <RecurringJournalsTab />}
        {tab === 'accruals' && <AccrualEngineTab />}
      </div>
    </div>
  );
}
