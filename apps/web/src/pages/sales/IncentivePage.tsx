import { useState, useEffect } from 'react';
import { incentiveApi } from '../../api/incentive';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS: Record<string, string> = {
  CALCULATED: 'bg-blue-100 text-blue-700', DISPUTED: 'bg-amber-100 text-amber-700', APPROVED: 'bg-green-100 text-green-700', PAID: 'bg-purple-100 text-purple-700',
};

function PlansTab() {
  const [plans, setPlans] = useState<any[]>([]);
  const [form, setForm] = useState({ code: '', name: '', drawAmount: 0, capAmount: '', tiers: '0:100:0.03, 100:99999:0.06' });
  useEffect(() => { load(); }, []);
  async function load() { setPlans(unwrap(await incentiveApi.listPlans())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const tiers = form.tiers.split(',').map((t) => { const [fromPct, toPct, rate] = t.trim().split(':').map(Number); return { fromPct, toPct, rate }; });
    try { await incentiveApi.createPlan({ code: form.code, name: form.name, drawAmount: form.drawAmount, capAmount: form.capAmount ? Number(form.capAmount) : null, tiers }); setForm({ code: '', name: '', drawAmount: 0, capAmount: '', tiers: '0:100:0.03, 100:99999:0.06' }); load(); }
    catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-5 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Tiers from:to:rate" value={form.tiers} onChange={(e) => setForm({ ...form, tiers: e.target.value })} className="col-span-2 border rounded px-2 py-1 text-sm font-mono text-xs" />
        <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">+ Plan</button>
      </form>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Tiers</th><th className="px-3 py-2 text-right">Draw</th><th className="px-3 py-2 text-right">Cap</th></tr></thead>
        <tbody className="divide-y">
          {plans.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No plans.</td></tr> : plans.map((p) => (
            <tr key={p.id}><td className="px-3 py-2 font-mono text-xs">{p.code}</td><td className="px-3 py-2">{p.name}</td><td className="px-3 py-2 text-xs">{(p.tiers ?? []).map((t: any) => `${t.fromPct}-${t.toPct}%@${t.rate}`).join(', ')}</td><td className="px-3 py-2 text-right">{money(p.drawAmount)}</td><td className="px-3 py-2 text-right">{p.capAmount == null ? '—' : money(p.capAmount)}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommissionsTab() {
  const [plans, setPlans] = useState<any[]>([]);
  const [txns, setTxns] = useState<any[]>([]);
  const [form, setForm] = useState({ planId: '', repId: '', period: '2026-06', bookingAmount: 0, attainmentPct: 100, creditPct: 100, productFamily: '' });

  useEffect(() => { incentiveApi.listPlans().then((r) => setPlans(unwrap(r))); load(); }, []);
  async function load() { setTxns(unwrap(await incentiveApi.listTransactions())); }
  async function calc(e: React.FormEvent) {
    e.preventDefault();
    try { await incentiveApi.calculate(form); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function act(fn: () => Promise<any>) { try { await fn(); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function dispute(id: string) { const reason = prompt('Dispute reason?'); if (!reason) return; act(() => incentiveApi.raiseDispute({ transactionId: id, repId: 'rep', reason })); }
  async function payroll() { try { const r = await incentiveApi.payrollExport(form.period); const d = r.data?.data ?? r.data; alert(`Exported ${d.exported} payroll element(s), total ${money(d.totalAmount)}`); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }

  return (
    <div className="space-y-3">
      <form onSubmit={calc} className="grid grid-cols-7 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <select required value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })} className="border rounded px-2 py-1 text-sm"><option value="">Plan</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.code}</option>)}</select>
        <input required placeholder="Rep" value={form.repId} onChange={(e) => setForm({ ...form, repId: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Period" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input type="number" placeholder="Booking" value={form.bookingAmount} onChange={(e) => setForm({ ...form, bookingAmount: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" />
        <input type="number" placeholder="Attain%" value={form.attainmentPct} onChange={(e) => setForm({ ...form, attainmentPct: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Product fam" value={form.productFamily} onChange={(e) => setForm({ ...form, productFamily: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">Calculate</button>
      </form>
      <div className="flex justify-end"><button onClick={payroll} className="bg-purple-600 text-white px-3 py-1.5 rounded text-sm">Export {form.period} to Payroll</button></div>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-2 py-2 text-left">Rep</th><th className="px-2 py-2 text-left">Period</th><th className="px-2 py-2 text-right">Booking</th><th className="px-2 py-2 text-right">Rate</th><th className="px-2 py-2 text-right">Gross</th><th className="px-2 py-2 text-right">Net</th><th className="px-2 py-2 text-left">Status</th><th className="px-2 py-2" /></tr></thead>
        <tbody className="divide-y">
          {txns.length === 0 ? <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No commissions.</td></tr> : txns.map((t) => (
            <tr key={t.id}>
              <td className="px-2 py-2 font-mono text-xs">{t.repId}</td>
              <td className="px-2 py-2">{t.period}</td>
              <td className="px-2 py-2 text-right">{money(t.bookingAmount)}</td>
              <td className="px-2 py-2 text-right">{t.appliedRate}{t.acceleratorMult > 1 ? `×${t.acceleratorMult}` : ''}</td>
              <td className="px-2 py-2 text-right">{money(t.grossCommission)}</td>
              <td className="px-2 py-2 text-right font-medium">{money(t.netPayable)}</td>
              <td className="px-2 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${STATUS[t.status]}`}>{t.status}</span></td>
              <td className="px-2 py-2 text-right whitespace-nowrap">
                {t.status === 'CALCULATED' && <><button onClick={() => act(() => incentiveApi.approve(t.id))} className="text-green-600 text-xs hover:underline mr-2">approve</button><button onClick={() => dispute(t.id)} className="text-amber-600 text-xs hover:underline">dispute</button></>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = ['Plans', 'Commissions'];

export default function IncentivePage() {
  const [tab, setTab] = useState('Plans');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Incentive Compensation</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Incentive Compensation parity — plans with attainment tiers, product accelerators, caps and
          draws; commission calculation with split credits; dispute management; and payroll export.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Plans' && <PlansTab />}
      {tab === 'Commissions' && <CommissionsTab />}
    </div>
  );
}
