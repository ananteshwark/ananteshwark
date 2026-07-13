import { useState, useEffect } from 'react';
import { Plus, X, GraduationCap, Award, Timer } from 'lucide-react';
import { academyApi } from '../../api/academy';

const unwrap = (res: any) => res.data?.data ?? res.data;
const listOf = (res: any) => {
  const p = unwrap(res);
  return Array.isArray(p) ? p : p?.data ?? [];
};

const STATUS_COLORS: Record<string, string> = {
  ENROLLED: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  CERTIFIED: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-red-100 text-red-700',
};

function CertModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', description: '', validityMonths: '' });
  const [reqs, setReqs] = useState([{ ref: '', type: 'COURSE', minScore: '' }]);
  const [saving, setSaving] = useState(false);

  const setReq = (i: number, patch: any) => setReqs(prev => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    try {
      await academyApi.createCertification({
        name: form.name,
        description: form.description || undefined,
        validityMonths: form.validityMonths ? Number(form.validityMonths) : undefined,
        requirements: reqs
          .filter(r => r.ref.trim())
          .map(r => ({ ref: r.ref.trim(), type: r.type, minScore: r.minScore ? Number(r.minScore) : undefined })),
      });
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not create certification');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Certification</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Certification name (e.g. Platform Administrator)"
            value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Description"
            value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          <label className="block text-xs text-gray-500">Validity (months, blank = never expires)
            <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
              value={form.validityMonths} onChange={e => setForm(p => ({ ...p, validityMonths: e.target.value }))} />
          </label>
          <p className="text-xs font-semibold text-gray-500 uppercase">Requirements</p>
          {reqs.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input className="col-span-5 border rounded px-2 py-1.5 text-sm" placeholder="Course/assessment ref"
                value={r.ref} onChange={e => setReq(i, { ref: e.target.value })} />
              <select className="col-span-3 border rounded px-2 py-1.5 text-sm" value={r.type} onChange={e => setReq(i, { type: e.target.value })}>
                <option>COURSE</option><option>ASSESSMENT</option>
              </select>
              <input type="number" className="col-span-3 border rounded px-2 py-1.5 text-sm" placeholder="Min score"
                value={r.minScore} onChange={e => setReq(i, { minScore: e.target.value })} />
              <button className="col-span-1 text-red-400" onClick={() => setReqs(prev => prev.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
            </div>
          ))}
          <button onClick={() => setReqs(prev => [...prev, { ref: '', type: 'COURSE', minScore: '' }])} className="text-sm text-blue-600">+ Add requirement</button>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !form.name.trim() || !reqs.some(r => r.ref.trim())}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Certification'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AcademyPage() {
  const [certs, setCerts] = useState<any[]>([]);
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    const [c, e] = await Promise.all([
      academyApi.listCertifications().catch(() => null),
      academyApi.listEnrollments().catch(() => null),
    ]);
    if (c) setCerts(listOf(c));
    if (e) setEnrollments(listOf(e));
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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><GraduationCap className="h-5 w-5" />Academy Certifications</h1>
          <p className="text-sm text-gray-500">Certification tracks with course/assessment requirements. Certifying emits `academy.certified`; expiries flip via the hourly sweep.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => act(() => academyApi.expireSweep(), 'run expiry sweep')}
            className="px-3 py-2 border rounded-lg text-sm flex items-center gap-1"><Timer className="h-4 w-4" />Expiry Sweep</button>
          <button onClick={() => setShowModal(true)} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700">
            <Plus className="h-4 w-4" />New Certification
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border">
          <p className="px-4 pt-3 pb-1 text-sm font-semibold">Certifications</p>
          <div className="divide-y">
            {certs.length === 0 && <p className="p-4 text-sm text-gray-400">No certifications yet.</p>}
            {certs.map(c => (
              <div key={c.id} className="p-3 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  {c.description && <p className="text-xs text-gray-500">{c.description}</p>}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {(c.requirements ?? []).map((r: any) => `${r.type} ${r.ref}${r.minScore != null ? ` ≥${r.minScore}` : ''}`).join(' · ')}
                    {c.validityMonths ? ` · valid ${c.validityMonths} mo` : ''}
                  </p>
                </div>
                <button onClick={() => {
                  const learnerId = prompt('Learner employee/user ID (blank = me)');
                  act(() => academyApi.enroll(c.id, learnerId?.trim() || undefined), 'enroll');
                }} className="text-blue-600 text-xs shrink-0">Enroll</button>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border overflow-x-auto">
          <p className="px-4 pt-3 pb-1 text-sm font-semibold">Enrollments</p>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="p-3">Learner</th><th>Progress</th><th>Status</th><th className="text-right pr-3">Actions</th></tr></thead>
            <tbody className="divide-y">
              {enrollments.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-gray-400">No enrollments.</td></tr>}
              {enrollments.map(e => (
                <tr key={e.id}>
                  <td className="p-3 text-xs">{e.learnerId}</td>
                  <td className="text-xs">{(e.progress ?? []).length} req(s) met{e.certificateRef ? ` · ${e.certificateRef}` : ''}</td>
                  <td><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[e.status] ?? 'bg-gray-100 text-gray-600'}`}>{e.status}</span></td>
                  <td className="text-right pr-3">
                    {(e.status === 'ENROLLED' || e.status === 'IN_PROGRESS') && (
                      <button onClick={() => {
                        const ref = prompt('Requirement ref completed');
                        if (!ref) return;
                        const score = prompt('Score (blank if n/a)');
                        act(() => academyApi.recordRequirement(e.id, { ref, score: score ? Number(score) : undefined }), 'record requirement');
                      }} className="text-green-600 text-xs inline-flex items-center gap-0.5"><Award className="h-3.5 w-3.5" />Record</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && <CertModal onClose={() => setShowModal(false)} onDone={() => { setShowModal(false); load(); }} />}
    </div>
  );
}
