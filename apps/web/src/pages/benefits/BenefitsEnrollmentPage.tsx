import { useState, useEffect } from 'react';
import { benefitsEnrollmentApi } from '../../api/benefitsEnrollment';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EVENT_TYPES = ['HIRE', 'MARRIAGE', 'BIRTH', 'DIVORCE', 'DEATH', 'ADOPTION', 'TERMINATION'];
const WINDOW_STATUS: Record<string, string> = { SCHEDULED: 'bg-gray-100 text-gray-600', OPEN: 'bg-green-100 text-green-700', CLOSED: 'bg-red-100 text-red-700' };
const EVENT_STATUS: Record<string, string> = { OPEN: 'bg-blue-100 text-blue-700', COMPLETED: 'bg-green-100 text-green-700', EXPIRED: 'bg-gray-100 text-gray-400' };

function WindowsTab() {
  const [windows, setWindows] = useState<any[]>([]);
  const [form, setForm] = useState({ name: '', planYear: new Date().getFullYear(), startDate: '', endDate: '' });

  useEffect(() => { load(); }, []);
  async function load() { setWindows(unwrap(await benefitsEnrollmentApi.listWindows())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await benefitsEnrollmentApi.createWindow(form); setForm({ name: '', planYear: new Date().getFullYear(), startDate: '', endDate: '' }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-5 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <div className="col-span-2"><label className="text-xs text-gray-500">Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Start</label><input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">End</label><input type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Window</button>
      </form>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Year</th><th className="px-3 py-2 text-left">Window</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">
            {windows.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No windows.</td></tr> : windows.map((w) => (
              <tr key={w.id}>
                <td className="px-3 py-2 font-medium">{w.name}</td>
                <td className="px-3 py-2">{w.planYear}</td>
                <td className="px-3 py-2 text-xs">{w.startDate} → {w.endDate}</td>
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${WINDOW_STATUS[w.status]}`}>{w.status}</span></td>
                <td className="px-3 py-2"><div className="flex gap-2">
                  {w.status !== 'OPEN' && <button onClick={async () => { await benefitsEnrollmentApi.setWindowStatus(w.id, 'OPEN'); load(); }} className="text-green-600 text-xs hover:underline">open</button>}
                  {w.status === 'OPEN' && <button onClick={async () => { await benefitsEnrollmentApi.setWindowStatus(w.id, 'CLOSED'); load(); }} className="text-red-500 text-xs hover:underline">close</button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LifeEventsTab() {
  const [events, setEvents] = useState<any[]>([]);
  const [form, setForm] = useState({ employeeId: '', eventType: 'MARRIAGE', eventDate: '' });

  useEffect(() => { load(); }, []);
  async function load() { setEvents(unwrap(await benefitsEnrollmentApi.listLifeEvents())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await benefitsEnrollmentApi.recordLifeEvent(form); setForm({ employeeId: '', eventType: 'MARRIAGE', eventDate: '' }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <div><label className="text-xs text-gray-500">Employee ID</label><input required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Event</label><select value={form.eventType} onChange={(e) => setForm({ ...form, eventType: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">{EVENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div><label className="text-xs text-gray-500">Event Date</label><input type="date" required value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Record Event</button>
      </form>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Employee</th><th className="px-3 py-2 text-left">Event</th><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Election Deadline</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">
            {events.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No life events.</td></tr> : events.map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2 font-mono text-xs">{e.employeeId?.slice(0, 8)}</td>
                <td className="px-3 py-2">{e.eventType}</td>
                <td className="px-3 py-2 text-xs">{e.eventDate}</td>
                <td className="px-3 py-2 text-xs">{e.electionDeadline}</td>
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${EVENT_STATUS[e.status]}`}>{e.status}</span></td>
                <td className="px-3 py-2">{e.status === 'OPEN' && <button onClick={async () => { await benefitsEnrollmentApi.completeLifeEvent(e.id); load(); }} className="text-green-600 text-xs hover:underline">complete</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeductionTab() {
  const [form, setForm] = useState({ planId: '', payPeriods: 12, annualSalary: 0 });
  const [result, setResult] = useState<any>(null);
  async function compute() {
    if (!form.planId) return;
    try { const r = await benefitsEnrollmentApi.computeDeduction(form); setResult(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-gray-50 grid grid-cols-4 gap-2 items-end">
        <div><label className="text-xs text-gray-500">Plan ID</label><input value={form.planId} onChange={(e) => setForm({ ...form, planId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Pay Periods/yr</label><input type="number" value={form.payPeriods} onChange={(e) => setForm({ ...form, payPeriods: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Annual Salary (% plans)</label><input type="number" value={form.annualSalary} onChange={(e) => setForm({ ...form, annualSalary: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <button onClick={compute} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Compute</button>
      </div>
      {result && (
        <div className="grid grid-cols-4 gap-3">
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Employee / Period</p><p className="text-xl font-bold">{money(result.employeePerPeriod)}</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Employer / Period</p><p className="text-xl font-bold">{money(result.employerPerPeriod)}</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Employee Annual</p><p className="text-xl font-bold">{money(result.employeeAnnual)}</p></div>
          <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Employer Annual</p><p className="text-xl font-bold">{money(result.employerAnnual)}</p></div>
        </div>
      )}
    </div>
  );
}

const TABS = ['Enrollment Windows', 'Life Events', 'Deduction Calculator'];

export default function BenefitsEnrollmentPage() {
  const [tab, setTab] = useState('Enrollment Windows');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Benefits Enrollment</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Benefits parity — open enrollment windows, life-event processing with 30-day election
          windows, eligibility checks, and payroll-deduction computation per plan.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Enrollment Windows' && <WindowsTab />}
      {tab === 'Life Events' && <LifeEventsTab />}
      {tab === 'Deduction Calculator' && <DeductionTab />}
    </div>
  );
}
