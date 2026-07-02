import { useState, useEffect } from 'react';
import { projectResourcesApi } from '../../api/projectResources';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const RSTATUS: Record<string, string> = { OPEN: 'bg-amber-100 text-amber-700', FULFILLED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700' };
const FLAG: Record<string, string> = { OVER: 'bg-red-100 text-red-700', UNDER: 'bg-amber-100 text-amber-700', OK: 'bg-green-100 text-green-700' };

function PoolTab() {
  const [resources, setResources] = useState<any[]>([]);
  const emptyForm = { employeeId: '', name: '', skills: '', grade: '', weeklyCapacityHours: 40 };
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  useEffect(() => { load(); }, []);
  async function load() { setResources(unwrap(await projectResourcesApi.list())); }
  function editResource(r: any) {
    setEditingId(r.id);
    setForm({ employeeId: r.employeeId ?? '', name: r.name ?? '', skills: (r.skills ?? []).join(', '), grade: r.grade ?? '', weeklyCapacityHours: Number(r.weeklyCapacityHours) || 40 });
  }
  function cancelEdit() { setEditingId(null); setForm(emptyForm); }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form, skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean) };
    try {
      if (editingId) await projectResourcesApi.update(editingId, payload);
      else await projectResourcesApi.create(payload);
      cancelEdit(); load();
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="grid grid-cols-6 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="Employee ID" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input required placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Skills (csv)" value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} className="col-span-2 border rounded px-2 py-1 text-sm" />
        <input placeholder="Grade" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <div className="flex gap-1">
          <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">{editingId ? 'Save' : '+ Resource'}</button>
          {editingId && <button type="button" onClick={cancelEdit} className="border px-2 py-1 rounded text-sm">Cancel</button>}
        </div>
      </form>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Skills</th><th className="px-3 py-2 text-left">Grade</th><th className="px-3 py-2 text-right">Capacity</th><th className="px-3 py-2"></th></tr></thead>
        <tbody className="divide-y">
          {resources.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No resources.</td></tr> : resources.map((r) => (
            <tr key={r.id}><td className="px-3 py-2 font-medium">{r.name}</td><td className="px-3 py-2 text-xs">{(r.skills ?? []).join(', ')}</td><td className="px-3 py-2">{r.grade ?? '—'}</td><td className="px-3 py-2 text-right">{r.weeklyCapacityHours}h</td><td className="px-3 py-2 text-right"><button onClick={() => editResource(r)} className="text-xs text-indigo-600 hover:underline">Edit</button></td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RequestsTab() {
  const [requests, setRequests] = useState<any[]>([]);
  const [resources, setResources] = useState<any[]>([]);
  const [form, setForm] = useState({ projectId: '', skill: '', hoursNeeded: 20, startWeek: '2026-W25' });
  useEffect(() => { load(); }, []);
  async function load() { setRequests(unwrap(await projectResourcesApi.listRequests())); setResources(unwrap(await projectResourcesApi.list())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await projectResourcesApi.createRequest(form); setForm({ projectId: '', skill: '', hoursNeeded: 20, startWeek: '2026-W25' }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function fulfill(id: string) {
    const rid = prompt('Resource ID to assign?'); if (!rid) return;
    try { await projectResourcesApi.fulfill(id, rid); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-5 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="Project ID" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono" />
        <input required placeholder="Skill" value={form.skill} onChange={(e) => setForm({ ...form, skill: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input type="number" placeholder="Hours" value={form.hoursNeeded} onChange={(e) => setForm({ ...form, hoursNeeded: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Week" value={form.startWeek} onChange={(e) => setForm({ ...form, startWeek: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">Request</button>
      </form>
      <p className="text-xs text-gray-400">{resources.length} resources in pool</p>
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Skill</th><th className="px-3 py-2 text-left">Grade</th><th className="px-3 py-2 text-right">Hours</th><th className="px-3 py-2 text-left">Week</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
        <tbody className="divide-y">
          {requests.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No requests.</td></tr> : requests.map((r) => (
            <tr key={r.id}>
              <td className="px-3 py-2">{r.skill}</td><td className="px-3 py-2">{r.grade ?? '—'}</td><td className="px-3 py-2 text-right">{r.hoursNeeded}</td><td className="px-3 py-2">{r.startWeek ?? '—'}</td>
              <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${RSTATUS[r.status]}`}>{r.status}</span></td>
              <td className="px-3 py-2 text-right whitespace-nowrap">{r.status === 'OPEN' && <><button onClick={() => fulfill(r.id)} className="text-green-600 text-xs hover:underline mr-2">fulfill</button><button onClick={async () => { await projectResourcesApi.reject(r.id); load(); }} className="text-red-500 text-xs hover:underline">reject</button></>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UtilizationTab() {
  const [week, setWeek] = useState('2026-W25');
  const [data, setData] = useState<any>(null);
  const [alloc, setAlloc] = useState({ resourceId: '', projectId: '', allocatedHours: 20, billable: true });
  async function load() { try { const r = await projectResourcesApi.utilization(week); setData(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function allocate(e: React.FormEvent) {
    e.preventDefault();
    try { await projectResourcesApi.allocate({ ...alloc, week }); setAlloc({ resourceId: '', projectId: '', allocatedHours: 20, billable: true }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div><label className="text-xs text-gray-500">Week (YYYY-Www)</label><input value={week} onChange={(e) => setWeek(e.target.value)} className="w-32 border rounded px-2 py-1 text-sm" /></div>
        <button onClick={load} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Load Utilization</button>
      </div>
      <form onSubmit={allocate} className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input required placeholder="Resource ID" value={alloc.resourceId} onChange={(e) => setAlloc({ ...alloc, resourceId: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono" />
        <input required placeholder="Project ID" value={alloc.projectId} onChange={(e) => setAlloc({ ...alloc, projectId: e.target.value })} className="border rounded px-2 py-1 text-sm font-mono" />
        <input type="number" placeholder="Hours" value={alloc.allocatedHours} onChange={(e) => setAlloc({ ...alloc, allocatedHours: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" />
        <button type="submit" className="bg-gray-700 text-white px-2 py-1 rounded text-sm">Allocate</button>
      </form>
      {data && (
        <>
          <div className="flex gap-4 text-sm">
            <span>Team Util: <strong>{data.teamUtilizationPct}%</strong></span>
            <span>Billable: <strong>{data.teamBillablePct}%</strong></span>
            <span className="text-red-600">Over: <strong>{data.overAllocated}</strong></span>
            <span className="text-amber-600">Under: <strong>{data.underAllocated}</strong></span>
          </div>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Resource</th><th className="px-3 py-2 text-right">Capacity</th><th className="px-3 py-2 text-right">Allocated</th><th className="px-3 py-2 text-right">Util%</th><th className="px-3 py-2 text-right">Billable%</th><th className="px-3 py-2 text-left">Flag</th></tr></thead>
            <tbody className="divide-y">
              {(data.resources ?? []).map((r: any) => (
                <tr key={r.resourceId}><td className="px-3 py-2 font-medium">{r.name}</td><td className="px-3 py-2 text-right">{r.capacity}</td><td className="px-3 py-2 text-right">{r.allocated}</td><td className="px-3 py-2 text-right font-bold">{r.utilizationPct}%</td><td className="px-3 py-2 text-right">{r.billablePct}%</td><td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${FLAG[r.flag]}`}>{r.flag}</span></td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

const TABS = ['Resource Pool', 'Requests', 'Utilization'];

export default function ResourcesPage() {
  const [tab, setTab] = useState('Resource Pool');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Resource Management</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Project Resource Management parity — a skills-tagged resource pool with capacity, skill-based
          resource requests fulfilled from the pool, and weekly utilization with over/under-allocation alerts.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Resource Pool' && <PoolTab />}
      {tab === 'Requests' && <RequestsTab />}
      {tab === 'Utilization' && <UtilizationTab />}
    </div>
  );
}
