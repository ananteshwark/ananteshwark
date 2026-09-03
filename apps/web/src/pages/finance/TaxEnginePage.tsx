import { useState, useEffect } from 'react';
import { financeApi } from '../../api/finance';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

const RULE_TYPES = ['APPLICABILITY', 'STATUS', 'RATE', 'PLACE_OF_SUPPLY'];
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Hierarchy tab ───────────────────────────────────────────────────

function HierarchyTab() {
  const [regimes, setRegimes] = useState<any[]>([]);
  const [taxes, setTaxes] = useState<any[]>([]);
  const [statuses, setStatuses] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [selRegime, setSelRegime] = useState<any>(null);
  const [selTax, setSelTax] = useState<any>(null);
  const [selStatus, setSelStatus] = useState<any>(null);

  useEffect(() => { financeApi.listTaxRegimes().then((r) => setRegimes(unwrap(r))); }, []);

  async function pickRegime(r: any) { setSelRegime(r); setSelTax(null); setSelStatus(null); setStatuses([]); setRates([]); setTaxes(unwrap(await financeApi.listRegimeTaxes(r.id))); }
  async function pickTax(t: any) { setSelTax(t); setSelStatus(null); setRates([]); setStatuses(unwrap(await financeApi.listTaxStatuses(t.id))); }
  async function pickStatus(s: any) { setSelStatus(s); setRates(unwrap(await financeApi.listTaxRates(s.id))); }

  async function addRegime() {
    const code = prompt('Regime code (e.g. IN_GST):'); if (!code) return;
    const name = prompt('Name:') || code;
    await financeApi.createTaxRegime({ code, name, effectiveFrom: '2017-07-01' });
    setRegimes(unwrap(await financeApi.listTaxRegimes()));
  }
  async function addTax() {
    if (!selRegime) return;
    const code = prompt('Tax code (e.g. IGST):'); if (!code) return;
    await financeApi.createZxTax({ regimeId: selRegime.id, code, name: prompt('Name:') || code });
    pickRegime(selRegime);
  }
  async function addStatus() {
    if (!selTax) return;
    const code = prompt('Status code (STANDARD/EXEMPT/ZERO):'); if (!code) return;
    await financeApi.createTaxStatus({ taxId: selTax.id, code, name: code, isDefault: code === 'STANDARD' });
    pickTax(selTax);
  }
  async function addRate() {
    if (!selStatus) return;
    const rate = prompt('Rate %:'); if (rate == null) return;
    await financeApi.createTaxRate({ statusId: selStatus.id, code: `R${rate}`, rate: Number(rate), effectiveFrom: '2017-07-01', isDefault: true });
    pickStatus(selStatus);
  }

  const col = (title: string, items: any[], sel: any, onPick: (x: any) => void, onAdd: () => void, render: (x: any) => string, disabled = false) => (
    <div className="border rounded-lg flex flex-col">
      <div className="px-3 py-2 bg-gray-50 flex justify-between items-center">
        <span className="text-sm font-medium">{title}</span>
        <button onClick={onAdd} disabled={disabled} className="text-xs text-indigo-600 disabled:text-gray-300">+ add</button>
      </div>
      <div className="divide-y overflow-y-auto max-h-80">
        {items.length === 0 ? <p className="p-3 text-xs text-gray-400">{disabled ? 'select parent' : 'none'}</p> : items.map((x) => (
          <div key={x.id} onClick={() => onPick(x)} className={`px-3 py-2 text-sm cursor-pointer hover:bg-gray-50 ${sel?.id === x.id ? 'bg-indigo-50' : ''}`}>{render(x)}</div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-4 gap-3">
      {col('Regimes', regimes, selRegime, pickRegime, addRegime, (x) => `${x.code} — ${x.name}`)}
      {col('Taxes', taxes, selTax, pickTax, addTax, (x) => `${x.code} — ${x.name}`, !selRegime)}
      {col('Statuses', statuses, selStatus, pickStatus, addStatus, (x) => `${x.code}${x.isDefault ? ' ★' : ''}`, !selTax)}
      {col('Rates', rates, null, () => {}, addRate, (x) => `${x.code}: ${x.rate}%${x.isDefault ? ' ★' : ''}`, !selStatus)}
    </div>
  );
}

// ─── Rules tab ───────────────────────────────────────────────────────

function RulesTab() {
  const [regimes, setRegimes] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [regimeId, setRegimeId] = useState('');

  useEffect(() => { financeApi.listTaxRegimes().then((r) => setRegimes(unwrap(r))); load(); }, []);
  async function load(rid?: string) { setRules(unwrap(await financeApi.listTaxRules(rid || undefined))); }

  async function addRule() {
    if (!regimeId) { alert('Pick a regime filter first'); return; }
    const name = prompt('Rule name:'); if (!name) return;
    const ruleType = prompt(`Rule type (${RULE_TYPES.join('/')}):`, 'APPLICABILITY'); if (!ruleType) return;
    const condStr = prompt('Condition JSON (blank = always):', '{"field":"intraState","op":"isFalse"}');
    let conditionExpression = null;
    if (condStr && condStr.trim()) { try { conditionExpression = JSON.parse(condStr); } catch { alert('Bad JSON'); return; } }
    await financeApi.createTaxRule({ regimeId, name, ruleType, conditionExpression, resultApplicable: ruleType === 'APPLICABILITY' ? false : undefined });
    load(regimeId);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <select value={regimeId} onChange={(e) => { setRegimeId(e.target.value); load(e.target.value); }} className="border rounded px-2 py-1 text-sm">
          <option value="">All regimes</option>
          {regimes.map((r) => <option key={r.id} value={r.id}>{r.code}</option>)}
        </select>
        <button onClick={addRule} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Rule</button>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-right">Priority</th><th className="px-3 py-2 text-left">Condition</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">
            {rules.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No rules.</td></tr> : rules.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2"><span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">{r.ruleType}</span></td>
                <td className="px-3 py-2 text-right">{r.priority}</td>
                <td className="px-3 py-2 text-xs font-mono text-gray-500 max-w-[260px] truncate">{r.conditionExpression ? JSON.stringify(r.conditionExpression) : 'always'}</td>
                <td className="px-3 py-2"><button onClick={async () => { if (confirm('Delete?')) { await financeApi.deleteTaxRule(r.id); load(regimeId); } }} className="text-red-500 text-xs hover:underline">Del</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Determine + report tab ──────────────────────────────────────────

function DetermineTab() {
  const [regimes, setRegimes] = useState<any[]>([]);
  const [form, setForm] = useState({ regimeCode: '', date: '2026-06-26', amount: 10000, intraState: false, itemCategory: '' });
  const [result, setResult] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [report, setReport] = useState<any>(null);
  const [period, setPeriod] = useState({ from: '2026-04-01', to: '2026-06-30' });

  useEffect(() => { financeApi.listTaxRegimes().then((r) => setRegimes(unwrap(r))); }, []);

  async function determine() {
    setError(''); setResult(null);
    try {
      const res = await financeApi.determineTax({ regimeCode: form.regimeCode, context: { date: form.date, amount: form.amount, intraState: form.intraState, itemCategory: form.itemCategory || undefined } });
      setResult(unwrap(res));
    } catch (e: any) { setError(e.response?.data?.message ?? 'Determination failed'); }
  }

  async function runReport() {
    setReport((await financeApi.taxGstr3b(period.from, period.to)).data?.data ?? (await financeApi.taxGstr3b(period.from, period.to)).data);
  }

  return (
    <div className="space-y-6">
      <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
        <h3 className="font-medium text-sm">Tax Determination (dry-run)</h3>
        <div className="grid grid-cols-5 gap-2 items-end">
          <div><label className="text-xs text-gray-500">Regime</label><select value={form.regimeCode} onChange={(e) => setForm({ ...form, regimeCode: e.target.value })} className="w-full border rounded px-2 py-1 text-sm"><option value="">Select…</option>{regimes.map((r) => <option key={r.id} value={r.code}>{r.code}</option>)}</select></div>
          <div><label className="text-xs text-gray-500">Date</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Amount</label><input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Item Category</label><input value={form.itemCategory} onChange={(e) => setForm({ ...form, itemCategory: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div className="flex items-center gap-2"><input type="checkbox" id="intra" checked={form.intraState} onChange={(e) => setForm({ ...form, intraState: e.target.checked })} /><label htmlFor="intra" className="text-sm">Intra-state</label></div>
        </div>
        <button onClick={determine} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Determine</button>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        {result && (
          <table className="w-full text-sm border rounded overflow-hidden mt-2">
            <thead className="bg-white"><tr><th className="px-3 py-2 text-left">Tax</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Base</th><th className="px-3 py-2 text-right">Tax</th><th className="px-3 py-2 text-left">Rules</th></tr></thead>
            <tbody className="divide-y">
              {result.length === 0 ? <tr><td colSpan={6} className="px-3 py-3 text-center text-gray-400">No tax applicable</td></tr> : result.map((t, i) => (
                <tr key={i}><td className="px-3 py-2">{t.taxCode}</td><td className="px-3 py-2">{t.statusCode}</td><td className="px-3 py-2 text-right">{t.rate}%</td><td className="px-3 py-2 text-right">{money(t.baseAmount)}</td><td className="px-3 py-2 text-right font-medium">{money(t.taxAmount)}</td><td className="px-3 py-2 text-xs text-gray-400">{t.rulesApplied.join(', ') || '—'}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <h3 className="font-medium text-sm">GSTR-3B / VAT Return Summary</h3>
        <div className="flex gap-2 items-end">
          <div><label className="text-xs text-gray-500">From</label><input type="date" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} className="border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">To</label><input type="date" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} className="border rounded px-2 py-1 text-sm" /></div>
          <button onClick={runReport} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Run</button>
        </div>
        {report && (
          <div className="grid grid-cols-3 gap-3 mt-2">
            <div className="border rounded p-3"><p className="text-xs text-gray-500">Outward (output) tax</p><p className="text-xl font-bold">{money(report.outwardSupplies?.taxAmount)}</p><p className="text-xs text-gray-400">base {money(report.outwardSupplies?.taxableValue)}</p></div>
            <div className="border rounded p-3"><p className="text-xs text-gray-500">Inward ITC (input)</p><p className="text-xl font-bold">{money(report.inwardSupplies?.itc)}</p><p className="text-xs text-gray-400">base {money(report.inwardSupplies?.taxableValue)}</p></div>
            <div className="border rounded p-3 bg-indigo-50"><p className="text-xs text-gray-500">Net tax payable</p><p className="text-xl font-bold text-indigo-700">{money(report.netTaxPayable)}</p></div>
          </div>
        )}
      </div>
    </div>
  );
}

const TABS = ['Hierarchy', 'Rules', 'Determine & Report'];

export default function TaxEnginePage() {
  const [tab, setTab] = useState('Hierarchy');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Tax Determination Engine</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle ZX parity — Regime → Tax → Status → Rate hierarchy with effective dates, condition-based
          determination rules, party registrations, and VAT/GSTR-3B reporting.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Hierarchy' && <HierarchyTab />}
      {tab === 'Rules' && <RulesTab />}
      {tab === 'Determine & Report' && <DetermineTab />}
    </div>
  );
}
