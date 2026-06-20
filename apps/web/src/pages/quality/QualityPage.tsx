import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qualityApi } from '../../api/quality';
import { clsx } from 'clsx';
import { AlertTriangle, CheckCircle, XCircle, Plus, ClipboardCheck } from 'lucide-react';

const ncrSeverityColor = (s: string) => ({
  LOW: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
}[s] ?? 'bg-gray-100 text-gray-800');

const lotStatusColor = (s: string) => ({
  PENDING: 'bg-yellow-100 text-yellow-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  PASSED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
}[s] ?? 'bg-gray-100 text-gray-800');

export default function QualityPage() {
  const [tab, setTab] = useState<'lots' | 'plans' | 'ncrs'>('lots');
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showLotModal, setShowLotModal] = useState(false);
  const [showNcrModal, setShowNcrModal] = useState(false);
  const [resolveId, setResolveId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: lotsData } = useQuery({ queryKey: ['quality-lots'], queryFn: () => qualityApi.getLots() });
  const { data: plansData } = useQuery({ queryKey: ['quality-plans'], queryFn: () => qualityApi.getPlans() });
  const { data: ncrsData } = useQuery({ queryKey: ['quality-ncrs'], queryFn: () => qualityApi.getNcrs() });

  const lots = lotsData?.data?.items ?? [];
  const plans = plansData?.data?.items ?? [];
  const ncrs = ncrsData?.data?.items ?? [];

  const createPlan = useMutation({
    mutationFn: (d: any) => qualityApi.createPlan(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quality-plans'] }); setShowPlanModal(false); },
  });
  const createLot = useMutation({
    mutationFn: (d: any) => qualityApi.createLot(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quality-lots'] }); setShowLotModal(false); },
  });
  const createNcr = useMutation({
    mutationFn: (d: any) => qualityApi.createNcr(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quality-ncrs'] }); setShowNcrModal(false); },
  });
  const resolveNcr = useMutation({
    mutationFn: ({ id, data }: any) => qualityApi.resolveNcr(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['quality-ncrs'] }); setResolveId(null); },
  });
  const closeNcr = useMutation({
    mutationFn: (id: string) => qualityApi.closeNcr(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['quality-ncrs'] }),
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quality Management</h1>
          <p className="text-gray-500 text-sm mt-1">Inspection plans, lots, and non-conformance reports</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border"><div className="text-sm text-gray-500">Inspection Lots</div><div className="text-2xl font-bold">{lots.length}</div></div>
        <div className="bg-white rounded-xl p-4 border"><div className="text-sm text-gray-500">Passed</div><div className="text-2xl font-bold text-green-600">{lots.filter((l: any) => l.status === 'PASSED').length}</div></div>
        <div className="bg-white rounded-xl p-4 border"><div className="text-sm text-gray-500">Failed</div><div className="text-2xl font-bold text-red-600">{lots.filter((l: any) => l.status === 'FAILED').length}</div></div>
        <div className="bg-white rounded-xl p-4 border"><div className="text-sm text-gray-500">Open NCRs</div><div className="text-2xl font-bold text-orange-600">{ncrs.filter((n: any) => n.status === 'OPEN' || n.status === 'UNDER_REVIEW').length}</div></div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b">
        {(['lots', 'plans', 'ncrs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={clsx('px-4 py-2 text-sm font-medium capitalize', tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700')}>
            {t === 'lots' ? 'Inspection Lots' : t === 'plans' ? 'Inspection Plans' : 'NCR / CAPA'}
          </button>
        ))}
      </div>

      {tab === 'lots' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowLotModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
              <Plus className="h-4 w-4" /> New Inspection Lot
            </button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>{['Lot #', 'Item Code', 'Qty', 'Sample Size', 'Date', 'Status', 'Decision'].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">{h}</th>)}</tr></thead>
              <tbody>
                {lots.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No inspection lots</td></tr>}
                {lots.map((lot: any) => (
                  <tr key={lot.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{lot.lotNumber}</td>
                    <td className="px-4 py-3">{lot.itemCode}</td>
                    <td className="px-4 py-3">{lot.quantity}</td>
                    <td className="px-4 py-3">{lot.sampleSize}</td>
                    <td className="px-4 py-3">{lot.inspectionDate}</td>
                    <td className="px-4 py-3"><span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', lotStatusColor(lot.status))}>{lot.status}</span></td>
                    <td className="px-4 py-3">{lot.usageDecision ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'plans' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowPlanModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
              <Plus className="h-4 w-4" /> New Plan
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {plans.length === 0 && <div className="col-span-2 text-center py-8 text-gray-400">No inspection plans</div>}
            {plans.map((plan: any) => (
              <div key={plan.id} className="bg-white rounded-xl border p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold">{plan.name}</div>
                    <div className="text-xs text-gray-500">{plan.code} · {plan.inspectionType}</div>
                    <div className="text-xs text-gray-600 mt-1">Item: {plan.itemCode} — {plan.itemName}</div>
                  </div>
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full', plan.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600')}>{plan.isActive ? 'Active' : 'Inactive'}</span>
                </div>
                <div className="mt-3 text-xs text-gray-500">{plan.checkpoints?.length ?? 0} checkpoints</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'ncrs' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowNcrModal(true)} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700">
              <AlertTriangle className="h-4 w-4" /> Report NCR
            </button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>{['NCR #', 'Title', 'Severity', 'Status', 'Actions'].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">{h}</th>)}</tr></thead>
              <tbody>
                {ncrs.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No NCRs</td></tr>}
                {ncrs.map((ncr: any) => (
                  <tr key={ncr.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{ncr.ncrNumber}</td>
                    <td className="px-4 py-3 font-medium">{ncr.title}</td>
                    <td className="px-4 py-3"><span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', ncrSeverityColor(ncr.severity))}>{ncr.severity}</span></td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">{ncr.status}</span></td>
                    <td className="px-4 py-3 flex gap-2">
                      {ncr.status === 'OPEN' && <button onClick={() => setResolveId(ncr.id)} className="text-xs text-blue-600 hover:underline">Resolve</button>}
                      {ncr.status === 'RESOLVED' && <button onClick={() => closeNcr.mutate(ncr.id)} className="text-xs text-green-600 hover:underline">Close</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[480px]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); createPlan.mutate({ code: f.get('code'), name: f.get('name'), itemCode: f.get('itemCode'), itemName: f.get('itemName'), inspectionType: f.get('inspectionType'), checkpoints: [] }); }}>
            <h2 className="text-lg font-semibold mb-4">New Inspection Plan</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Code</label><input name="code" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Name</label><input name="name" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Item Code</label><input name="itemCode" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Item Name</label><input name="itemName" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
              <div><label className="text-xs text-gray-500">Type</label>
                <select name="inspectionType" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                  <option value="GRN">GRN</option><option value="PRODUCTION">Production</option><option value="PERIODIC">Periodic</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowPlanModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
            </div>
          </form>
        </div>
      )}

      {/* Create Lot Modal */}
      {showLotModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[480px]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); createLot.mutate({ planId: f.get('planId'), referenceType: f.get('referenceType'), itemCode: f.get('itemCode'), quantity: Number(f.get('quantity')), sampleSize: Number(f.get('sampleSize')), inspectionDate: f.get('inspectionDate') }); }}>
            <h2 className="text-lg font-semibold mb-4">New Inspection Lot</h2>
            <div className="space-y-3">
              <div><label className="text-xs text-gray-500">Plan ID (UUID)</label><input name="planId" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="Plan UUID" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Reference Type</label>
                  <select name="referenceType" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                    <option value="GRN">GRN</option><option value="PRODUCTION">Production</option>
                  </select>
                </div>
                <div><label className="text-xs text-gray-500">Item Code</label><input name="itemCode" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Quantity</label><input name="quantity" type="number" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Sample Size</label><input name="sampleSize" type="number" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
              <div><label className="text-xs text-gray-500">Inspection Date</label><input name="inspectionDate" type="date" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowLotModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
            </div>
          </form>
        </div>
      )}

      {/* Report NCR Modal */}
      {showNcrModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[480px]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); createNcr.mutate({ title: f.get('title'), description: f.get('description'), severity: f.get('severity') }); }}>
            <h2 className="text-lg font-semibold mb-4">Report Non-Conformance</h2>
            <div className="space-y-3">
              <div><label className="text-xs text-gray-500">Title</label><input name="title" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-xs text-gray-500">Description</label><textarea name="description" rows={3} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-xs text-gray-500">Severity</label>
                <select name="severity" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                  <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowNcrModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Report</button>
            </div>
          </form>
        </div>
      )}

      {/* Resolve NCR Modal */}
      {resolveId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[480px]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); resolveNcr.mutate({ id: resolveId, data: { rootCause: f.get('rootCause'), correctiveAction: f.get('correctiveAction'), preventiveAction: f.get('preventiveAction') } }); }}>
            <h2 className="text-lg font-semibold mb-4">Resolve NCR</h2>
            <div className="space-y-3">
              <div><label className="text-xs text-gray-500">Root Cause</label><textarea name="rootCause" required rows={2} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-xs text-gray-500">Corrective Action</label><textarea name="correctiveAction" required rows={2} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-xs text-gray-500">Preventive Action</label><textarea name="preventiveAction" rows={2} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setResolveId(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Resolve</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
