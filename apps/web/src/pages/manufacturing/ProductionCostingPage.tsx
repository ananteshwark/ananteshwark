import { useState, useEffect, Fragment } from 'react';
import { Calculator, CheckCircle, ClipboardList } from 'lucide-react';
import { manufacturingApi } from '../../api/manufacturing';

function fmt(n: any) {
  return Number(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ConfirmModal({ order, workCenters, onClose, onDone }: { order: any; workCenters: any[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    operationSequence: '10', workCenterId: workCenters[0]?.id || '', confirmedQty: '0', actualMinutes: '0',
    confirmationDate: new Date().toISOString().slice(0, 10),
  });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await manufacturingApi.confirmOperation(order.id, {
        operationSequence: form.operationSequence ? parseInt(form.operationSequence, 10) : undefined,
        workCenterId: form.workCenterId || undefined,
        confirmedQty: parseFloat(form.confirmedQty || '0'),
        actualMinutes: parseInt(form.actualMinutes || '0', 10),
        confirmationDate: form.confirmationDate,
      });
      onDone();
    } finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-1">Confirm Operation</h2>
        <p className="text-xs text-gray-500 mb-4">{order.orderNumber} — {order.finishedItemName}</p>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Operation Seq</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.operationSequence} onChange={e => setForm(p => ({ ...p, operationSequence: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Work Center</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.workCenterId} onChange={e => setForm(p => ({ ...p, workCenterId: e.target.value }))}>
                <option value="">—</option>
                {workCenters.map((w: any) => <option key={w.id} value={w.id}>{w.code}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Confirmed Qty</label>
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.confirmedQty} onChange={e => setForm(p => ({ ...p, confirmedQty: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Actual Minutes</label>
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.actualMinutes} onChange={e => setForm(p => ({ ...p, actualMinutes: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date</label>
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.confirmationDate} onChange={e => setForm(p => ({ ...p, confirmationDate: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">{saving ? 'Saving...' : 'Confirm'}</button>
        </div>
      </div>
    </div>
  );
}

function CostSheet({ orderId }: { orderId: string }) {
  const [sheet, setSheet] = useState<any>(null);
  useEffect(() => {
    manufacturingApi.getCostSheet(orderId).then(r => setSheet(r.data?.data ?? r.data)).catch(() => setSheet(null));
  }, [orderId]);
  if (!sheet) return <div className="p-4 text-sm text-gray-400">Loading cost sheet...</div>;
  return (
    <div className="p-4 bg-gray-50 border-t space-y-3">
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-gray-500"><th className="text-left py-1">Cost</th><th className="text-right py-1">Planned</th><th className="text-right py-1">Actual</th><th className="text-right py-1">Variance</th></tr></thead>
        <tbody>
          <tr><td className="py-1">Material</td><td className="text-right">{fmt(sheet.planned?.materialCost)}</td><td className="text-right">{fmt(sheet.actual?.materialCost)}</td><td className={`text-right ${Number(sheet.variance?.material) > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(sheet.variance?.material)}</td></tr>
          <tr><td className="py-1">Labor</td><td className="text-right">{fmt(sheet.planned?.laborCost)}</td><td className="text-right">{fmt(sheet.actual?.laborCost)}</td><td className={`text-right ${Number(sheet.variance?.labor) > 0 ? 'text-red-600' : 'text-green-600'}`}>{fmt(sheet.variance?.labor)}</td></tr>
          <tr className="font-semibold border-t"><td className="py-1">Total</td><td className="text-right">{fmt(sheet.planned?.totalCost)}</td><td className="text-right">{fmt(sheet.actual?.totalCost)}</td><td className="text-right">{fmt(Number(sheet.variance?.material ?? 0) + Number(sheet.variance?.labor ?? 0))}</td></tr>
        </tbody>
      </table>
      <div className="flex gap-6 text-xs text-gray-600">
        <span>WIP Balance: <b>{fmt(sheet.wipBalance)}</b></span>
        <span>Cost Status: <b>{sheet.costStatus}</b></span>
        <span>Issuances: <b>{sheet.issuances?.length ?? 0}</b></span>
        <span>Confirmations: <b>{sheet.confirmations?.length ?? 0}</b></span>
      </div>
    </div>
  );
}

export default function ProductionCostingPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [workCenters, setWorkCenters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<any>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      manufacturingApi.getOrders({ limit: 100 }),
      manufacturingApi.getWorkCenters(),
    ]).then(([r1, r2]) => {
      setOrders(r1.data?.items ?? r1.data?.data?.items ?? []);
      setWorkCenters(r2.data?.data ?? r2.data ?? []);
    }).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const calc = async (id: string) => { setActing(id); try { await manufacturingApi.calculateCost(id); load(); } finally { setActing(null); } };
  const settle = async (id: string) => { setActing(id); try { await manufacturingApi.settleOrder(id); load(); } finally { setActing(null); } };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Production Order Costing</h1>
        <p className="text-sm text-gray-500 mt-0.5">Planned vs actual material & labor cost, confirmations and settlement</p>
      </div>

      <div className="bg-white rounded-xl border">
        {loading ? <div className="p-8 text-center text-gray-400">Loading...</div> : orders.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No production orders.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>{['Order #', 'Item', 'Planned', 'Actual', 'WIP', 'Cost Status', ''].map(h => <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((o: any) => (
                <Fragment key={o.id}>
                  <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpanded(expanded === o.id ? null : o.id)}>
                    <td className="px-4 py-2 font-mono text-xs font-medium">{o.orderNumber}</td>
                    <td className="px-4 py-2">{o.finishedItemName}</td>
                    <td className="px-4 py-2 text-right">{fmt(Number(o.plannedMaterialCost ?? 0) + Number(o.plannedLaborCost ?? 0))}</td>
                    <td className="px-4 py-2 text-right">{fmt(Number(o.actualMaterialCost ?? 0) + Number(o.actualLaborCost ?? 0))}</td>
                    <td className="px-4 py-2 text-right">{fmt(o.wipBalance)}</td>
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded-full text-xs ${o.costStatus === 'SETTLED' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{o.costStatus ?? 'OPEN'}</span></td>
                    <td className="px-4 py-2" onClick={e => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button onClick={() => calc(o.id)} disabled={acting === o.id} className="flex items-center gap-1 text-xs text-blue-600 border border-blue-300 rounded px-2 py-1 hover:bg-blue-50"><Calculator className="h-3 w-3" /> Cost</button>
                        <button onClick={() => setConfirmTarget(o)} className="flex items-center gap-1 text-xs text-purple-600 border border-purple-300 rounded px-2 py-1 hover:bg-purple-50"><ClipboardList className="h-3 w-3" /> Confirm</button>
                        {o.costStatus !== 'SETTLED' && (
                          <button onClick={() => settle(o.id)} disabled={acting === o.id} className="flex items-center gap-1 text-xs text-green-600 border border-green-300 rounded px-2 py-1 hover:bg-green-50"><CheckCircle className="h-3 w-3" /> Settle</button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded === o.id && (
                    <tr><td colSpan={7} className="p-0"><CostSheet orderId={o.id} /></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {confirmTarget && (
        <ConfirmModal order={confirmTarget} workCenters={workCenters} onClose={() => setConfirmTarget(null)} onDone={() => { setConfirmTarget(null); load(); }} />
      )}
    </div>
  );
}
