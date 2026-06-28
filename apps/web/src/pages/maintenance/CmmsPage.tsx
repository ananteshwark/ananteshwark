import { useState } from 'react';
import { cmmsApi } from '../../api/cmms';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function PartsTab() {
  const [orderId, setOrderId] = useState('');
  const [parts, setParts] = useState<any[]>([]);
  const [form, setForm] = useState({ itemId: '', itemName: '', qtyReserved: 1, unitCost: 0 });

  async function load() { if (orderId) setParts(unwrap(await cmmsApi.listParts(orderId))); }
  async function reserve(e: React.FormEvent) {
    e.preventDefault();
    try { await cmmsApi.reservePart({ maintenanceOrderId: orderId, ...form }); setForm({ itemId: '', itemName: '', qtyReserved: 1, unitCost: 0 }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-center">
        <label className="text-sm text-gray-600">Work Order ID:</label>
        <input value={orderId} onChange={(e) => setOrderId(e.target.value)} className="border rounded px-2 py-1 text-sm font-mono w-80" />
        <button onClick={load} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Load</button>
        {orderId && <button onClick={async () => { await cmmsApi.issueAllParts(orderId); load(); }} className="bg-green-600 text-white px-3 py-1.5 rounded text-sm">Issue All</button>}
      </div>
      {orderId && (
        <form onSubmit={reserve} className="grid grid-cols-5 gap-2 bg-gray-50 p-3 rounded-lg items-end">
          <div><label className="text-xs text-gray-500">Item ID</label><input required value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
          <div><label className="text-xs text-gray-500">Name</label><input value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Qty</label><input type="number" value={form.qtyReserved} onChange={(e) => setForm({ ...form, qtyReserved: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Unit Cost</label><input type="number" value={form.unitCost} onChange={(e) => setForm({ ...form, unitCost: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Reserve</button>
        </form>
      )}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Reserved</th><th className="px-3 py-2 text-right">Issued</th><th className="px-3 py-2 text-right">Unit Cost</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">
            {parts.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No parts.</td></tr> : parts.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2">{p.itemName ?? p.itemId?.slice(0, 8)}</td>
                <td className="px-3 py-2 text-right">{p.qtyReserved}</td>
                <td className="px-3 py-2 text-right">{p.qtyIssued}</td>
                <td className="px-3 py-2 text-right">{money(p.unitCost)}</td>
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${p.status === 'ISSUED' ? 'bg-green-100 text-green-700' : p.status === 'CANCELLED' ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-700'}`}>{p.status}</span></td>
                <td className="px-3 py-2">{p.status === 'RESERVED' && <><button onClick={async () => { await cmmsApi.issuePart(p.id); load(); }} className="text-green-600 text-xs hover:underline mr-2">issue</button><button onClick={async () => { await cmmsApi.cancelPart(p.id); load(); }} className="text-red-500 text-xs hover:underline">cancel</button></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WarrantyTab() {
  const [warranties, setWarranties] = useState<any[]>([]);
  const [form, setForm] = useState({ equipmentId: '', provider: '', startDate: '', endDate: '', policyNumber: '' });

  async function load() { setWarranties(unwrap(await cmmsApi.listWarranties())); }
  useState(() => { load(); });
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await cmmsApi.createWarranty(form); setForm({ equipmentId: '', provider: '', startDate: '', endDate: '', policyNumber: '' }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-5 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <div><label className="text-xs text-gray-500">Equipment ID</label><input required value={form.equipmentId} onChange={(e) => setForm({ ...form, equipmentId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Provider</label><input required value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Start</label><input type="date" required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">End</label><input type="date" required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Warranty</button>
      </form>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Equipment</th><th className="px-3 py-2 text-left">Provider</th><th className="px-3 py-2 text-left">Window</th><th className="px-3 py-2 text-right">Claims</th><th className="px-3 py-2 text-right">Claimed</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">
            {warranties.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No warranties.</td></tr> : warranties.map((w) => (
              <tr key={w.id}>
                <td className="px-3 py-2 font-mono text-xs">{w.equipmentId?.slice(0, 8)}</td>
                <td className="px-3 py-2">{w.provider}</td>
                <td className="px-3 py-2 text-xs">{w.startDate} → {w.endDate}</td>
                <td className="px-3 py-2 text-right">{w.claimCount}</td>
                <td className="px-3 py-2 text-right">{money(w.claimedAmount)}</td>
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${w.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>{w.status}</span></td>
                <td className="px-3 py-2">{w.status === 'ACTIVE' && <button onClick={async () => { const a = prompt('Claim amount:'); if (a) { await cmmsApi.claimWarranty(w.id, Number(a)); load(); } }} className="text-indigo-600 text-xs hover:underline">claim</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoryTab() {
  const [eqId, setEqId] = useState('');
  const [hist, setHist] = useState<any>(null);
  async function load() { if (!eqId) return; const r = await cmmsApi.serviceHistory(eqId); setHist(r.data?.data ?? r.data); }
  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <input value={eqId} onChange={(e) => setEqId(e.target.value)} placeholder="Equipment ID" className="border rounded px-2 py-1 text-sm font-mono w-80" />
        <button onClick={load} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Load History</button>
      </div>
      {hist && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3">
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Work Orders</p><p className="text-2xl font-bold">{hist.workOrderCount}</p></div>
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Labor Hours</p><p className="text-2xl font-bold">{hist.totalLaborHours}</p></div>
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Parts Cost</p><p className="text-2xl font-bold">{money(hist.totalPartsCost)}</p></div>
            <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Total Cost</p><p className="text-2xl font-bold text-indigo-600">{money(hist.totalCost)}</p></div>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Order</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-right">Labor</th><th className="px-3 py-2 text-right">Parts Cost</th><th className="px-3 py-2 text-right">Order Cost</th></tr></thead>
              <tbody className="divide-y">
                {(hist.history ?? []).map((h: any, i: number) => (
                  <tr key={i}><td className="px-3 py-2 font-mono text-xs">{h.orderNumber}</td><td className="px-3 py-2 text-xs">{h.type}</td><td className="px-3 py-2 text-xs">{h.status}</td><td className="px-3 py-2 text-right">{h.laborHours}</td><td className="px-3 py-2 text-right">{money(h.partsCost)}</td><td className="px-3 py-2 text-right">{money(h.orderCost)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = ['WO Parts', 'Warranties', 'Service History'];

export default function CmmsPage() {
  const [tab, setTab] = useState('WO Parts');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Maintenance (CMMS)</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Maintenance Cloud parity — work-order parts reservation & issue, asset warranty tracking
          with claims, and full asset service history with cost rollup.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'WO Parts' && <PartsTab />}
      {tab === 'Warranties' && <WarrantyTab />}
      {tab === 'Service History' && <HistoryTab />}
    </div>
  );
}
