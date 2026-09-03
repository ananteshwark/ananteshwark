import { useState, useEffect } from 'react';
import { Plus, X, ShieldCheck, FileCheck2, RefreshCw } from 'lucide-react';
import { i9Api } from '../../api/i9';
import { useAuthStore } from '../../store/authStore';

const unwrap = (res: any) => res.data?.data ?? res.data;
const listOf = (res: any) => {
  const p = unwrap(res);
  return Array.isArray(p) ? p : p?.data ?? [];
};

const STATUS_COLORS: Record<string, string> = {
  SECTION1_PENDING: 'bg-amber-100 text-amber-700',
  SECTION2_PENDING: 'bg-amber-100 text-amber-700',
  EVERIFY_PENDING: 'bg-blue-100 text-blue-700',
  COMPLETE: 'bg-green-100 text-green-700',
  REVERIFICATION: 'bg-red-100 text-red-700',
};

const CITIZENSHIP = ['US_CITIZEN', 'NONCITIZEN_NATIONAL', 'LAWFUL_PERMANENT_RESIDENT', 'ALIEN_AUTHORIZED'];

function CaseModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ employeeId: '', employeeName: '', hireDate: '', everifyEnabled: true });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await i9Api.createCase(form);
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not create case');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New I-9 Case</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Employee ID"
            value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Employee name"
            value={form.employeeName} onChange={e => setForm(p => ({ ...p, employeeName: e.target.value }))} />
          <label className="block text-xs text-gray-500">Hire date (Section 2 is due 3 business days after)
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
              value={form.hireDate} onChange={e => setForm(p => ({ ...p, hireDate: e.target.value }))} />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.everifyEnabled} onChange={e => setForm(p => ({ ...p, everifyEnabled: e.target.checked }))} />
            Submit to E-Verify after Section 2
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !form.employeeId.trim() || !form.employeeName.trim() || !form.hireDate}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Creating…' : 'Create Case'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section1Modal({ kase, onClose, onDone }: { kase: any; onClose: () => void; onDone: () => void }) {
  const [citizenshipStatus, setCitizenshipStatus] = useState('US_CITIZEN');
  const [workAuthExpiry, setWorkAuthExpiry] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await i9Api.section1(kase.id, { citizenshipStatus, workAuthExpiry: workAuthExpiry || undefined });
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not record Section 1');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Section 1 — {kase.employeeName}</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <label className="block text-xs text-gray-500">Citizenship / work authorization status
            <select className="w-full border rounded-lg px-3 py-2 text-sm mt-1" value={citizenshipStatus} onChange={e => setCitizenshipStatus(e.target.value)}>
              {CITIZENSHIP.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          </label>
          {citizenshipStatus === 'ALIEN_AUTHORIZED' && (
            <label className="block text-xs text-gray-500">Work authorization expiry
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" value={workAuthExpiry} onChange={e => setWorkAuthExpiry(e.target.value)} />
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Recording…' : 'Record Attestation'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section2Modal({ kase, onClose, onDone }: { kase: any; onClose: () => void; onDone: () => void }) {
  const { user } = useAuthStore();
  const [docs, setDocs] = useState([{ list: 'A', title: 'U.S. Passport', number: '', expiry: '' }]);
  const [saving, setSaving] = useState(false);

  const setDoc = (i: number, patch: any) => setDocs(prev => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const save = async () => {
    setSaving(true);
    try {
      await i9Api.section2(kase.id, { documents: docs, verifiedByUserId: user?.id });
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not record Section 2');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Section 2 documents — {kase.employeeName}</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-2">One List A document, or a List B + List C combination.</p>
        <div className="space-y-2">
          {docs.map((d, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <select className="col-span-2 border rounded px-2 py-1.5 text-sm" value={d.list} onChange={e => setDoc(i, { list: e.target.value })}>
                {['A', 'B', 'C'].map(l => <option key={l}>{l}</option>)}
              </select>
              <input className="col-span-4 border rounded px-2 py-1.5 text-sm" placeholder="Document title" value={d.title} onChange={e => setDoc(i, { title: e.target.value })} />
              <input className="col-span-3 border rounded px-2 py-1.5 text-sm" placeholder="Number" value={d.number} onChange={e => setDoc(i, { number: e.target.value })} />
              <input type="date" className="col-span-2 border rounded px-2 py-1.5 text-sm" value={d.expiry} onChange={e => setDoc(i, { expiry: e.target.value })} />
              <button className="col-span-1 text-red-400" onClick={() => setDocs(prev => prev.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <button onClick={() => setDocs(prev => [...prev, { list: 'B', title: '', number: '', expiry: '' }])} className="mt-2 text-sm text-blue-600">+ Add document</button>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving || docs.some(d => !d.title.trim())}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Recording…' : 'Verify Documents'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function I9Page() {
  const [cases, setCases] = useState<any[]>([]);
  const [overdue, setOverdue] = useState<any[]>([]);
  const [reverify, setReverify] = useState<any[]>([]);
  const [showCaseModal, setShowCaseModal] = useState(false);
  const [s1Case, setS1Case] = useState<any>(null);
  const [s2Case, setS2Case] = useState<any>(null);

  const load = async () => {
    const [c, o, r] = await Promise.all([
      i9Api.listCases().catch(() => null),
      i9Api.section2Overdue().catch(() => null),
      i9Api.dueForReverification().catch(() => null),
    ]);
    if (c) setCases(listOf(c));
    if (o) setOverdue(listOf(o));
    if (r) setReverify(listOf(r));
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
          <h1 className="text-xl font-semibold flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-green-600" />I-9 Employment Verification</h1>
          <p className="text-sm text-gray-500">Form I-9 cases with Section 1/2 tracking and E-Verify. Overdue Section 2 and reverification alerts also fire from the hourly compliance sweep.</p>
        </div>
        <button onClick={() => setShowCaseModal(true)} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700">
          <Plus className="h-4 w-4" />New Case
        </button>
      </div>

      {(overdue.length > 0 || reverify.length > 0) && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 space-y-1">
          {overdue.length > 0 && <p><strong>{overdue.length}</strong> case(s) past the Section 2 three-business-day deadline.</p>}
          {reverify.length > 0 && <p><strong>{reverify.length}</strong> case(s) due for work-authorization reverification.</p>}
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="p-3">Employee</th><th>Hire date</th><th>Section 2 due</th><th>E-Verify</th><th>Status</th><th className="text-right pr-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {cases.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-400">No I-9 cases.</td></tr>}
            {cases.map(k => (
              <tr key={k.id}>
                <td className="p-3 font-medium">{k.employeeName}</td>
                <td>{k.hireDate}</td>
                <td>{k.section2DueDate ?? '—'}</td>
                <td className="text-xs">{k.everifyCaseNumber ? `${k.everifyCaseNumber} · ${k.everifyResult ?? 'pending'}` : (k.everifyEnabled ? 'enabled' : '—')}</td>
                <td><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[k.status] ?? ''}`}>{k.status}</span></td>
                <td className="text-right pr-3 space-x-2 whitespace-nowrap">
                  {k.status === 'SECTION1_PENDING' && <button onClick={() => setS1Case(k)} className="text-blue-600 text-xs">Section 1</button>}
                  {k.status === 'SECTION2_PENDING' && <button onClick={() => setS2Case(k)} className="text-blue-600 text-xs inline-flex items-center gap-0.5"><FileCheck2 className="h-3.5 w-3.5" />Section 2</button>}
                  {k.status === 'EVERIFY_PENDING' && (
                    <>
                      <button onClick={() => act(() => i9Api.submitEVerify(k.id), 'submit to E-Verify')} className="text-blue-600 text-xs">Submit E-Verify</button>
                      <button onClick={() => act(() => i9Api.refreshEVerify(k.id), 'refresh E-Verify')} className="text-gray-500 text-xs inline-flex items-center gap-0.5"><RefreshCw className="h-3 w-3" />Refresh</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCaseModal && <CaseModal onClose={() => setShowCaseModal(false)} onDone={() => { setShowCaseModal(false); load(); }} />}
      {s1Case && <Section1Modal kase={s1Case} onClose={() => setS1Case(null)} onDone={() => { setS1Case(null); load(); }} />}
      {s2Case && <Section2Modal kase={s2Case} onClose={() => setS2Case(null)} onDone={() => { setS2Case(null); load(); }} />}
    </div>
  );
}
