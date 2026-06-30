import { useState, useEffect } from 'react';
import { otlApi } from '../../api/otl';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const RULE_TYPE: Record<string, string> = {
  DAILY_OT: 'Daily OT', WEEKLY_OT: 'Weekly OT', SEVENTH_DAY: '7th Day', SHIFT_DIFFERENTIAL: 'Differential',
};

function RulesTab() {
  const [rules, setRules] = useState<any[]>([]);
  useEffect(() => { load(); }, []);
  async function load() { setRules(unwrap(await otlApi.listRules())); }
  async function seed() {
    try { await otlApi.seedDefaults(); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <button onClick={seed} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Seed Default Rules</button>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Rule</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-right">Threshold</th><th className="px-3 py-2 text-right">Multiplier</th><th className="px-3 py-2 text-right">Premium %</th><th className="px-3 py-2 text-left">Element</th></tr></thead>
        <tbody className="divide-y">
          {rules.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No rules — seed defaults to start.</td></tr> : rules.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2 font-medium">{r.name}</td>
              <td className="px-3 py-2 text-xs">{RULE_TYPE[r.ruleType] ?? r.ruleType}{r.shiftCondition ? ` · ${r.shiftCondition}` : ''}</td>
              <td className="px-3 py-2 text-right">{Number(r.thresholdHours) || '—'}</td>
              <td className="px-3 py-2 text-right">{Number(r.payMultiplier)}×</td>
              <td className="px-3 py-2 text-right">{Number(r.premiumPct) ? `${r.premiumPct}%` : '—'}</td>
              <td className="px-3 py-2 font-mono text-xs">{r.payElementCode}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const emptyDay = () => ({ date: '', hours: 8, isNight: false, isWeekend: false });

function ProcessTab() {
  const [employeeId, setEmployeeId] = useState('');
  const [periodStart, setPeriodStart] = useState('');
  const [days, setDays] = useState<any[]>([emptyDay()]);
  const [result, setResult] = useState<any>(null);

  function setDay(i: number, patch: any) { setDays(days.map((d, idx) => (idx === i ? { ...d, ...patch } : d))); }
  async function run() {
    if (!employeeId || !periodStart) return;
    try {
      const r = await otlApi.process({ employeeId, periodStart, days: days.filter((d) => d.date) });
      setResult(r.data?.data ?? r.data);
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <div><label className="text-xs text-gray-500">Employee ID</label><input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Period Start</label><input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" /></div>
      </div>
      <div className="space-y-2">
        {days.map((d, i) => (
          <div key={i} className="grid grid-cols-5 gap-2 items-center">
            <input type="date" value={d.date} onChange={(e) => setDay(i, { date: e.target.value })} className="border rounded px-2 py-1 text-sm" />
            <input type="number" step="0.5" value={d.hours} onChange={(e) => setDay(i, { hours: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" placeholder="hours" />
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={d.isNight} onChange={(e) => setDay(i, { isNight: e.target.checked })} /> Night</label>
            <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={d.isWeekend} onChange={(e) => setDay(i, { isWeekend: e.target.checked })} /> Weekend</label>
            {i === days.length - 1 && <button onClick={() => setDays([...days, emptyDay()])} className="text-indigo-600 text-xs hover:underline">+ day</button>}
          </div>
        ))}
      </div>
      <button onClick={run} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Process Timecard</button>
      {result && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Regular</p><p className="text-xl font-bold">{result.regularHours}h</p></div>
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Overtime</p><p className="text-xl font-bold">{result.overtimeHours}h</p></div>
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Premium (7th day)</p><p className="text-xl font-bold">{result.premiumHours}h</p></div>
          </div>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Pay Element</th><th className="px-3 py-2 text-right">Hours</th><th className="px-3 py-2 text-right">Multiplier</th></tr></thead>
            <tbody className="divide-y">
              {(result.elements ?? []).map((e: any) => (
                <tr key={e.code}><td className="px-3 py-2 font-mono text-xs">{e.code}</td><td className="px-3 py-2 text-right">{e.hours}</td><td className="px-3 py-2 text-right">{e.multiplier}×</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AbsenceTab() {
  const [form, setForm] = useState({ scheduledHours: 8, workedHours: 5, approvedLeaveHours: 3, leaveBalanceHours: 16 });
  const [result, setResult] = useState<any>(null);
  async function run() {
    try { const r = await otlApi.reconcileAbsence(form); setResult(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  const field = (k: keyof typeof form, label: string) => (
    <div><label className="text-xs text-gray-500">{label}</label><input type="number" step="0.5" value={form[k]} onChange={(e) => setForm({ ...form, [k]: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
  );
  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-gray-50 grid grid-cols-5 gap-2 items-end">
        {field('scheduledHours', 'Scheduled')}
        {field('workedHours', 'Worked')}
        {field('approvedLeaveHours', 'Approved Leave')}
        {field('leaveBalanceHours', 'Leave Balance')}
        <button onClick={run} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Reconcile</button>
      </div>
      {result && (
        <div className="grid grid-cols-4 gap-3">
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Shortfall</p><p className="text-xl font-bold">{result.shortfall}h</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Leave Applied</p><p className="text-xl font-bold text-green-700">{result.leaveApplied}h</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Unpaid</p><p className="text-xl font-bold text-red-600">{result.unpaidShortfall}h</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Paid Hours</p><p className="text-xl font-bold">{result.paidHours}h</p></div>
        </div>
      )}
    </div>
  );
}

function PayrollTab() {
  const [range, setRange] = useState({ periodStart: '', periodEnd: '' });
  const [data, setData] = useState<any>(null);
  async function run() {
    if (!range.periodStart || !range.periodEnd) return;
    try { const r = await otlApi.payrollExport(range.periodStart, range.periodEnd); setData(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-gray-50 grid grid-cols-3 gap-2 items-end">
        <div><label className="text-xs text-gray-500">Period Start</label><input type="date" value={range.periodStart} onChange={(e) => setRange({ ...range, periodStart: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Period End</label><input type="date" value={range.periodEnd} onChange={(e) => setRange({ ...range, periodEnd: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <button onClick={run} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Export</button>
      </div>
      {data && (
        <div className="space-y-2">
          <p className="text-sm text-gray-500">{data.employees} employee timecard(s)</p>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Pay Element</th><th className="px-3 py-2 text-right">Total Hours</th><th className="px-3 py-2 text-right">Multiplier</th></tr></thead>
            <tbody className="divide-y">
              {(data.elements ?? []).map((e: any) => (
                <tr key={e.code}><td className="px-3 py-2 font-mono text-xs">{e.code}</td><td className="px-3 py-2 text-right font-medium">{e.hours}</td><td className="px-3 py-2 text-right">{e.multiplier}×</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const TABS = ['Time Rules', 'Process Timecard', 'Absence Reconcile', 'Payroll Export'];

export default function TimeLaborPage() {
  const [tab, setTab] = useState('Time Rules');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Time & Labor</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Time & Labor parity — overtime triggers (daily {'>'}8h, weekly {'>'}40h, 7th consecutive day),
          shift differentials, absence reconciliation against approved leave, and payroll-ready time by pay element.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Time Rules' && <RulesTab />}
      {tab === 'Process Timecard' && <ProcessTab />}
      {tab === 'Absence Reconcile' && <AbsenceTab />}
      {tab === 'Payroll Export' && <PayrollTab />}
    </div>
  );
}
