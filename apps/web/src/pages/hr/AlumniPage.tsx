import { useState, useEffect } from 'react';
import { Plus, X, Users, UserCheck, LifeBuoy, Award } from 'lucide-react';
import { alumniApi } from '../../api/alumni';

const unwrap = (res: any) => res.data?.data ?? res.data;
const listOf = (res: any) => {
  const p = unwrap(res);
  return Array.isArray(p) ? p : p?.data ?? [];
};

const STATUS_COLORS: Record<string, string> = {
  INVITED: 'bg-amber-100 text-amber-700',
  ACTIVE: 'bg-green-100 text-green-700',
  DEACTIVATED: 'bg-gray-100 text-gray-500',
  OPEN: 'bg-blue-100 text-blue-700',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-100 text-gray-500',
};

function InviteModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ employeeId: '', fullName: '', personalEmail: '', exitDate: '', lastRole: '', rehireEligible: true });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await alumniApi.invite({
        ...form,
        exitDate: form.exitDate || undefined,
        lastRole: form.lastRole || undefined,
        personalEmail: form.personalEmail || undefined,
      });
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not invite alumni');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Invite Alumni</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Employee ID"
            value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Full name"
            value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Personal email"
            value={form.personalEmail} onChange={e => setForm(p => ({ ...p, personalEmail: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">Exit date
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                value={form.exitDate} onChange={e => setForm(p => ({ ...p, exitDate: e.target.value }))} />
            </label>
            <input className="border rounded-lg px-3 py-2 text-sm self-end" placeholder="Last role"
              value={form.lastRole} onChange={e => setForm(p => ({ ...p, lastRole: e.target.value }))} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.rehireEligible} onChange={e => setForm(p => ({ ...p, rehireEligible: e.target.checked }))} />
            Eligible for rehire
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !form.employeeId.trim() || !form.fullName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Inviting…' : 'Invite'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AlumniPage() {
  const [tab, setTab] = useState<'profiles' | 'rehire' | 'tickets'>('profiles');
  const [profiles, setProfiles] = useState<any[]>([]);
  const [rehire, setRehire] = useState<any[]>([]);
  const [tickets, setTickets] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    const [p, r, t] = await Promise.all([
      alumniApi.listProfiles().catch(() => null),
      alumniApi.rehireCandidates().catch(() => null),
      alumniApi.listTickets().catch(() => null),
    ]);
    if (p) setProfiles(listOf(p));
    if (r) setRehire(listOf(r));
    if (t) setTickets(listOf(t));
  };

  useEffect(() => { load(); }, []);

  const act = async (fn: () => Promise<any>, label: string) => {
    try {
      await fn();
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || `Could not ${label}`);
    }
  };

  const tabs = [
    { key: 'profiles' as const, label: `Profiles (${profiles.length})`, icon: <Users className="h-4 w-4" /> },
    { key: 'rehire' as const, label: `Rehire Candidates (${rehire.length})`, icon: <Award className="h-4 w-4" /> },
    { key: 'tickets' as const, label: `Tickets (${tickets.length})`, icon: <LifeBuoy className="h-4 w-4" /> },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Alumni Network</h1>
          <p className="text-sm text-gray-500">Post-exit relationships: directory, rehire pipeline and alumni support tickets. Completed exits invite alumni automatically.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700">
          <Plus className="h-4 w-4" />Invite Alumni
        </button>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm flex items-center gap-1.5 border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-500'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab !== 'tickets' && (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="p-3">Name</th><th>Last role</th><th>Exit date</th><th>Tenure</th><th>Rehire</th><th>Status</th><th className="text-right pr-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(tab === 'profiles' ? profiles : rehire).length === 0 && (
                <tr><td colSpan={7} className="p-4 text-center text-gray-400">No alumni here yet.</td></tr>
              )}
              {(tab === 'profiles' ? profiles : rehire).map(a => (
                <tr key={a.id}>
                  <td className="p-3 font-medium">{a.fullName}</td>
                  <td>{a.lastRole ?? '—'}</td>
                  <td>{a.exitDate ?? '—'}</td>
                  <td>{a.tenureMonths != null ? `${Math.round(a.tenureMonths / 12 * 10) / 10} yrs` : '—'}</td>
                  <td>{a.rehireEligible ? '✓' : '—'}</td>
                  <td><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[a.status] ?? ''}`}>{a.status}</span></td>
                  <td className="text-right pr-3 space-x-2">
                    {a.status === 'INVITED' && (
                      <button onClick={() => act(() => alumniApi.activate(a.id), 'activate')} className="text-green-600 text-xs inline-flex items-center gap-0.5"><UserCheck className="h-3.5 w-3.5" />Activate</button>
                    )}
                    {a.status === 'ACTIVE' && (
                      <button onClick={() => act(() => alumniApi.deactivate(a.id), 'deactivate')} className="text-gray-500 text-xs">Deactivate</button>
                    )}
                    <button onClick={() => {
                      const subject = prompt('Ticket subject (e.g. payslip request)');
                      if (subject) act(() => alumniApi.createTicket(a.id, { subject }), 'raise ticket');
                    }} className="text-blue-600 text-xs">Raise Ticket</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'tickets' && (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="p-3">Subject</th><th>Alumni</th><th>Status</th><th className="text-right pr-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tickets.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-gray-400">No alumni tickets.</td></tr>}
              {tickets.map(t => (
                <tr key={t.id}>
                  <td className="p-3">{t.subject}</td>
                  <td>{t.alumniName ?? t.profileId ?? '—'}</td>
                  <td><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status] ?? ''}`}>{t.status}</span></td>
                  <td className="text-right pr-3 space-x-2">
                    {t.status === 'OPEN' && (
                      <button onClick={() => {
                        const resolution = prompt('Resolution note');
                        act(() => alumniApi.resolveTicket(t.id, resolution ? { resolution } : undefined), 'resolve ticket');
                      }} className="text-green-600 text-xs">Resolve</button>
                    )}
                    {t.status === 'RESOLVED' && (
                      <button onClick={() => act(() => alumniApi.closeTicket(t.id), 'close ticket')} className="text-gray-500 text-xs">Close</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <InviteModal onClose={() => setShowModal(false)} onDone={() => { setShowModal(false); load(); }} />}
    </div>
  );
}
