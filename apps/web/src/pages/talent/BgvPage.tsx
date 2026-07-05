import { useState, useEffect } from 'react';
import { Plus, X, ShieldCheck, Ban } from 'lucide-react';
import { bgvApi } from '../../api/bgv';

const CHECK_TYPES = ['IDENTITY', 'ADDRESS', 'EDUCATION', 'EMPLOYMENT', 'CRIMINAL', 'REFERENCE', 'CREDIT'];
const CHECK_OUTCOMES = ['IN_PROGRESS', 'CLEAR', 'DISCREPANCY', 'FAILED'];

const CASE_STATUS_COLORS: Record<string, string> = {
  INITIATED: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-200 text-gray-500',
};

const RESULT_COLORS: Record<string, string> = {
  PENDING: 'text-gray-400',
  CLEAR: 'text-green-600',
  DISCREPANCY: 'text-amber-600',
  FAILED: 'text-red-600',
};

const CHECK_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  CLEAR: 'bg-green-100 text-green-700',
  DISCREPANCY: 'bg-amber-100 text-amber-800',
  FAILED: 'bg-red-100 text-red-700',
};

function InitiateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ subjectType: 'APPLICANT', subjectId: '', subjectName: '', packageName: '' });
  const [checks, setChecks] = useState<string[]>(['IDENTITY', 'EDUCATION', 'EMPLOYMENT']);
  const [saving, setSaving] = useState(false);

  const toggle = (t: string) =>
    setChecks(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const save = async () => {
    setSaving(true);
    try {
      await bgvApi.initiate({ ...form, checkTypes: checks });
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not initiate BGV');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Initiate Background Check</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select className="border rounded-lg px-3 py-2 text-sm" value={form.subjectType}
              onChange={e => setForm(p => ({ ...p, subjectType: e.target.value }))}>
              <option value="APPLICANT">Applicant</option>
              <option value="EMPLOYEE">Employee</option>
            </select>
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Package (optional)"
              value={form.packageName} onChange={e => setForm(p => ({ ...p, packageName: e.target.value }))} />
          </div>
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Subject ID (applicant/employee id)"
            value={form.subjectId} onChange={e => setForm(p => ({ ...p, subjectId: e.target.value }))} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Subject name"
            value={form.subjectName} onChange={e => setForm(p => ({ ...p, subjectName: e.target.value }))} />
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Checks to run</label>
            <div className="flex flex-wrap gap-1.5">
              {CHECK_TYPES.map(t => (
                <button key={t} onClick={() => toggle(t)}
                  className={`px-2.5 py-1 rounded-full border text-xs ${checks.includes(t) ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 hover:bg-gray-50'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !form.subjectId.trim() || !form.subjectName.trim() || checks.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Initiating…' : 'Initiate'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CaseDrawer({ caseId, onClose, onChanged }: { caseId: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);

  const load = () => bgvApi.getCase(caseId).then(r => setData(r.data));
  useEffect(() => { load(); }, [caseId]);

  const updateCheck = async (checkId: string, status: string) => {
    const remarks = ['DISCREPANCY', 'FAILED'].includes(status) ? (prompt('Remarks?') ?? undefined) : undefined;
    try {
      await bgvApi.updateCheck(checkId, { status, remarks });
      await load();
      onChanged();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not update check');
    }
  };

  if (!data) return null;
  const { case: c, checks } = data;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-xs text-gray-400">{c.caseNumber}</p>
            <h2 className="text-lg font-semibold">{c.subjectName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CASE_STATUS_COLORS[c.status]}`}>{c.status}</span>
              <span className={`text-xs font-semibold ${RESULT_COLORS[c.overallResult]}`}>{c.overallResult}</span>
              <span className="text-xs text-gray-400">{c.subjectType}{c.packageName ? ` · ${c.packageName}` : ''}</span>
            </div>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <div className="mt-5 space-y-3">
          {checks.map((k: any) => (
            <div key={k.id} className="border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{k.type}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CHECK_STATUS_COLORS[k.status]}`}>{k.status}</span>
              </div>
              {k.remarks && <p className="text-xs text-gray-500 mt-1">{k.remarks}</p>}
              {k.verifiedAt && <p className="text-xs text-gray-400 mt-0.5">Verified {new Date(k.verifiedAt).toLocaleString()}</p>}
              {!['CLEAR', 'DISCREPANCY', 'FAILED'].includes(k.status) && c.status !== 'CANCELLED' && (
                <div className="flex gap-1.5 mt-2">
                  {CHECK_OUTCOMES.filter(o => o !== k.status).map(o => (
                    <button key={o} onClick={() => updateCheck(k.id, o)}
                      className="px-2 py-1 border rounded text-xs hover:bg-gray-50">{o.replace('_', ' ')}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {!['COMPLETED', 'CANCELLED'].includes(c.status) && (
          <button onClick={async () => {
            if (!confirm('Cancel this BGV case?')) return;
            await bgvApi.cancel(c.id); await load(); onChanged();
          }} className="flex items-center gap-1.5 mt-5 px-3 py-1.5 border rounded-lg text-sm text-red-600 hover:bg-red-50">
            <Ban className="h-4 w-4" /> Cancel Case
          </button>
        )}
      </div>
    </div>
  );
}

export default function BgvPage() {
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showInitiate, setShowInitiate] = useState(false);
  const [openCase, setOpenCase] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    bgvApi.getCases({ page: 1, limit: 50, ...(statusFilter ? { status: statusFilter } : {}) })
      .then(r => setCases(r.data?.items || []))
      .finally(() => setLoading(false));
  };

  useEffect(load, [statusFilter]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-blue-600" /> Background Verification
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Identity, education, employment, and criminal checks per candidate</p>
        </div>
        <button onClick={() => setShowInitiate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Initiate BGV
        </button>
      </div>

      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b">
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All statuses</option>
            {['INITIATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : cases.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No BGV cases yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Case', 'Subject', 'Type', 'Package', 'Status', 'Result', 'Initiated'].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {cases.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpenCase(c.id)}>
                  <td className="px-4 py-2 font-mono text-xs">{c.caseNumber}</td>
                  <td className="px-4 py-2 font-medium">{c.subjectName}</td>
                  <td className="px-4 py-2 text-gray-500">{c.subjectType}</td>
                  <td className="px-4 py-2 text-gray-500">{c.packageName || '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${CASE_STATUS_COLORS[c.status]}`}>{c.status}</span>
                  </td>
                  <td className={`px-4 py-2 text-xs font-semibold ${RESULT_COLORS[c.overallResult]}`}>{c.overallResult}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showInitiate && <InitiateModal onClose={() => setShowInitiate(false)} onDone={() => { setShowInitiate(false); load(); }} />}
      {openCase && <CaseDrawer caseId={openCase} onClose={() => setOpenCase(null)} onChanged={load} />}
    </div>
  );
}
