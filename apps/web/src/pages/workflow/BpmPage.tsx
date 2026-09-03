import { useState, useEffect } from 'react';
import { bpmApi } from '../../api/bpm';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const now = '2026-06-05T09:00:00Z';
const TSTATUS: Record<string, string> = { PENDING: 'bg-amber-100 text-amber-700', APPROVED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700', ESCALATED: 'bg-purple-100 text-purple-700', SKIPPED: 'bg-gray-100 text-gray-400' };

function ProcessesTab() {
  const [processes, setProcesses] = useState<any[]>([]);
  const [form, setForm] = useState({ code: '', name: '', stages: 's1:Peer:u1,u2:ALL:24:boss | s2:Manager:mgr:ANY::' });
  useEffect(() => { load(); }, []);
  async function load() { setProcesses(unwrap(await bpmApi.listProcesses())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const stages = form.stages.split('|').map((s) => {
      const [id, name, approvers, mode, escHours, escTo] = s.trim().split(':');
      return { id, name, approvers: approvers.split(',').map((a) => a.trim()), mode, escalationHours: escHours ? Number(escHours) : undefined, escalateTo: escTo || undefined };
    });
    try { await bpmApi.createProcess({ code: form.code, name: form.name, stages, swimlanes: [...new Set(stages.map((s) => s.name))] }); setForm({ code: '', name: '', stages: form.stages }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function start(id: string) {
    const ref = prompt('Subject reference (e.g. PO-1)?'); if (!ref) return;
    try { const r = await bpmApi.start(id, ref, now); const d = r.data?.data ?? r.data; alert(`Instance started at stage ${d.activeStage}`); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={create} className="space-y-2 bg-gray-50 p-3 rounded-lg">
        <div className="flex gap-2">
          <input required placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-32 border rounded px-2 py-1 text-sm" />
          <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="flex-1 border rounded px-2 py-1 text-sm" />
        </div>
        <input value={form.stages} onChange={(e) => setForm({ ...form, stages: e.target.value })} className="w-full border rounded px-2 py-1 text-xs font-mono" />
        <p className="text-[10px] text-gray-400">Stages: id:name:approvers(csv):mode(ALL|ANY):escHours:escalateTo, separated by |</p>
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Create Process</button>
      </form>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Stages</th><th className="px-3 py-2" /></tr></thead>
        <tbody className="divide-y">
          {processes.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No processes.</td></tr> : processes.map((p) => (
            <tr key={p.id}><td className="px-3 py-2 font-mono text-xs">{p.code}</td><td className="px-3 py-2">{p.name}</td><td className="px-3 py-2 text-xs">{(p.stages ?? []).map((s: any) => `${s.name} (${s.mode})`).join(' → ')}</td><td className="px-3 py-2 text-right"><button onClick={() => start(p.id)} className="text-indigo-600 text-xs hover:underline">start</button></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InboxTab() {
  const [assignedTo, setAssignedTo] = useState('u1');
  const [tasks, setTasks] = useState<any[]>([]);
  async function load() { setTasks(unwrap(await bpmApi.listTasks(assignedTo))); }
  async function decide(id: string, decision: 'APPROVE' | 'REJECT') {
    try { await bpmApi.decide(id, decision, now); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function escalate() {
    try { const r = await bpmApi.checkEscalations('2026-06-10T09:00:00Z'); const d = r.data?.data ?? r.data; alert(`Escalated ${d.escalatedCount} task(s)`); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div><label className="text-xs text-gray-500">Approver</label><input value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="w-40 border rounded px-2 py-1 text-sm font-mono" /></div>
        <button onClick={load} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Load Inbox</button>
        <button onClick={escalate} className="bg-purple-600 text-white px-3 py-1.5 rounded text-sm">Run Escalations</button>
      </div>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Stage</th><th className="px-3 py-2 text-left">Mode</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Due</th><th className="px-3 py-2" /></tr></thead>
        <tbody className="divide-y">
          {tasks.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No tasks.</td></tr> : tasks.map((t) => (
            <tr key={t.id}>
              <td className="px-3 py-2 font-mono text-xs">{t.stageId}</td>
              <td className="px-3 py-2">{t.mode}</td>
              <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${TSTATUS[t.status]}`}>{t.status}</span></td>
              <td className="px-3 py-2 text-xs">{t.dueAt ? String(t.dueAt).slice(0, 10) : '—'}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">{(t.status === 'PENDING' || t.status === 'ESCALATED') && <><button onClick={() => decide(t.id, 'APPROVE')} className="text-green-600 text-xs hover:underline mr-2">approve</button><button onClick={() => decide(t.id, 'REJECT')} className="text-red-500 text-xs hover:underline">reject</button></>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DelegationTab() {
  const [form, setForm] = useState({ userId: '', delegateId: '', fromDate: '2026-06-01', toDate: '2026-06-10' });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await bpmApi.setDelegation(form); alert('Delegation set'); setForm({ userId: '', delegateId: '', fromDate: '2026-06-01', toDate: '2026-06-10' }); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <form onSubmit={save} className="grid grid-cols-4 gap-2 bg-gray-50 p-4 rounded-lg items-end max-w-3xl">
      <input required placeholder="User ID" value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono" />
      <input required placeholder="Delegate ID" value={form.delegateId} onChange={(e) => setForm({ ...form, delegateId: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono" />
      <input type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} className="border rounded px-2 py-1 text-sm" />
      <div className="flex gap-2"><input type="date" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} className="border rounded px-2 py-1 text-sm" /><button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Set</button></div>
    </form>
  );
}

const TABS = ['Processes', 'Approval Inbox', 'Delegation'];

export default function BpmPage() {
  const [tab, setTab] = useState('Processes');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Workflow & BPM</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle BPM parity — multi-stage processes with parallel approver routing (all-must / any-one),
          time-based escalation to a supervisor, vacation/delegation proxy routing, and a stage/swimlane designer.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Processes' && <ProcessesTab />}
      {tab === 'Approval Inbox' && <InboxTab />}
      {tab === 'Delegation' && <DelegationTab />}
    </div>
  );
}
