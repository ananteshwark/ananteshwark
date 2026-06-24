import { useState, useEffect } from 'react';
import { manufacturingApi } from '../../api/manufacturing';

const SLOT_STATUS_STYLES: Record<string, string> = {
  SCHEDULED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-400',
};

function CapacityLoadTab() {
  const today = new Date().toISOString().split('T')[0];
  const twoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(twoWeeks);
  const [allLoads, setAllLoads] = useState<any[]>([]);

  async function load() {
    try {
      const res = await manufacturingApi.getAllCapacityLoads(from, to);
      setAllLoads(res.data?.data ?? res.data ?? []);
    } catch {}
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Capacity Load Overview</h2>
      <div className="flex gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <button onClick={load} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">Load</button>
      </div>

      {allLoads.map((wc: any) => (
        <div key={wc.workCenter.id} className="border rounded p-4">
          <h3 className="font-medium mb-3">{wc.workCenter.name}</h3>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="p-2 border">Date</th>
                <th className="p-2 border text-right">Available (min)</th>
                <th className="p-2 border text-right">Setup</th>
                <th className="p-2 border text-right">Load</th>
                <th className="p-2 border text-right">Utilization</th>
                <th className="p-2 border">Status</th>
              </tr>
            </thead>
            <tbody>
              {wc.load.map((day: any) => (
                <tr key={day.date} className={`hover:bg-gray-50 ${day.overloaded ? 'bg-red-50' : ''}`}>
                  <td className="p-2 border">{day.date}</td>
                  <td className="p-2 border text-right">{day.availableMinutes}</td>
                  <td className="p-2 border text-right">{day.setupMinutes}</td>
                  <td className="p-2 border text-right">{day.loadMinutes}</td>
                  <td className="p-2 border text-right">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-200 rounded h-2">
                        <div
                          className={`h-2 rounded ${day.utilizationPct > 100 ? 'bg-red-500' : day.utilizationPct > 80 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${Math.min(100, day.utilizationPct)}%` }}
                        />
                      </div>
                      <span className="text-xs w-10 text-right">{day.utilizationPct}%</span>
                    </div>
                  </td>
                  <td className="p-2 border">
                    {day.overloaded && <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">OVERLOADED</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {allLoads.length === 0 && (
        <p className="text-gray-400 text-sm text-center py-4">Click Load to see capacity data</p>
      )}
    </div>
  );
}

function OrderSchedulingTab() {
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState('');
  const [slots, setSlots] = useState<any[]>([]);
  const [scheduling, setScheduling] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    manufacturingApi.getOrders?.({ limit: 50 })?.then((res: any) => {
      const data = res.data?.data?.items ?? res.data?.items ?? res.data?.data ?? res.data ?? [];
      setOrders(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  async function loadSlots(orderId: string) {
    if (!orderId) return;
    try {
      const res = await manufacturingApi.getOrderSlots(orderId);
      setSlots(res.data?.data ?? res.data ?? []);
    } catch {}
  }

  async function handleSchedule() {
    if (!selectedOrder) return;
    setScheduling(true);
    setResult(null);
    try {
      const res = await manufacturingApi.scheduleOrder(selectedOrder);
      const created = res.data?.data ?? res.data ?? [];
      setResult(`Scheduled ${Array.isArray(created) ? created.length : 1} operation slot(s)`);
      loadSlots(selectedOrder);
    } catch (err: any) {
      setResult(`Error: ${err?.response?.data?.message ?? 'Scheduling failed'}`);
    } finally {
      setScheduling(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Production Order Scheduling</h2>
      <div className="flex gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">Select Production Order</label>
          <select
            className="border rounded px-3 py-1.5 text-sm"
            value={selectedOrder}
            onChange={e => { setSelectedOrder(e.target.value); setSlots([]); setResult(null); if (e.target.value) loadSlots(e.target.value); }}
          >
            <option value="">— choose order —</option>
            {orders.map((o: any) => (
              <option key={o.id} value={o.id}>{o.orderNumber} — {o.finishedItemName} ({o.plannedQuantity})</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleSchedule}
          disabled={!selectedOrder || scheduling}
          className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50"
        >
          {scheduling ? 'Scheduling…' : 'Schedule with FCS'}
        </button>
      </div>

      {result && (
        <div className={`border rounded p-3 text-sm ${result.startsWith('Error') ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          {result}
        </div>
      )}

      {slots.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-2 border">Operation</th>
              <th className="p-2 border">Scheduled Start</th>
              <th className="p-2 border">Scheduled End</th>
              <th className="p-2 border text-right">Load (min)</th>
              <th className="p-2 border text-right">Setup (min)</th>
              <th className="p-2 border">Status</th>
            </tr>
          </thead>
          <tbody>
            {slots.map((s: any) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="p-2 border">{s.operationName ?? '—'}</td>
                <td className="p-2 border">{new Date(s.scheduledStart).toLocaleString()}</td>
                <td className="p-2 border">{new Date(s.scheduledEnd).toLocaleString()}</td>
                <td className="p-2 border text-right">{s.loadMinutes}</td>
                <td className="p-2 border text-right">{s.setupMinutes}</td>
                <td className="p-2 border">
                  <span className={`px-2 py-0.5 rounded text-xs ${SLOT_STATUS_STYLES[s.status] ?? ''}`}>{s.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

const TABS = [
  { key: 'load', label: 'Capacity Load' },
  { key: 'schedule', label: 'Order Scheduling' },
];

export default function FcsPage() {
  const [tab, setTab] = useState('load');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Finite Capacity Scheduling</h1>
        <p className="text-gray-500 text-sm mt-1">Schedule production orders against real work center capacity, detect overloads</p>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'load' && <CapacityLoadTab />}
        {tab === 'schedule' && <OrderSchedulingTab />}
      </div>
    </div>
  );
}
