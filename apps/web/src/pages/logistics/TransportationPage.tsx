import { useState, useEffect } from 'react';
import { logisticsApi } from '../../api/logistics';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PLAN_STATUS: Record<string, string> = {
  PLANNED: 'bg-gray-100 text-gray-600', TENDERED: 'bg-blue-100 text-blue-700',
  IN_TRANSIT: 'bg-yellow-100 text-yellow-700', DELIVERED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700',
};

function CarriersTab() {
  const [carriers, setCarriers] = useState<any[]>([]);
  const [rates, setRates] = useState<any[]>([]);
  const [cForm, setCForm] = useState({ code: '', name: '', serviceLevel: 'STANDARD', transitDays: 3 });
  const [rForm, setRForm] = useState({ carrierId: '', originZone: '', destZone: '', flatRate: 0, ratePerKg: 0, fuelSurchargePct: 0, maxWeight: 1000 });

  useEffect(() => { load(); }, []);
  async function load() { setCarriers(unwrap(await logisticsApi.listCarriers())); setRates(unwrap(await logisticsApi.listRates())); }
  async function createCarrier(e: React.FormEvent) { e.preventDefault(); await logisticsApi.createCarrier(cForm); setCForm({ code: '', name: '', serviceLevel: 'STANDARD', transitDays: 3 }); load(); }
  async function createRate(e: React.FormEvent) { e.preventDefault(); await logisticsApi.createRate(rForm); setRForm({ ...rForm, originZone: '', destZone: '', flatRate: 0, ratePerKg: 0 }); load(); }

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-3">
        <form onSubmit={createCarrier} className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg items-end">
          <div><label className="text-xs text-gray-500">Code</label><input required value={cForm.code} onChange={(e) => setCForm({ ...cForm, code: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Name</label><input required value={cForm.name} onChange={(e) => setCForm({ ...cForm, name: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Transit Days</label><input type="number" value={cForm.transitDays} onChange={(e) => setCForm({ ...cForm, transitDays: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Carrier</button>
        </form>
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Service</th><th className="px-3 py-2 text-right">Transit</th></tr></thead>
            <tbody className="divide-y">
              {carriers.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No carriers.</td></tr> : carriers.map((c) => (
                <tr key={c.id}><td className="px-3 py-2 font-mono text-xs">{c.code}</td><td className="px-3 py-2">{c.name}</td><td className="px-3 py-2 text-xs">{c.serviceLevel}</td><td className="px-3 py-2 text-right">{c.transitDays}d</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="space-y-3">
        <form onSubmit={createRate} className="grid grid-cols-3 gap-2 bg-gray-50 p-3 rounded-lg items-end">
          <div className="col-span-3"><label className="text-xs text-gray-500">Carrier</label><select required value={rForm.carrierId} onChange={(e) => setRForm({ ...rForm, carrierId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm"><option value="">Select…</option>{carriers.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</select></div>
          <div><label className="text-xs text-gray-500">Origin Zone</label><input required value={rForm.originZone} onChange={(e) => setRForm({ ...rForm, originZone: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Dest Zone</label><input required value={rForm.destZone} onChange={(e) => setRForm({ ...rForm, destZone: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Flat Rate</label><input type="number" value={rForm.flatRate} onChange={(e) => setRForm({ ...rForm, flatRate: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Rate/kg</label><input type="number" value={rForm.ratePerKg} onChange={(e) => setRForm({ ...rForm, ratePerKg: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Fuel %</label><input type="number" value={rForm.fuelSurchargePct} onChange={(e) => setRForm({ ...rForm, fuelSurchargePct: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm col-span-3 w-fit">+ Rate</button>
        </form>
        <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Lane</th><th className="px-3 py-2 text-right">Flat</th><th className="px-3 py-2 text-right">/kg</th><th className="px-3 py-2 text-right">Fuel</th></tr></thead>
            <tbody className="divide-y">
              {rates.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No rates.</td></tr> : rates.map((r) => (
                <tr key={r.id}><td className="px-3 py-2 text-xs">{r.originZone}→{r.destZone}</td><td className="px-3 py-2 text-right">{money(r.flatRate)}</td><td className="px-3 py-2 text-right">{money(r.ratePerKg)}</td><td className="px-3 py-2 text-right">{r.fuelSurchargePct}%</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function RateShopTab() {
  const [form, setForm] = useState({ originZone: '', destZone: '', weight: 100 });
  const [quotes, setQuotes] = useState<any[] | null>(null);
  async function shop() {
    try { setQuotes(unwrap(await logisticsApi.rateShop(form))); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-end bg-gray-50 p-3 rounded-lg">
        <div><label className="text-xs text-gray-500">Origin Zone</label><input value={form.originZone} onChange={(e) => setForm({ ...form, originZone: e.target.value })} className="border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Dest Zone</label><input value={form.destZone} onChange={(e) => setForm({ ...form, destZone: e.target.value })} className="border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Weight (kg)</label><input type="number" value={form.weight} onChange={(e) => setForm({ ...form, weight: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm w-28" /></div>
        <button onClick={shop} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Rate Shop</button>
      </div>
      {quotes && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Carrier</th><th className="px-3 py-2 text-left">Service</th><th className="px-3 py-2 text-right">Transit</th><th className="px-3 py-2 text-right">Cost</th></tr></thead>
            <tbody className="divide-y">
              {quotes.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No carriers serve this lane/weight.</td></tr> : quotes.map((q, i) => (
                <tr key={q.rateId} className={i === 0 ? 'bg-green-50' : ''}>
                  <td className="px-3 py-2 font-medium">{q.carrierName} {i === 0 && <span className="text-xs text-green-600">✓ cheapest</span>}</td>
                  <td className="px-3 py-2 text-xs">{q.serviceLevel}</td>
                  <td className="px-3 py-2 text-right">{q.transitDays}d</td>
                  <td className="px-3 py-2 text-right font-medium">{money(q.cost)} {q.currency}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ShipmentsTab() {
  const [plans, setPlans] = useState<any[]>([]);
  const [form, setForm] = useState({ deliveryIds: '', originZone: '', destZone: '', totalWeight: 0, totalVolume: 0, weightCapacity: 0, volumeCapacity: 0 });

  useEffect(() => { load(); }, []);
  async function load() { setPlans(unwrap(await logisticsApi.listShipments())); }
  async function plan(e: React.FormEvent) {
    e.preventDefault();
    try {
      await logisticsApi.planShipment({ ...form, deliveryIds: form.deliveryIds.split(',').map((s) => s.trim()).filter(Boolean) });
      setForm({ deliveryIds: '', originZone: '', destZone: '', totalWeight: 0, totalVolume: 0, weightCapacity: 0, volumeCapacity: 0 });
      load();
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function audit(id: string) {
    const amt = prompt('Carrier invoiced amount:'); if (!amt) return;
    const res = await logisticsApi.freightAudit(id, Number(amt));
    const r = res.data?.data ?? res.data;
    alert(`${r.recommendation}: planned ${r.plannedFreightCost}, invoiced ${r.invoicedAmount}, variance ${r.variancePct}%`);
    load();
  }

  return (
    <div className="space-y-3">
      <form onSubmit={plan} className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <div className="col-span-2"><label className="text-xs text-gray-500">Delivery IDs (comma-sep)</label><input required value={form.deliveryIds} onChange={(e) => setForm({ ...form, deliveryIds: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Origin Zone</label><input value={form.originZone} onChange={(e) => setForm({ ...form, originZone: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Dest Zone</label><input value={form.destZone} onChange={(e) => setForm({ ...form, destZone: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Total Weight</label><input type="number" value={form.totalWeight || ''} onChange={(e) => setForm({ ...form, totalWeight: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Weight Cap</label><input type="number" value={form.weightCapacity || ''} onChange={(e) => setForm({ ...form, weightCapacity: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Volume / Cap</label><div className="flex gap-1"><input type="number" placeholder="vol" value={form.totalVolume || ''} onChange={(e) => setForm({ ...form, totalVolume: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /><input type="number" placeholder="cap" value={form.volumeCapacity || ''} onChange={(e) => setForm({ ...form, volumeCapacity: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div></div>
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Plan Shipment</button>
      </form>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Shipment</th><th className="px-3 py-2 text-left">Lane</th><th className="px-3 py-2 text-right">Wt Util</th><th className="px-3 py-2 text-right">Vol Util</th><th className="px-3 py-2 text-right">Freight</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">
            {plans.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No shipment plans.</td></tr> : plans.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{p.shipmentNumber}</td>
                <td className="px-3 py-2 text-xs">{p.originZone}→{p.destZone}</td>
                <td className="px-3 py-2 text-right">{p.weightUtilizationPct}%</td>
                <td className="px-3 py-2 text-right">{p.volumeUtilizationPct}%</td>
                <td className="px-3 py-2 text-right">{money(p.plannedFreightCost)}</td>
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${PLAN_STATUS[p.status]}`}>{p.status}</span></td>
                <td className="px-3 py-2"><button onClick={() => audit(p.id)} className="text-indigo-600 text-xs hover:underline">audit freight</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TABS = ['Carriers & Rates', 'Rate Shop', 'Shipments'];

export default function TransportationPage() {
  const [tab, setTab] = useState('Carriers & Rates');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Transportation Management</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle OTM parity — carrier master, freight rate tables with rate shopping (cheapest-carrier
          selection), shipment planning with weight/volume utilization, and freight audit vs invoice.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Carriers & Rates' && <CarriersTab />}
      {tab === 'Rate Shop' && <RateShopTab />}
      {tab === 'Shipments' && <ShipmentsTab />}
    </div>
  );
}
