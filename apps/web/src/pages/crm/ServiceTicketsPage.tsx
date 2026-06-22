import { useState, useEffect } from 'react';
import {
  Ticket,
  AlertTriangle,
  Clock,
  CheckCircle,
  Star,
  MessageSquare,
  X,
  Plus,
} from 'lucide-react';
import { serviceTicketsApi } from '../../api/serviceTickets';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED'];

const priorityColor = (p: string) => {
  switch (p) {
    case 'CRITICAL':
      return 'bg-red-100 text-red-800';
    case 'HIGH':
      return 'bg-orange-100 text-orange-800';
    case 'MEDIUM':
      return 'bg-yellow-100 text-yellow-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

const statusColor = (s: string) => {
  switch (s) {
    case 'OPEN':
      return 'bg-blue-100 text-blue-800';
    case 'IN_PROGRESS':
      return 'bg-indigo-100 text-indigo-800';
    case 'PENDING_CUSTOMER':
      return 'bg-amber-100 text-amber-800';
    case 'RESOLVED':
      return 'bg-green-100 text-green-800';
    case 'CLOSED':
      return 'bg-gray-200 text-gray-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleString() : '—');

export default function ServiceTicketsPage() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>({ byStatus: {}, byPriority: {}, breached: 0, avgResolutionHours: 0 });
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ customerId: '', subject: '', description: '', priority: 'MEDIUM', category: '' });
  const [selected, setSelected] = useState<any | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [commentInternal, setCommentInternal] = useState(false);

  const fetchAll = () => {
    setLoading(true);
    const params: any = {};
    if (filterStatus) params.status = filterStatus;
    if (filterPriority) params.priority = filterPriority;
    Promise.all([
      serviceTicketsApi.list(params).catch(() => []),
      serviceTicketsApi.dashboard().catch(() => ({ byStatus: {}, byPriority: {}, breached: 0, avgResolutionHours: 0 })),
    ])
      .then(([list, dash]) => {
        setTickets(Array.isArray(list) ? list : []);
        setDashboard(dash || {});
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus, filterPriority]);

  const handleCreate = async () => {
    if (!form.subject.trim()) {
      alert('Subject is required');
      return;
    }
    try {
      await serviceTicketsApi.create({
        ...form,
        customerId: form.customerId || null,
        description: form.description || null,
        category: form.category || null,
      });
      setShowNew(false);
      setForm({ customerId: '', subject: '', description: '', priority: 'MEDIUM', category: '' });
      fetchAll();
    } catch {
      alert('Failed to create ticket');
    }
  };

  const openDetail = async (id: string) => {
    try {
      const t = await serviceTicketsApi.get(id);
      setSelected(t);
    } catch {
      alert('Failed to load ticket');
    }
  };

  const refreshSelected = async () => {
    if (!selected) return;
    const t = await serviceTicketsApi.get(selected.id);
    setSelected(t);
  };

  const changeStatus = async (status: string) => {
    if (!selected) return;
    await serviceTicketsApi.updateStatus(selected.id, status);
    await refreshSelected();
    fetchAll();
  };

  const submitComment = async () => {
    if (!selected || !commentBody.trim()) return;
    await serviceTicketsApi.addComment(selected.id, { body: commentBody, isInternal: commentInternal });
    setCommentBody('');
    setCommentInternal(false);
    await refreshSelected();
  };

  const submitCsat = async (score: number) => {
    if (!selected) return;
    await serviceTicketsApi.setCsat(selected.id, score);
    await refreshSelected();
    fetchAll();
  };

  const submitAssign = async (value: string) => {
    if (!selected) return;
    await serviceTicketsApi.assign(selected.id, value || null);
    await refreshSelected();
    fetchAll();
  };

  const cards = [
    { label: 'Open', value: dashboard.byStatus?.OPEN || 0, icon: <Ticket className="h-5 w-5 text-blue-600" />, bg: 'bg-blue-50' },
    { label: 'In Progress', value: dashboard.byStatus?.IN_PROGRESS || 0, icon: <Clock className="h-5 w-5 text-indigo-600" />, bg: 'bg-indigo-50' },
    { label: 'SLA Breached', value: dashboard.breached || 0, icon: <AlertTriangle className="h-5 w-5 text-red-600" />, bg: 'bg-red-50' },
    { label: 'Resolved', value: dashboard.byStatus?.RESOLVED || 0, icon: <CheckCircle className="h-5 w-5 text-green-600" />, bg: 'bg-green-50' },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Service Tickets</h1>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> New Ticket
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl border border-gray-200 p-4 ${c.bg}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">{c.label}</span>
              {c.icon}
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-2">{c.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-4">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">All Priorities</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <span className="ml-auto text-sm text-gray-500 self-center">Avg resolution: {dashboard.avgResolutionHours || 0}h</span>
      </div>

      {loading && <p className="text-gray-500 text-sm">Loading…</p>}

      {!loading && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Ticket #', 'Subject', 'Priority', 'Status', 'SLA', 'Created'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(t.id)}>
                  <td className="px-4 py-3 text-sm font-mono text-gray-700">{t.ticketNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{t.subject}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColor(t.priority)}`}>{t.priority}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(t.status)}`}>{t.status.replace('_', ' ')}</span>
                  </td>
                  <td className="px-4 py-3">
                    {t.slaBreached ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> Breached
                      </span>
                    ) : (
                      <span className="text-xs text-green-700">On track</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">{fmtDate(t.createdAt)}</td>
                </tr>
              ))}
              {tickets.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No tickets found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* New Ticket modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Ticket</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer ID</label>
                <input value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Optional" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Optional" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleCreate} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Create</button>
              <button onClick={() => setShowNew(false)} className="flex-1 px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
          <div className="w-full max-w-lg bg-white h-full overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <div>
                <p className="text-xs font-mono text-gray-500">{selected.ticketNumber}</p>
                <h2 className="text-lg font-semibold text-gray-900">{selected.subject}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>

            <div className="p-6 space-y-6">
              <div className="flex flex-wrap gap-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${priorityColor(selected.priority)}`}>{selected.priority}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(selected.status)}`}>{selected.status.replace('_', ' ')}</span>
                {selected.slaBreached && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                    <AlertTriangle className="h-3.5 w-3.5" /> SLA Breached
                  </span>
                )}
              </div>

              {selected.description && <p className="text-sm text-gray-700 whitespace-pre-wrap">{selected.description}</p>}

              <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                <div><span className="font-medium text-gray-500">Response due:</span> {fmtDate(selected.slaResponseDueAt)}</div>
                <div><span className="font-medium text-gray-500">Resolution due:</span> {fmtDate(selected.slaResolutionDueAt)}</div>
                <div><span className="font-medium text-gray-500">First response:</span> {fmtDate(selected.firstResponseAt)}</div>
                <div><span className="font-medium text-gray-500">Resolved:</span> {fmtDate(selected.resolvedAt)}</div>
              </div>

              {/* Status transitions */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Status</p>
                <div className="flex flex-wrap gap-2">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => changeStatus(s)}
                      disabled={selected.status === s}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${selected.status === s ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                    >
                      {s.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assign */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Assign to (user ID)</p>
                <div className="flex gap-2">
                  <input
                    defaultValue={selected.assignedToUserId || ''}
                    onBlur={(e) => submitAssign(e.target.value.trim())}
                    placeholder="User ID"
                    className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              {/* CSAT */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">CSAT Score</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => submitCsat(n)} className="text-yellow-500 hover:scale-110 transition-transform">
                      <Star className={`h-6 w-6 ${selected.csatScore && n <= selected.csatScore ? 'fill-yellow-400' : ''}`} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Comments */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" /> Comments
                </p>
                <div className="space-y-2 mb-3">
                  {(selected.comments || []).map((c: any) => (
                    <div key={c.id} className={`rounded-lg p-3 text-sm ${c.isInternal ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50 border border-gray-200'}`}>
                      <p className="text-gray-800 whitespace-pre-wrap">{c.body}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {c.isInternal ? 'Internal · ' : ''}{fmtDate(c.createdAt)}
                      </p>
                    </div>
                  ))}
                  {(!selected.comments || selected.comments.length === 0) && (
                    <p className="text-xs text-gray-400">No comments yet.</p>
                  )}
                </div>
                <textarea value={commentBody} onChange={(e) => setCommentBody(e.target.value)} rows={2} placeholder="Add a comment…" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                <div className="flex items-center justify-between mt-2">
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input type="checkbox" checked={commentInternal} onChange={(e) => setCommentInternal(e.target.checked)} />
                    Internal note
                  </label>
                  <button onClick={submitComment} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700">Add Comment</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
