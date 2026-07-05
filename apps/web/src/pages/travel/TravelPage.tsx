import { useState, useEffect } from 'react';
import { Plus, X, Plane, Send, CheckCircle, XCircle, Flag, Ban } from 'lucide-react';
import { travelApi } from '../../api/travel';
import { hrApi } from '../../api/hr';

const MODES = ['FLIGHT', 'TRAIN', 'BUS', 'CAR', 'OTHER'];
const STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  SUBMITTED: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-gray-200 text-gray-500',
};

function NewTripModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [form, setForm] = useState({
    employeeId: '', purpose: '', origin: '', destination: '',
    startDate: '', endDate: '', travelMode: 'FLIGHT', estimatedCost: '', advanceRequested: '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    hrApi.getEmployees({ page: 1, limit: 200 }).then((r: any) =>
      setEmployees(r.data?.items || r.data?.data || []));
  }, []);

  const save = async (submit: boolean) => {
    setSaving(true);
    try {
      await travelApi.createRequest({
        ...form,
        estimatedCost: form.estimatedCost ? parseFloat(form.estimatedCost) : 0,
        advanceRequested: form.advanceRequested ? parseFloat(form.advanceRequested) : 0,
        submit,
      });
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not create travel request');
    } finally {
      setSaving(false);
    }
  };

  const valid = form.employeeId && form.purpose.trim() && form.origin.trim() && form.destination.trim() && form.startDate && form.endDate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Travel Request</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Traveler</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.employeeId}
              onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))}>
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</option>)}
            </select>
          </div>
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Purpose of travel"
            value={form.purpose} onChange={e => setForm(p => ({ ...p, purpose: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="From"
              value={form.origin} onChange={e => setForm(p => ({ ...p, origin: e.target.value }))} />
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="To"
              value={form.destination} onChange={e => setForm(p => ({ ...p, destination: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start date</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End date</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Mode</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.travelMode}
                onChange={e => setForm(p => ({ ...p, travelMode: e.target.value }))}>
                {MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Est. cost</label>
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.estimatedCost} onChange={e => setForm(p => ({ ...p, estimatedCost: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Advance</label>
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.advanceRequested} onChange={e => setForm(p => ({ ...p, advanceRequested: e.target.value }))} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={() => save(false)} disabled={saving || !valid}
            className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Save Draft</button>
          <button onClick={() => save(true)} disabled={saving || !valid}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TravelPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    travelApi.getRequests({ page: 1, limit: 50, ...(statusFilter ? { status: statusFilter } : {}) })
      .then(r => setRequests(r.data?.items || []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter]);

  const act = async (id: string, fn: () => Promise<any>) => {
    setActing(id);
    try { await fn(); load(); } catch (e: any) { alert(e?.response?.data?.message || 'Action failed'); } finally { setActing(null); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Plane className="h-6 w-6 text-blue-600" /> Travel Requests
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Trip approvals and travel advances, linked to expense claims</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus className="h-4 w-4" /> New Trip
        </button>
      </div>

      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : requests.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No travel requests found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Trip', 'Route', 'Dates', 'Mode', 'Est. Cost', 'Advance', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {requests.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <p className="font-mono text-xs">{t.tripNumber}</p>
                    <p className="text-xs text-gray-500 max-w-[160px] truncate">{t.purpose}</p>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{t.origin} → {t.destination}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{t.startDate} → {t.endDate}</td>
                  <td className="px-4 py-2 text-gray-500">{t.travelMode}</td>
                  <td className="px-4 py-2 text-right">{Number(t.estimatedCost || 0).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right">{Number(t.advanceRequested || 0).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[t.status]}`}>{t.status}</span>
                    {t.rejectionReason && <p className="text-xs text-red-500 mt-0.5 max-w-[140px] truncate">{t.rejectionReason}</p>}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      {t.status === 'DRAFT' && (
                        <button onClick={() => act(t.id, () => travelApi.submit(t.id))} disabled={acting === t.id}
                          className="text-blue-600 hover:text-blue-800 p-1" title="Submit">
                          <Send className="h-4 w-4" />
                        </button>
                      )}
                      {t.status === 'SUBMITTED' && (
                        <>
                          <button onClick={() => act(t.id, () => travelApi.approve(t.id))} disabled={acting === t.id}
                            className="text-green-600 hover:text-green-800 p-1" title="Approve">
                            <CheckCircle className="h-4 w-4" />
                          </button>
                          <button onClick={() => {
                            const reason = prompt('Rejection reason?');
                            if (reason) act(t.id, () => travelApi.reject(t.id, reason));
                          }} disabled={acting === t.id}
                            className="text-red-500 hover:text-red-700 p-1" title="Reject">
                            <XCircle className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      {t.status === 'APPROVED' && (
                        <button onClick={() => act(t.id, () => travelApi.complete(t.id))} disabled={acting === t.id}
                          className="text-blue-600 hover:text-blue-800 p-1" title="Mark completed">
                          <Flag className="h-4 w-4" />
                        </button>
                      )}
                      {['DRAFT', 'SUBMITTED', 'APPROVED'].includes(t.status) && (
                        <button onClick={() => { if (confirm('Cancel this trip?')) act(t.id, () => travelApi.cancel(t.id)); }}
                          disabled={acting === t.id} className="text-gray-400 hover:text-gray-600 p-1" title="Cancel">
                          <Ban className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && <NewTripModal onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load(); }} />}
    </div>
  );
}
