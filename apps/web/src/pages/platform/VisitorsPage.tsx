import { useState, useEffect } from 'react';
import { Plus, X, DoorOpen, LogIn, LogOut, Timer } from 'lucide-react';
import { deviceApi } from '../../api/device';

const unwrap = (res: any) => res.data?.data ?? res.data;
const listOf = (res: any) => {
  const p = unwrap(res);
  return Array.isArray(p) ? p : p?.data ?? [];
};

const STATUS_COLORS: Record<string, string> = {
  PRE_REGISTERED: 'bg-amber-100 text-amber-700',
  CHECKED_IN: 'bg-green-100 text-green-700',
  CHECKED_OUT: 'bg-gray-100 text-gray-500',
  NO_SHOW: 'bg-red-100 text-red-700',
};

function VisitorModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ fullName: '', company: '', email: '', hostEmployeeId: '', purpose: '', expectedAt: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await deviceApi.preRegister({
        fullName: form.fullName,
        company: form.company || undefined,
        email: form.email || undefined,
        hostEmployeeId: form.hostEmployeeId || undefined,
        purpose: form.purpose || undefined,
        expectedAt: form.expectedAt ? new Date(form.expectedAt).toISOString() : undefined,
      });
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not pre-register visitor');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Pre-register Visitor</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Full name"
            value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Company"
              value={form.company} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Email"
              value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Host employee ID"
              value={form.hostEmployeeId} onChange={e => setForm(p => ({ ...p, hostEmployeeId: e.target.value }))} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Purpose"
              value={form.purpose} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))} />
          </div>
          <label className="block text-xs text-gray-500">Expected arrival
            <input type="datetime-local" className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
              value={form.expectedAt} onChange={e => setForm(p => ({ ...p, expectedAt: e.target.value }))} />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !form.fullName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Registering…' : 'Pre-register'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function VisitorsPage() {
  const [visitors, setVisitors] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    const res = await deviceApi.listVisitors(statusFilter || undefined).catch(() => null);
    if (res) setVisitors(listOf(res));
  };

  useEffect(() => { load(); }, [statusFilter]);

  const act = async (fn: () => Promise<any>, label: string) => {
    try {
      await fn();
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || `Could not ${label}`);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><DoorOpen className="h-5 w-5" />Visitor Management</h1>
          <p className="text-sm text-gray-500">Reception kiosk: pre-registration, badge check-in/out. Overdue pre-registrations flip to NO_SHOW via the hourly sweep.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => act(() => deviceApi.noShowSweep(), 'run no-show sweep')}
            className="px-3 py-2 border rounded-lg text-sm flex items-center gap-1"><Timer className="h-4 w-4" />No-show Sweep</button>
          <button onClick={() => setShowModal(true)} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700">
            <Plus className="h-4 w-4" />Pre-register
          </button>
        </div>
      </div>

      <select className="border rounded-lg px-3 py-2 text-sm bg-white" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
        <option value="">All statuses</option>
        {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
      </select>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="p-3">Visitor</th><th>Host</th><th>Purpose</th><th>Expected</th><th>Badge</th><th>Status</th><th className="text-right pr-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visitors.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-gray-400">No visitors.</td></tr>}
            {visitors.map(v => (
              <tr key={v.id}>
                <td className="p-3">
                  <p className="font-medium">{v.fullName}</p>
                  {v.company && <p className="text-xs text-gray-500">{v.company}</p>}
                </td>
                <td className="text-xs">{v.hostEmployeeId ?? '—'}</td>
                <td className="text-xs">{v.purpose ?? '—'}</td>
                <td className="text-xs">{v.expectedAt ? new Date(v.expectedAt).toLocaleString() : '—'}</td>
                <td className="text-xs">{v.badgeNumber ?? '—'}</td>
                <td><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[v.status] ?? ''}`}>{v.status?.replace(/_/g, ' ')}</span></td>
                <td className="text-right pr-3 space-x-2 whitespace-nowrap">
                  {v.status === 'PRE_REGISTERED' && (
                    <button onClick={() => act(() => deviceApi.checkIn(v.id), 'check in')} className="text-green-600 text-xs inline-flex items-center gap-0.5"><LogIn className="h-3.5 w-3.5" />Check in</button>
                  )}
                  {v.status === 'CHECKED_IN' && (
                    <button onClick={() => act(() => deviceApi.checkOut(v.id), 'check out')} className="text-gray-600 text-xs inline-flex items-center gap-0.5"><LogOut className="h-3.5 w-3.5" />Check out</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && <VisitorModal onClose={() => setShowModal(false)} onDone={() => { setShowModal(false); load(); }} />}
    </div>
  );
}
