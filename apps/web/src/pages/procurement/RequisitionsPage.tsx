import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { procurementApi } from '../../api/procurement';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-700',
  MEDIUM: 'bg-blue-100 text-blue-700',
  HIGH: 'bg-orange-100 text-orange-700',
  URGENT: 'bg-red-100 text-red-700',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  CONVERTED: 'bg-purple-100 text-purple-700',
};

function NewRequisitionDialog({ onClose, onSaved, editing }: { onClose: () => void; onSaved: () => void; editing?: any }) {
  const [form, setForm] = useState({
    title: editing?.title || '',
    description: editing?.description || '',
    priority: editing?.priority || 'MEDIUM',
    requiredBy: editing?.requiredBy || '',
    notes: editing?.notes || '',
    lines:
      editing?.lines?.length
        ? editing.lines.map((l: any) => ({
            description: l.description || '',
            quantity: l.quantity ?? 1,
            unitPrice: l.unitPrice ?? '',
            uom: l.uom || 'EA',
          }))
        : [{ description: '', quantity: 1, unitPrice: '', uom: 'EA' }],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const addLine = () =>
    setForm((f) => ({ ...f, lines: [...f.lines, { description: '', quantity: 1, unitPrice: '', uom: 'EA' }] }));
  const removeLine = (i: number) =>
    setForm((f) => ({ ...f, lines: f.lines.filter((_: any, idx: number) => idx !== i) }));
  const updateLine = (i: number, field: string, value: any) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l: any, idx: number) => (idx === i ? { ...l, [field]: value } : l)) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        ...form,
        lines: form.lines.map((l: any) => ({
          ...l,
          quantity: Number(l.quantity),
          unitPrice: l.unitPrice ? Number(l.unitPrice) : undefined,
        })),
      };
      if (editing) await procurementApi.updateRequisition(editing.id, payload);
      else await procurementApi.createRequisition(payload);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || `Failed to ${editing ? 'update' : 'create'} requisition`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <h2 className="text-lg font-semibold">{editing ? 'Edit Purchase Requisition' : 'New Purchase Requisition'}</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              >
                {['LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Required By</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.requiredBy}
                onChange={(e) => setForm((f) => ({ ...f, requiredBy: e.target.value }))}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Lines *</label>
              <button type="button" onClick={addLine} className="text-sm text-blue-600 hover:underline">+ Add Line</button>
            </div>
            <div className="space-y-2">
              {form.lines.map((line: any, i: number) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    className="col-span-5 border rounded-lg px-2 py-1.5 text-sm"
                    placeholder="Description *"
                    value={line.description}
                    onChange={(e) => updateLine(i, 'description', e.target.value)}
                    required
                  />
                  <input
                    className="col-span-2 border rounded-lg px-2 py-1.5 text-sm"
                    placeholder="UOM"
                    value={line.uom}
                    onChange={(e) => updateLine(i, 'uom', e.target.value)}
                  />
                  <input
                    type="number"
                    className="col-span-2 border rounded-lg px-2 py-1.5 text-sm"
                    placeholder="Qty *"
                    value={line.quantity}
                    min={0}
                    onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                    required
                  />
                  <input
                    type="number"
                    className="col-span-2 border rounded-lg px-2 py-1.5 text-sm"
                    placeholder="Unit Price"
                    value={line.unitPrice}
                    min={0}
                    onChange={(e) => updateLine(i, 'unitPrice', e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeLine(i)}
                    className="col-span-1 text-red-500 hover:text-red-700 text-sm"
                    disabled={form.lines.length === 1}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Saving...' : editing ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RequisitionsPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [lineDetails, setLineDetails] = useState<Record<string, any[]>>({});
  const [statusFilter, setStatusFilter] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      const res = await procurementApi.getRequisitions(params);
      setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [statusFilter]);

  const toggleRow = async (id: string) => {
    const next = new Set(expandedRows);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
      if (!lineDetails[id]) {
        try {
          const res = await procurementApi.getRequisition(id);
          setLineDetails((p) => ({ ...p, [id]: res.data.lines || [] }));
        } catch {}
      }
    }
    setExpandedRows(next);
  };

  const handleEdit = async (id: string) => {
    try {
      const res = await procurementApi.getRequisition(id);
      setEditing(res.data?.data ?? res.data);
    } catch (e: any) {
      alert(e.response?.data?.message || 'Failed to load requisition');
    }
  };

  // Flow the approved PR (title + lines) into a new purchase order.
  const createPoFromPr = async (req: any) => {
    try {
      const res = await procurementApi.getRequisition(req.id);
      const full = res.data?.data ?? res.data;
      navigate('/procurement/purchase-orders', {
        state: {
          prefill: {
            source: `${full.reqNumber} — ${full.title}`,
            notes: `Created from requisition ${full.reqNumber}`,
            lines: (full.lines || []).map((l: any) => ({
              description: l.description,
              quantity: l.quantity,
              unitPrice: l.unitPrice ?? 0,
              uom: l.uom || 'EA',
              taxRate: 0,
            })),
          },
        },
      });
    } catch (e: any) {
      alert(e.response?.data?.message || 'Failed to load requisition');
    }
  };

  const handleAction = async (action: string, id: string, extra?: any) => {
    try {
      if (action === 'submit') await procurementApi.submitRequisition(id);
      else if (action === 'approve') await procurementApi.approveRequisition(id);
      else if (action === 'reject') {
        const reason = prompt('Rejection reason:');
        if (!reason) return;
        await procurementApi.rejectRequisition(id, { reason });
      } else if (action === 'cancel') await procurementApi.cancelRequisition(id);
      loadData();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Action failed');
    }
  };

  const items = data?.items || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchase Requisitions</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} requisitions</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="h-4 w-4" /> New PR
        </button>
      </div>

      <div className="flex gap-2">
        {['', 'DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${statusFilter === s ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No requisitions found</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="w-8 px-4 py-3"></th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">PR #</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Title</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Priority</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Total</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Required By</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((req: any) => (
                <>
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button onClick={() => toggleRow(req.id)} className="text-gray-400 hover:text-gray-600">
                        {expandedRows.has(req.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{req.reqNumber}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{req.title}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[req.priority] || ''}`}>
                        {req.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[req.status] || ''}`}>
                        {req.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{req.totalAmount?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-500">{req.requiredBy || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {req.status === 'DRAFT' && (
                          <>
                            <button onClick={() => handleEdit(req.id)} className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded hover:bg-indigo-100">Edit</button>
                            <button onClick={() => handleAction('submit', req.id)} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">Submit</button>
                          </>
                        )}
                        {req.status === 'SUBMITTED' && (
                          <>
                            <button onClick={() => handleAction('approve', req.id)} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">Approve</button>
                            <button onClick={() => handleAction('reject', req.id)} className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100">Reject</button>
                          </>
                        )}
                        {req.status === 'APPROVED' && (
                          <button onClick={() => createPoFromPr(req)} className="text-xs px-2 py-1 bg-purple-50 text-purple-700 rounded hover:bg-purple-100">Create PO</button>
                        )}
                        {['DRAFT', 'SUBMITTED'].includes(req.status) && (
                          <button onClick={() => handleAction('cancel', req.id)} className="text-xs px-2 py-1 bg-gray-50 text-gray-600 rounded hover:bg-gray-100">Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedRows.has(req.id) && (
                    <tr key={`${req.id}-lines`} className="bg-gray-50">
                      <td colSpan={8} className="px-8 py-3">
                        {lineDetails[req.id] ? (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="text-left py-1 pr-4">#</th>
                                <th className="text-left py-1 pr-4">Description</th>
                                <th className="text-left py-1 pr-4">UOM</th>
                                <th className="text-right py-1 pr-4">Qty</th>
                                <th className="text-right py-1">Unit Price</th>
                              </tr>
                            </thead>
                            <tbody>
                              {lineDetails[req.id].map((line: any) => (
                                <tr key={line.id}>
                                  <td className="py-1 pr-4">{line.lineNumber}</td>
                                  <td className="py-1 pr-4">{line.description}</td>
                                  <td className="py-1 pr-4">{line.uom}</td>
                                  <td className="py-1 pr-4 text-right">{line.quantity}</td>
                                  <td className="py-1 text-right">{line.unitPrice ?? '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <span className="text-gray-400">Loading lines...</span>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewRequisitionDialog onClose={() => setShowNew(false)} onSaved={loadData} />}
      {editing && <NewRequisitionDialog editing={editing} onClose={() => setEditing(null)} onSaved={loadData} />}
    </div>
  );
}
