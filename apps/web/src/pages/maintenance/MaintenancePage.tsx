import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceApi } from '../../api/maintenance';
import { clsx } from 'clsx';
import { Plus, Wrench, AlertTriangle, Play, CheckCircle } from 'lucide-react';

const orderStatusColor = (s: string) => ({
  OPEN: 'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
}[s] ?? 'bg-gray-100 text-gray-800');

const equipmentStatusColor = (s: string) => ({
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-gray-100 text-gray-600',
  UNDER_MAINTENANCE: 'bg-yellow-100 text-yellow-800',
  DECOMMISSIONED: 'bg-red-100 text-red-800',
}[s] ?? 'bg-gray-100 text-gray-800');

export default function MaintenancePage() {
  const [tab, setTab] = useState<'orders' | 'equipment' | 'plans' | 'breakdowns'>('orders');
  const [showEquipmentModal, setShowEquipmentModal] = useState(false);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [completeId, setCompleteId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: ordersData } = useQuery({ queryKey: ['maint-orders'], queryFn: () => maintenanceApi.getOrders() });
  const { data: equipData } = useQuery({ queryKey: ['maint-equipment'], queryFn: () => maintenanceApi.getEquipment() });
  const { data: plansData } = useQuery({ queryKey: ['maint-plans'], queryFn: () => maintenanceApi.getPlans() });
  const { data: breakdownsData } = useQuery({ queryKey: ['maint-breakdowns'], queryFn: () => maintenanceApi.getBreakdowns() });

  const orders = ordersData?.data?.items ?? [];
  const equipment = equipData?.data?.items ?? [];
  const plans = plansData?.data?.items ?? [];
  const breakdowns = breakdownsData?.data?.items ?? [];

  const createEquipment = useMutation({ mutationFn: (d: any) => maintenanceApi.createEquipment(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['maint-equipment'] }); setShowEquipmentModal(false); } });
  const createOrder = useMutation({ mutationFn: (d: any) => maintenanceApi.createOrder(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['maint-orders'] }); setShowOrderModal(false); } });
  const startOrder = useMutation({ mutationFn: (id: string) => maintenanceApi.startOrder(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['maint-orders'] }) });
  const completeOrder = useMutation({ mutationFn: ({ id, data }: any) => maintenanceApi.completeOrder(id, data), onSuccess: () => { qc.invalidateQueries({ queryKey: ['maint-orders'] }); setCompleteId(null); } });
  const reportBreakdown = useMutation({ mutationFn: (d: any) => maintenanceApi.reportBreakdown(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['maint-breakdowns'] }); setShowBreakdownModal(false); } });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Plant Maintenance</h1>
          <p className="text-gray-500 text-sm mt-1">Equipment, maintenance orders, and breakdown management</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border"><div className="text-sm text-gray-500">Equipment</div><div className="text-2xl font-bold">{equipment.length}</div></div>
        <div className="bg-white rounded-xl p-4 border"><div className="text-sm text-gray-500">Open Orders</div><div className="text-2xl font-bold text-blue-600">{orders.filter((o: any) => o.status === 'OPEN').length}</div></div>
        <div className="bg-white rounded-xl p-4 border"><div className="text-sm text-gray-500">In Progress</div><div className="text-2xl font-bold text-yellow-600">{orders.filter((o: any) => o.status === 'IN_PROGRESS').length}</div></div>
        <div className="bg-white rounded-xl p-4 border"><div className="text-sm text-gray-500">Open Breakdowns</div><div className="text-2xl font-bold text-red-600">{breakdowns.filter((b: any) => b.status === 'OPEN').length}</div></div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b">
        {(['orders', 'equipment', 'plans', 'breakdowns'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={clsx('px-4 py-2 text-sm font-medium capitalize', tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700')}>
            {t === 'orders' ? 'Work Orders' : t === 'equipment' ? 'Equipment' : t === 'plans' ? 'Maintenance Plans' : 'Breakdowns'}
          </button>
        ))}
      </div>

      {tab === 'orders' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowOrderModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
              <Plus className="h-4 w-4" /> New Work Order
            </button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>{['Order #', 'Type', 'Priority', 'Status', 'Planned Start', 'Actions'].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">{h}</th>)}</tr></thead>
              <tbody>
                {orders.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No maintenance orders</td></tr>}
                {orders.map((order: any) => (
                  <tr key={order.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{order.orderNumber}</td>
                    <td className="px-4 py-3">{order.type}</td>
                    <td className="px-4 py-3"><span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', order.priority === 'CRITICAL' ? 'bg-red-100 text-red-800' : order.priority === 'HIGH' ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-600')}>{order.priority}</span></td>
                    <td className="px-4 py-3"><span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', orderStatusColor(order.status))}>{order.status}</span></td>
                    <td className="px-4 py-3">{order.plannedStartDate ?? '—'}</td>
                    <td className="px-4 py-3 flex gap-2">
                      {order.status === 'OPEN' && <button onClick={() => startOrder.mutate(order.id)} className="flex items-center gap-1 text-xs text-blue-600 hover:underline"><Play className="h-3 w-3" />Start</button>}
                      {order.status === 'IN_PROGRESS' && <button onClick={() => setCompleteId(order.id)} className="flex items-center gap-1 text-xs text-green-600 hover:underline"><CheckCircle className="h-3 w-3" />Complete</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'equipment' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowEquipmentModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
              <Plus className="h-4 w-4" /> Add Equipment
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {equipment.length === 0 && <div className="col-span-2 text-center py-8 text-gray-400">No equipment registered</div>}
            {equipment.map((eq: any) => (
              <div key={eq.id} className="bg-white rounded-xl border p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-semibold">{eq.name}</div>
                    <div className="text-xs text-gray-500">{eq.equipmentCode} · {eq.type ?? 'General'}</div>
                    {eq.location && <div className="text-xs text-gray-600 mt-0.5">📍 {eq.location}</div>}
                    {eq.manufacturer && <div className="text-xs text-gray-600">Manufacturer: {eq.manufacturer} {eq.model ? `| ${eq.model}` : ''}</div>}
                  </div>
                  <span className={clsx('text-xs px-2 py-0.5 rounded-full', equipmentStatusColor(eq.status))}>{eq.status.replace('_', ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'plans' && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>{['Name', 'Type', 'Frequency', 'Next Due', 'Last Executed', 'Active'].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">{h}</th>)}</tr></thead>
            <tbody>
              {plans.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No maintenance plans</td></tr>}
              {plans.map((plan: any) => (
                <tr key={plan.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{plan.name}</td>
                  <td className="px-4 py-3">{plan.planType}</td>
                  <td className="px-4 py-3">{plan.frequencyDays ? `${plan.frequencyDays} days` : '—'}</td>
                  <td className="px-4 py-3">{plan.nextDueDate ?? '—'}</td>
                  <td className="px-4 py-3">{plan.lastExecutedDate ?? '—'}</td>
                  <td className="px-4 py-3"><span className={clsx('px-2 py-0.5 rounded-full text-xs', plan.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600')}>{plan.isActive ? 'Yes' : 'No'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'breakdowns' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowBreakdownModal(true)} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-red-700">
              <AlertTriangle className="h-4 w-4" /> Report Breakdown
            </button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>{['Severity', 'Description', 'Status', 'Reported At', 'Resolved At'].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">{h}</th>)}</tr></thead>
              <tbody>
                {breakdowns.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No breakdowns reported</td></tr>}
                {breakdowns.map((b: any) => (
                  <tr key={b.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3"><span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', b.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' : b.severity === 'HIGH' ? 'bg-orange-100 text-orange-800' : 'bg-yellow-100 text-yellow-800')}>{b.severity}</span></td>
                    <td className="px-4 py-3 max-w-xs truncate">{b.description}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">{b.status}</span></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{new Date(b.reportedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{b.resolvedAt ? new Date(b.resolvedAt).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Equipment Modal */}
      {showEquipmentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[480px]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); createEquipment.mutate({ equipmentCode: f.get('equipmentCode'), name: f.get('name'), type: f.get('type') || undefined, location: f.get('location') || undefined, manufacturer: f.get('manufacturer') || undefined, model: f.get('model') || undefined }); }}>
            <h2 className="text-lg font-semibold mb-4">Add Equipment</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Equipment Code</label><input name="equipmentCode" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Name</label><input name="name" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Type</label><input name="type" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Location</label><input name="location" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Manufacturer</label><input name="manufacturer" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Model</label><input name="model" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowEquipmentModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Add</button>
            </div>
          </form>
        </div>
      )}

      {/* New Work Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[480px]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); createOrder.mutate({ equipmentId: f.get('equipmentId'), type: f.get('type'), priority: f.get('priority'), description: f.get('description') || undefined, plannedStartDate: f.get('plannedStartDate') || undefined, plannedEndDate: f.get('plannedEndDate') || undefined }); }}>
            <h2 className="text-lg font-semibold mb-4">New Work Order</h2>
            <div className="space-y-3">
              <div><label className="text-xs text-gray-500">Equipment ID (UUID)</label><input name="equipmentId" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="Equipment UUID" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Type</label>
                  <select name="type" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                    <option value="PREVENTIVE">Preventive</option><option value="BREAKDOWN">Breakdown</option><option value="CORRECTIVE">Corrective</option>
                  </select>
                </div>
                <div><label className="text-xs text-gray-500">Priority</label>
                  <select name="priority" className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                    <option value="MEDIUM">Medium</option><option value="LOW">Low</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
                  </select>
                </div>
              </div>
              <div><label className="text-xs text-gray-500">Description</label><textarea name="description" rows={2} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Planned Start</label><input name="plannedStartDate" type="date" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Planned End</label><input name="plannedEndDate" type="date" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowOrderModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
            </div>
          </form>
        </div>
      )}

      {/* Report Breakdown Modal */}
      {showBreakdownModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[480px]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); reportBreakdown.mutate({ equipmentId: f.get('equipmentId'), description: f.get('description'), severity: f.get('severity') }); }}>
            <h2 className="text-lg font-semibold mb-4">Report Equipment Breakdown</h2>
            <div className="space-y-3">
              <div><label className="text-xs text-gray-500">Equipment ID (UUID)</label><input name="equipmentId" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="Equipment UUID" /></div>
              <div><label className="text-xs text-gray-500">Description</label><textarea name="description" required rows={3} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-xs text-gray-500">Severity</label>
                <select name="severity" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                  <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowBreakdownModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700">Report</button>
            </div>
          </form>
        </div>
      )}

      {/* Complete Order Modal */}
      {completeId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[400px]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); completeOrder.mutate({ id: completeId, data: { actualEndDate: f.get('actualEndDate'), laborHours: f.get('laborHours') ? Number(f.get('laborHours')) : undefined, notes: f.get('notes') || undefined } }); }}>
            <h2 className="text-lg font-semibold mb-4">Complete Work Order</h2>
            <div className="space-y-3">
              <div><label className="text-xs text-gray-500">Actual End Date</label><input name="actualEndDate" type="date" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-xs text-gray-500">Labor Hours</label><input name="laborHours" type="number" step="0.5" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-xs text-gray-500">Notes</label><textarea name="notes" rows={2} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setCompleteId(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700">Complete</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
