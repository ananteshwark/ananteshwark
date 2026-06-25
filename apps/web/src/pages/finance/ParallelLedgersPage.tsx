import { useState, useEffect, useCallback } from 'react';
import { Layers, Plus, GitCompare, Database } from 'lucide-react';
import { financeApi } from '../../api/finance';

type Tab = 'ledgers' | 'groups' | 'rules';

const SOURCES = ['MANUAL', 'AR', 'AP', 'BANK', 'PAYROLL', 'PROCUREMENT', 'FIXED_ASSETS', 'SYSTEM'];

const money = (n: number) =>
  new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

const unwrap = (res: any) => res.data?.data ?? res.data ?? [];

export default function ParallelLedgersPage() {
  const [tab, setTab] = useState<Tab>('ledgers');
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Layers className="w-6 h-6 text-indigo-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Parallel Ledgers</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Multiple accounting views (IFRS / Local / Tax), ledger groups, posting rules, and
        cross-ledger reconciliation.
      </p>

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {([
          ['ledgers', 'Ledgers'],
          ['groups', 'Groups & Reconciliation'],
          ['rules', 'Posting Rules'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === key ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'ledgers' && <LedgersTab />}
      {tab === 'groups' && <GroupsTab />}
      {tab === 'rules' && <RulesTab />}
    </div>
  );
}

// ─── Ledgers tab ──────────────────────────────────────────────────────────────

function LedgersTab() {
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [form, setForm] = useState({ code: '', name: '', accountingPrinciple: 'LOCAL_GAAP', currency: 'USD', isLeading: false });

  const refetch = useCallback(async () => {
    setLedgers(unwrap(await financeApi.getLedgers()));
  }, []);
  useEffect(() => { refetch(); }, [refetch]);

  const create = async () => {
    try { await financeApi.createLedger(form); setForm({ code: '', name: '', accountingPrinciple: 'LOCAL_GAAP', currency: 'USD', isLeading: false }); await refetch(); }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Failed to create ledger'); }
  };
  const seed = async () => {
    try { await financeApi.seedDefaultLedgers(); await refetch(); }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Failed to seed'); }
  };

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={seed} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200">
          <Database className="w-4 h-4" /> Seed MAIN + IFRS + TAX
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h3 className="text-base font-medium text-gray-800 mb-3">New Ledger</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3">
          <input value={form.code} placeholder="Code (e.g. IFRS)" onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={form.name} placeholder="Name" onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2" />
          <select value={form.accountingPrinciple} onChange={(e) => setForm({ ...form, accountingPrinciple: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="LOCAL_GAAP">Local GAAP</option>
            <option value="IFRS">IFRS</option>
            <option value="US_GAAP">US GAAP</option>
            <option value="TAX">Tax</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
          <input type="checkbox" checked={form.isLeading} onChange={(e) => setForm({ ...form, isLeading: e.target.checked })} />
          Leading ledger
        </label>
        <button disabled={!form.code || !form.name} onClick={create}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          <Plus className="w-4 h-4" /> Create Ledger
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Principle</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Currency</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leading</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {ledgers.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No ledgers yet. Seed the defaults to start.</td></tr>
            )}
            {ledgers.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-mono font-medium text-indigo-700">{l.code}</td>
                <td className="px-4 py-3 text-sm text-gray-800">{l.name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{l.accountingPrinciple}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{l.currency}</td>
                <td className="px-4 py-3 text-sm">{l.isLeading ? <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800">Leading</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Groups & Reconciliation tab ───────────────────────────────────────────────

function GroupsTab() {
  const [groups, setGroups] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [form, setForm] = useState<{ code: string; description: string; memberLedgers: string[] }>({ code: '', description: '', memberLedgers: [] });
  const [recon, setRecon] = useState<any>(null);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [activeGroup, setActiveGroup] = useState<string>('');

  const refetch = useCallback(async () => {
    setGroups(unwrap(await financeApi.getLedgerGroups()));
    setLedgers(unwrap(await financeApi.getLedgers()));
  }, []);
  useEffect(() => { refetch(); }, [refetch]);

  const toggleMember = (code: string) =>
    setForm((f) => ({ ...f, memberLedgers: f.memberLedgers.includes(code) ? f.memberLedgers.filter((c) => c !== code) : [...f.memberLedgers, code] }));

  const create = async () => {
    try { await financeApi.createLedgerGroup(form); setForm({ code: '', description: '', memberLedgers: [] }); await refetch(); }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Failed to create group'); }
  };

  const reconcile = async (code: string) => {
    setActiveGroup(code);
    try {
      const res = await financeApi.getLedgerReconciliation(code, { asOf });
      setRecon(res.data?.data ?? res.data);
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Reconciliation failed');
      setRecon(null);
    }
  };

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h3 className="text-base font-medium text-gray-800 mb-3">New Ledger Group</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <input value={form.code} placeholder="Group code" onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input value={form.description} placeholder="Description" onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm sm:col-span-2" />
        </div>
        <div className="mb-3">
          <p className="text-sm text-gray-600 mb-1">Member ledgers (first selected is leading):</p>
          <div className="flex flex-wrap gap-2">
            {ledgers.map((l) => (
              <button key={l.code} onClick={() => toggleMember(l.code)}
                className={`px-3 py-1 rounded-full text-sm border ${
                  form.memberLedgers.includes(l.code) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300'
                }`}>
                {l.code}{form.memberLedgers[0] === l.code ? ' ★' : ''}
              </button>
            ))}
          </div>
        </div>
        <button disabled={!form.code || form.memberLedgers.length === 0} onClick={create}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          <Plus className="w-4 h-4" /> Create Group
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-sm text-gray-600">As of</label>
        <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 mb-6">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Group</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Members</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Leading</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {groups.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No ledger groups yet.</td></tr>
            )}
            {groups.map((g) => (
              <tr key={g.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{g.code}<div className="text-xs text-gray-400">{g.description}</div></td>
                <td className="px-4 py-3 text-sm text-gray-600">{(g.memberLedgers ?? []).join(', ')}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{g.leadingLedger ?? '—'}</td>
                <td className="px-4 py-3 text-sm">
                  <button onClick={() => reconcile(g.code)} className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800">
                    <GitCompare className="w-4 h-4" /> Reconcile
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {recon && (
        <div className={`rounded-lg border p-5 ${recon.inBalance ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className="font-semibold mb-3 text-gray-800">
            Reconciliation — {activeGroup} (leading: {recon.leadingLedger}){' '}
            <span className={recon.inBalance ? 'text-green-700' : 'text-amber-700'}>
              {recon.inBalance ? '✓ In balance' : '⚠ Differences found'}
            </span>
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                  {(recon.ledgers ?? []).map((code: string) => (
                    <th key={code} className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">{code}</th>
                  ))}
                  {(recon.ledgers ?? []).filter((c: string) => c !== recon.leadingLedger).map((code: string) => (
                    <th key={`d-${code}`} className="px-4 py-2 text-right text-xs font-medium text-amber-600 uppercase">Δ {code}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {(recon.rows ?? []).map((r: any) => (
                  <tr key={r.accountId} className={r.hasDifference ? 'bg-amber-50' : ''}>
                    <td className="px-4 py-2 text-sm text-gray-800"><span className="font-mono text-gray-500">{r.code}</span> {r.name}</td>
                    {(recon.ledgers ?? []).map((code: string) => (
                      <td key={code} className="px-4 py-2 text-sm text-right font-mono text-gray-700">{money(r.balances?.[code] ?? 0)}</td>
                    ))}
                    {(recon.ledgers ?? []).filter((c: string) => c !== recon.leadingLedger).map((code: string) => (
                      <td key={`d-${code}`} className={`px-4 py-2 text-sm text-right font-mono ${Math.abs(r.differences?.[code] ?? 0) >= 0.01 ? 'text-amber-700 font-semibold' : 'text-gray-400'}`}>
                        {money(r.differences?.[code] ?? 0)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Posting Rules tab ──────────────────────────────────────────────────────────

function RulesTab() {
  const [rules, setRules] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<any[]>([]);
  const [source, setSource] = useState('FIXED_ASSETS');
  const [selected, setSelected] = useState<string[]>([]);

  const refetch = useCallback(async () => {
    setRules(unwrap(await financeApi.getLedgerPostingRules()));
    setLedgers(unwrap(await financeApi.getLedgers()));
  }, []);
  useEffect(() => { refetch(); }, [refetch]);

  const toggle = (code: string) =>
    setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));

  const save = async () => {
    try { await financeApi.upsertLedgerPostingRule({ source, ledgerCodes: selected }); setSelected([]); await refetch(); }
    catch (e: any) { alert(e?.response?.data?.message ?? 'Failed to save rule'); }
  };

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h3 className="text-base font-medium text-gray-800 mb-3">Configure Posting Rule</h3>
        <p className="text-xs text-gray-500 mb-3">Choose which ledgers a transaction source posts into. With no rule, postings go to the leading ledger only.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <select value={source} onChange={(e) => setSource(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {ledgers.map((l) => (
            <button key={l.code} onClick={() => toggle(l.code)}
              className={`px-3 py-1 rounded-full text-sm border ${
                selected.includes(l.code) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-600 border-gray-300'
              }`}>{l.code}</button>
          ))}
        </div>
        <button disabled={selected.length === 0} onClick={save}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          Save Rule
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Posts To</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Active</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {rules.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No posting rules — all sources post to the leading ledger.</td></tr>
            )}
            {rules.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-800">{r.source}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{(r.ledgerCodes ?? []).join(', ')}</td>
                <td className="px-4 py-3 text-sm">{r.isActive ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
