import { useState, useEffect } from 'react';
import { Plus, X, KeyRound, Table2, Workflow, Clock, Play, Copy } from 'lucide-react';
import { studioApi } from '../../api/studio';

const unwrap = (res: any) => res.data?.data ?? res.data;
const listOf = (res: any) => {
  const p = unwrap(res);
  return Array.isArray(p) ? p : p?.data ?? [];
};

function KeyModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState('reports:read');
  const [quota, setQuota] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await studioApi.createKey({
        name,
        scopes: scopes.split(',').map(s => s.trim()).filter(Boolean),
        quotaPerDay: quota ? Number(quota) : undefined,
      });
      const payload = unwrap(res);
      setCreated(payload?.plaintext ?? '(created — plaintext unavailable)');
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not create key');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New API Key</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        {created ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Copy this key now — it is shown only once:</p>
            <div className="flex items-center gap-2 bg-gray-50 border rounded-lg p-3">
              <code className="text-xs break-all flex-1">{created}</code>
              <button onClick={() => navigator.clipboard?.writeText(created)} title="Copy"><Copy className="h-4 w-4 text-gray-400" /></button>
            </div>
            <div className="flex justify-end">
              <button onClick={onDone} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Done</button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Key name (e.g. BI extract)"
                value={name} onChange={e => setName(e.target.value)} />
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Scopes, comma separated (e.g. reports:read, lookup:read)"
                value={scopes} onChange={e => setScopes(e.target.value)} />
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Daily quota (blank = unlimited)"
                value={quota} onChange={e => setQuota(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
              <button onClick={save} disabled={saving || !name.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                {saving ? 'Creating…' : 'Create Key'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function StudioPage() {
  const [tab, setTab] = useState<'keys' | 'tables' | 'scripts' | 'jobs'>('keys');
  const [keys, setKeys] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [scripts, setScripts] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [rows, setRows] = useState<Record<string, any[]>>({});
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [runResult, setRunResult] = useState<any>(null);

  const load = async () => {
    const [k, t, s, j] = await Promise.all([
      studioApi.listKeys().catch(() => null),
      studioApi.listTables().catch(() => null),
      studioApi.listScripts().catch(() => null),
      studioApi.listJobs().catch(() => null),
    ]);
    if (k) setKeys(listOf(k));
    if (t) setTables(listOf(t));
    if (s) setScripts(listOf(s));
    if (j) setJobs(listOf(j));
  };

  useEffect(() => { load(); }, []);

  const act = async (fn: () => Promise<any>, label: string) => {
    try {
      const res = await fn();
      await load();
      return res;
    } catch (e: any) {
      alert(e?.response?.data?.message || `Could not ${label}`);
    }
  };

  const addTable = async () => {
    const key = prompt('Table key (e.g. country_codes)');
    if (!key?.trim()) return;
    const name = prompt('Display name', key) ?? key;
    const cols = prompt('Column keys, comma separated (first is the lookup key)', 'code, label');
    if (!cols) return;
    await act(() => studioApi.createTable({ key, name, columns: cols.split(',').map(c => ({ key: c.trim() })) }), 'create table');
  };

  const loadRows = async (key: string) => {
    const res = await studioApi.listRows(key).catch(() => null);
    if (res) setRows(prev => ({ ...prev, [key]: listOf(res) }));
  };

  const addScript = async () => {
    const key = prompt('Script key (e.g. active_employees)');
    if (!key?.trim()) return;
    const name = prompt('Script name', key) ?? key;
    const stepsJson = prompt('Pipeline steps JSON (ops: filter/select/map/aggregate/sort/limit)',
      '[{"op":"filter","field":"status","equals":"ACTIVE"},{"op":"limit","count":100}]');
    if (!stepsJson) return;
    try {
      const steps = JSON.parse(stepsJson);
      await act(() => studioApi.createScript({ key, name, steps }), 'create script');
    } catch {
      alert('Steps must be valid JSON');
    }
  };

  const runScript = async (key: string) => {
    const rowsJson = prompt('Input rows JSON array', '[{"status":"ACTIVE","name":"Ann"},{"status":"EXITED","name":"Bob"}]');
    if (!rowsJson) return;
    try {
      const res = await act(() => studioApi.runScript(key, JSON.parse(rowsJson)), 'run script');
      if (res) setRunResult({ key, output: unwrap(res) });
    } catch {
      alert('Rows must be valid JSON');
    }
  };

  const addJob = async () => {
    if (!scripts.length) { alert('Create a script first'); return; }
    const name = prompt('Job name');
    if (!name?.trim()) return;
    const scriptKey = prompt(`Script key? (${scripts.map(s => s.key).join(', ')})`, scripts[0].key);
    if (!scriptKey) return;
    const interval = prompt('Interval minutes', '1440');
    await act(() => studioApi.createJob({ name, scriptKey, intervalMinutes: Number(interval ?? 1440) }), 'schedule job');
  };

  const tabs = [
    { key: 'keys' as const, label: `API Keys (${keys.length})`, icon: <KeyRound className="h-4 w-4" /> },
    { key: 'tables' as const, label: `Lookup Tables (${tables.length})`, icon: <Table2 className="h-4 w-4" /> },
    { key: 'scripts' as const, label: `Scripts (${scripts.length})`, icon: <Workflow className="h-4 w-4" /> },
    { key: 'jobs' as const, label: `Scheduled Jobs (${jobs.length})`, icon: <Clock className="h-4 w-4" /> },
  ];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Studio</h1>
        <p className="text-sm text-gray-500">Integration tooling: scoped API keys, lookup tables, sandboxed pipeline scripts and scheduled jobs (run hourly by the platform scheduler).</p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm flex items-center gap-1.5 border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-500'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'keys' && (
        <div className="bg-white rounded-xl border">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="text-sm font-semibold">API Keys</p>
            <button onClick={() => setShowKeyModal(true)} className="text-blue-600 text-sm flex items-center gap-1"><Plus className="h-4 w-4" />New Key</button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="p-3">Name</th><th>Prefix</th><th>Scopes</th><th>Quota/day</th><th>Status</th><th className="text-right pr-3"></th></tr></thead>
            <tbody className="divide-y">
              {keys.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-400">No API keys.</td></tr>}
              {keys.map(k => (
                <tr key={k.id}>
                  <td className="p-3 font-medium">{k.name}</td>
                  <td><code className="text-xs">{k.prefix}…</code></td>
                  <td className="text-xs">{(k.scopes ?? []).join(', ') || '—'}</td>
                  <td>{k.quotaPerDay ?? '∞'}</td>
                  <td><span className={`text-xs px-2 py-0.5 rounded-full ${k.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{k.status}</span></td>
                  <td className="text-right pr-3">
                    {k.status === 'ACTIVE' && <button onClick={() => act(() => studioApi.revokeKey(k.id), 'revoke key')} className="text-red-500 text-xs">Revoke</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'tables' && (
        <div className="bg-white rounded-xl border">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="text-sm font-semibold">Lookup Tables</p>
            <button onClick={addTable} className="text-blue-600 text-sm flex items-center gap-1"><Plus className="h-4 w-4" />New Table</button>
          </div>
          <div className="divide-y">
            {tables.length === 0 && <p className="p-4 text-sm text-gray-400">No lookup tables.</p>}
            {tables.map(t => (
              <div key={t.id ?? t.key} className="p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{t.name} <code className="text-xs text-gray-400">({t.key})</code></p>
                  <span className="space-x-3">
                    <button onClick={() => loadRows(t.key)} className="text-blue-600 text-xs">Show rows</button>
                    <button onClick={async () => {
                      const cols: string[] = (t.columns ?? []).map((c: any) => c.key);
                      const json = prompt(`Row JSON with keys: ${cols.join(', ')}`, JSON.stringify(Object.fromEntries(cols.map((c: string) => [c, '']))));
                      if (!json) return;
                      try { await act(() => studioApi.addRow(t.key, JSON.parse(json)), 'add row'); await loadRows(t.key); }
                      catch { alert('Row must be valid JSON'); }
                    }} className="text-blue-600 text-xs">+ Row</button>
                  </span>
                </div>
                {rows[t.key] && (
                  <pre className="mt-2 bg-gray-50 rounded-lg p-2 text-xs overflow-x-auto">{JSON.stringify(rows[t.key], null, 2)}</pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'scripts' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="text-sm font-semibold">Pipeline Scripts</p>
              <button onClick={addScript} className="text-blue-600 text-sm flex items-center gap-1"><Plus className="h-4 w-4" />New Script</button>
            </div>
            <div className="divide-y">
              {scripts.length === 0 && <p className="p-4 text-sm text-gray-400">No scripts. Scripts are whitelisted-op pipelines (filter/select/map/aggregate/sort/limit) — no arbitrary code.</p>}
              {scripts.map(s => (
                <div key={s.id ?? s.key} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{s.name} <code className="text-xs text-gray-400">({s.key})</code></p>
                    <p className="text-xs text-gray-500">{(s.steps ?? []).map((st: any) => st.op).join(' → ') || 'empty pipeline'}</p>
                  </div>
                  <button onClick={() => runScript(s.key)} className="text-blue-600 text-sm flex items-center gap-1"><Play className="h-4 w-4" />Run</button>
                </div>
              ))}
            </div>
          </div>
          {runResult && (
            <div className="bg-white rounded-xl border p-4">
              <p className="text-sm font-semibold mb-2">Run output — {runResult.key}</p>
              <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto">{JSON.stringify(runResult.output, null, 2)}</pre>
            </div>
          )}
        </div>
      )}

      {tab === 'jobs' && (
        <div className="bg-white rounded-xl border">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="text-sm font-semibold">Scheduled Jobs</p>
            <button onClick={addJob} className="text-blue-600 text-sm flex items-center gap-1"><Plus className="h-4 w-4" />New Job</button>
          </div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="p-3">Name</th><th>Script</th><th>Interval</th><th>Next run</th><th>Delivery</th><th className="text-right pr-3"></th></tr></thead>
            <tbody className="divide-y">
              {jobs.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-400">No scheduled jobs.</td></tr>}
              {jobs.map(j => (
                <tr key={j.id}>
                  <td className="p-3 font-medium">{j.name}</td>
                  <td><code className="text-xs">{j.scriptKey}</code></td>
                  <td>{j.intervalMinutes} min</td>
                  <td className="text-xs">{j.nextRunAt ? new Date(j.nextRunAt).toLocaleString() : '—'}</td>
                  <td>{j.deliveryType}</td>
                  <td className="text-right pr-3">
                    <button onClick={() => act(() => studioApi.runJob(j.id), 'run job')} className="text-blue-600 text-xs">Run now</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showKeyModal && <KeyModal onClose={() => setShowKeyModal(false)} onDone={() => { setShowKeyModal(false); load(); }} />}
    </div>
  );
}
