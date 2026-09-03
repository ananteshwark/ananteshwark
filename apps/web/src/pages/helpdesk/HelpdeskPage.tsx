import { useState, useEffect } from 'react';
import { Plus, X, LifeBuoy, Send } from 'lucide-react';
import { helpdeskApi } from '../../api/helpdesk';

const CATEGORIES = ['PAYROLL', 'LEAVE', 'ATTENDANCE', 'BENEFITS', 'POLICY', 'DOCUMENTS', 'GRIEVANCE', 'IT', 'FACILITIES', 'OTHER'];
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED'];

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  ON_HOLD: 'bg-gray-100 text-gray-600',
  RESOLVED: 'bg-green-100 text-green-700',
  CLOSED: 'bg-gray-200 text-gray-500',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'text-gray-400', MEDIUM: 'text-blue-600', HIGH: 'text-amber-600', URGENT: 'text-red-600',
};

function NewCaseModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ subject: '', description: '', category: 'OTHER', priority: 'MEDIUM' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await helpdeskApi.createCase(form);
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not raise case');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Raise HR Case</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Subject"
            value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} />
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} placeholder="Describe the issue…"
            value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Category</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.category}
                onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Priority</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.priority}
                onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          {form.category === 'GRIEVANCE' && (
            <p className="text-xs text-purple-600">Grievances are confidential — visible only to the HR helpdesk team.</p>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !form.subject.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Raising…' : 'Raise Case'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CaseDrawer({ caseId, isManager, onClose, onChanged }: {
  caseId: string; isManager: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [hrCase, setHrCase] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [comment, setComment] = useState('');
  const [internal, setInternal] = useState(false);
  const [assignee, setAssignee] = useState('');
  const [resolveNotes, setResolveNotes] = useState('');

  const load = async () => {
    const c = await helpdeskApi.getCase(caseId);
    setHrCase(c.data);
    const m = isManager ? await helpdeskApi.getAllComments(caseId) : await helpdeskApi.getComments(caseId);
    setComments(m.data || []);
  };

  useEffect(() => { load(); }, [caseId]);

  const act = async (fn: () => Promise<any>) => {
    try { await fn(); await load(); onChanged(); } catch (e: any) { alert(e?.response?.data?.message || 'Action failed'); }
  };

  const sendComment = async () => {
    if (!comment.trim()) return;
    await act(() => helpdeskApi.addComment(caseId, comment, internal));
    setComment('');
  };

  if (!hrCase) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto p-6 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-mono text-xs text-gray-400">{hrCase.caseNumber}</p>
            <h2 className="text-lg font-semibold">{hrCase.subject}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[hrCase.status]}`}>{hrCase.status}</span>
              <span className={`text-xs font-medium ${PRIORITY_COLORS[hrCase.priority]}`}>{hrCase.priority}</span>
              <span className="text-xs text-gray-400">{hrCase.category}</span>
              {hrCase.confidential && <span className="text-xs text-purple-600">Confidential</span>}
            </div>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-gray-400" /></button>
        </div>

        <p className="text-sm text-gray-700 mt-3 whitespace-pre-wrap">{hrCase.description}</p>
        {hrCase.slaDueAt && (
          <p className={`text-xs mt-2 ${new Date(hrCase.slaDueAt) < new Date() && !['RESOLVED', 'CLOSED'].includes(hrCase.status) ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
            SLA due {new Date(hrCase.slaDueAt).toLocaleString()}
          </p>
        )}
        {hrCase.resolutionNotes && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
            <p className="text-xs font-medium text-green-800">Resolution</p>
            <p className="text-sm text-green-700">{hrCase.resolutionNotes}</p>
          </div>
        )}

        {isManager && !['RESOLVED', 'CLOSED'].includes(hrCase.status) && (
          <div className="border rounded-lg p-3 mt-4 space-y-2">
            <p className="text-xs font-medium text-gray-500">HR actions</p>
            <div className="flex gap-2">
              <input value={assignee} onChange={e => setAssignee(e.target.value)} placeholder="Assignee user id"
                className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
              <button onClick={() => act(() => helpdeskApi.assign(caseId, assignee))} disabled={!assignee}
                className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50">Assign</button>
            </div>
            <div className="flex gap-2">
              {hrCase.status !== 'ON_HOLD'
                ? <button onClick={() => act(() => helpdeskApi.updateStatus(caseId, 'ON_HOLD'))}
                    className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">Put On Hold</button>
                : <button onClick={() => act(() => helpdeskApi.updateStatus(caseId, 'IN_PROGRESS'))}
                    className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">Resume</button>}
              <button onClick={() => act(() => helpdeskApi.updateStatus(caseId, 'CLOSED'))}
                className="px-3 py-1.5 border rounded-lg text-sm hover:bg-gray-50">Close</button>
            </div>
            <div className="flex gap-2">
              <input value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} placeholder="Resolution notes…"
                className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
              <button onClick={() => act(() => helpdeskApi.updateStatus(caseId, 'RESOLVED', resolveNotes))} disabled={!resolveNotes.trim()}
                className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">Resolve</button>
            </div>
          </div>
        )}

        <div className="mt-5">
          <p className="text-xs font-medium text-gray-500 mb-2">Conversation</p>
          <div className="space-y-2">
            {comments.map(c => (
              <div key={c.id} className={`rounded-lg p-2.5 text-sm ${c.internal ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'}`}>
                <p className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{c.authorName}</span>
                  {' · '}{new Date(c.createdAt).toLocaleString()}
                  {c.internal && <span className="text-yellow-700 ml-1">(internal)</span>}
                </p>
                <p className="text-gray-700 mt-0.5">{c.body}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <input value={comment} onChange={e => setComment(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendComment()}
              placeholder="Add a comment…" className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
            <button onClick={sendComment} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
          {isManager && (
            <label className="flex items-center gap-1.5 text-xs text-gray-500 mt-1.5">
              <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />
              Internal note (hidden from requester)
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HelpdeskPage() {
  const [tab, setTab] = useState<'mine' | 'all'>('mine');
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isManager, setIsManager] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [openCase, setOpenCase] = useState<string | null>(null);

  // Probe the manager queue once; a 403 means self-service only.
  useEffect(() => {
    helpdeskApi.getCases({ page: 1, limit: 1 })
      .then(() => setIsManager(true))
      .catch(() => setIsManager(false));
  }, []);

  const load = () => {
    setLoading(true);
    const fetch = tab === 'mine'
      ? helpdeskApi.getMyCases().then(r => r.data || [])
      : helpdeskApi.getCases({ page: 1, limit: 50, ...(statusFilter ? { status: statusFilter } : {}) }).then(r => r.data?.items || []);
    fetch.then(setCases).catch(() => setCases([])).finally(() => setLoading(false));
  };

  useEffect(load, [tab, statusFilter]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <LifeBuoy className="h-6 w-6 text-blue-600" /> HR Helpdesk
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Raise HR queries and grievances; track them against SLAs</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Raise Case
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex rounded-lg border overflow-hidden text-sm">
          <button onClick={() => setTab('mine')}
            className={`px-4 py-1.5 ${tab === 'mine' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}>My Cases</button>
          {isManager && (
            <button onClick={() => setTab('all')}
              className={`px-4 py-1.5 ${tab === 'all' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}>All Cases</button>
          )}
        </div>
        {tab === 'all' && (
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm">
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      <div className="bg-white rounded-xl border">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : cases.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No cases found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Case', 'Subject', 'Category', 'Priority', 'SLA Due', 'Status'].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {cases.map(c => (
                <tr key={c.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setOpenCase(c.id)}>
                  <td className="px-4 py-2 font-mono text-xs">{c.caseNumber}</td>
                  <td className="px-4 py-2 font-medium max-w-[220px] truncate">{c.subject}</td>
                  <td className="px-4 py-2 text-gray-500">{c.category}</td>
                  <td className={`px-4 py-2 text-xs font-medium ${PRIORITY_COLORS[c.priority]}`}>{c.priority}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{c.slaDueAt ? new Date(c.slaDueAt).toLocaleString() : '—'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status]}`}>{c.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && <NewCaseModal onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load(); }} />}
      {openCase && (
        <CaseDrawer caseId={openCase} isManager={isManager}
          onClose={() => setOpenCase(null)} onChanged={load} />
      )}
    </div>
  );
}
