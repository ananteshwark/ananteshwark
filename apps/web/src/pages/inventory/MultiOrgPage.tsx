import { useState, useEffect } from 'react';
import { inventoryApi } from '../../api/inventory';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TRANSFER_STATUS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', SHIPPED: 'bg-blue-100 text-blue-700',
  RECEIVED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700',
};
const COST_METHODS = ['MOVING_AVERAGE', 'STANDARD', 'FIFO'];

function OrgsTab() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [form, setForm] = useState({ code: '', name: '', costMethod: 'MOVING_AVERAGE', parentOrgId: '' });
  const [show, setShow] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() { setOrgs(unwrap(await inventoryApi.listOrgs())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    await inventoryApi.createOrg({ ...form, parentOrgId: form.parentOrgId || undefined });
    setForm({ code: '', name: '', costMethod: 'MOVING_AVERAGE', parentOrgId: '' });
    setShow(false);
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Inventory Organizations</h2>
        <button onClick={() => setShow(!show)} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Org</button>
      </div>
      {show && (
        <form onSubmit={create} className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg items-end">
          <div><label className="text-xs text-gray-500">Code</label><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Cost Method</label><select value={form.costMethod} onChange={(e) => setForm({ ...form, costMethod: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">{COST_METHODS.map((m) => <option key={m}>{m}</option>)}</select></div>
          <div><label className="text-xs text-gray-500">Parent</label><select value={form.parentOrgId} onChange={(e) => setForm({ ...form, parentOrgId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm"><option value="">(root)</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}</select></div>
          <button type="submit" className="bg-indigo-600 text-white px-3 py-1 rounded text-sm col-span-4 w-fit">Create</button>
        </form>
      )}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Cost Method</th><th className="px-3 py-2 text-left">Currency</th></tr></thead>
          <tbody className="divide-y">
            {orgs.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No organizations.</td></tr> : orgs.map((o) => (
              <tr key={o.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{o.code}</td>
                <td className="px-3 py-2 font-medium">{o.name}</td>
                <td className="px-3 py-2"><span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">{o.costMethod}</span></td>
                <td className="px-3 py-2">{o.currency}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssignmentsTab() {
  const [assignments, setAssignments] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [form, setForm] = useState({ itemId: '', organizationId: '', standardCost: '' });

  useEffect(() => { load(); inventoryApi.listOrgs().then((r) => setOrgs(unwrap(r))); }, []);
  async function load() { setAssignments(unwrap(await inventoryApi.listItemOrgAssignments())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await inventoryApi.assignItemToOrg({ itemId: form.itemId, organizationId: form.organizationId, standardCost: form.standardCost ? Number(form.standardCost) : undefined });
      setForm({ itemId: '', organizationId: '', standardCost: '' });
      load();
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <div><label className="text-xs text-gray-500">Item ID</label><input required value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Organization</label><select required value={form.organizationId} onChange={(e) => setForm({ ...form, organizationId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm"><option value="">Select…</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}</select></div>
        <div><label className="text-xs text-gray-500">Std Cost (override)</label><input type="number" value={form.standardCost} onChange={(e) => setForm({ ...form, standardCost: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Assign</button>
      </form>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-left">Org</th><th className="px-3 py-2 text-right">Std Cost</th><th className="px-3 py-2 text-left">Active</th></tr></thead>
          <tbody className="divide-y">
            {assignments.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No assignments.</td></tr> : assignments.map((a) => (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{a.itemId?.slice(0, 8)}</td>
                <td className="px-3 py-2 font-mono text-xs">{orgs.find((o) => o.id === a.organizationId)?.code ?? a.organizationId?.slice(0, 8)}</td>
                <td className="px-3 py-2 text-right">{a.standardCost != null ? money(a.standardCost) : '—'}</td>
                <td className="px-3 py-2">{a.isActive ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TransfersTab() {
  const [transfers, setTransfers] = useState<any[]>([]);
  const [orgs, setOrgs] = useState<any[]>([]);
  const [form, setForm] = useState({ fromOrgId: '', toOrgId: '', itemId: '', quantity: 0, unitCost: 0, markupPct: 0, freightAmount: 0, taxAmount: 0 });

  useEffect(() => { load(); inventoryApi.listOrgs().then((r) => setOrgs(unwrap(r))); }, []);
  async function load() { setTransfers(unwrap(await inventoryApi.listInterOrgTransfers())); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try {
      await inventoryApi.createInterOrgTransfer(form);
      setForm({ fromOrgId: '', toOrgId: '', itemId: '', quantity: 0, unitCost: 0, markupPct: 0, freightAmount: 0, taxAmount: 0 });
      load();
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function act(id: string, action: string) {
    try {
      if (action === 'ship') await inventoryApi.shipInterOrgTransfer(id);
      else if (action === 'receive') await inventoryApi.receiveInterOrgTransfer(id);
      else if (action === 'cancel') await inventoryApi.cancelInterOrgTransfer(id);
      load();
    } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="space-y-3">
      <form onSubmit={create} className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <div><label className="text-xs text-gray-500">From Org</label><select required value={form.fromOrgId} onChange={(e) => setForm({ ...form, fromOrgId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm"><option value="">…</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}</select></div>
        <div><label className="text-xs text-gray-500">To Org</label><select required value={form.toOrgId} onChange={(e) => setForm({ ...form, toOrgId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm"><option value="">…</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.code}</option>)}</select></div>
        <div><label className="text-xs text-gray-500">Item ID</label><input required value={form.itemId} onChange={(e) => setForm({ ...form, itemId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
        <div><label className="text-xs text-gray-500">Quantity</label><input type="number" required value={form.quantity || ''} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Unit Cost</label><input type="number" value={form.unitCost || ''} onChange={(e) => setForm({ ...form, unitCost: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Markup %</label><input type="number" value={form.markupPct || ''} onChange={(e) => setForm({ ...form, markupPct: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Freight</label><input type="number" value={form.freightAmount || ''} onChange={(e) => setForm({ ...form, freightAmount: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Create Transfer</button>
      </form>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Transfer</th><th className="px-3 py-2 text-left">From→To</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Transfer Price</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">
            {transfers.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No transfers.</td></tr> : transfers.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{t.transferNumber}</td>
                <td className="px-3 py-2 text-xs">{orgs.find((o) => o.id === t.fromOrgId)?.code} → {orgs.find((o) => o.id === t.toOrgId)?.code}</td>
                <td className="px-3 py-2 text-right">{t.quantity}</td>
                <td className="px-3 py-2 text-right">{money(t.transferPrice)}</td>
                <td className="px-3 py-2 text-right font-medium">{money(t.totalValue)}</td>
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${TRANSFER_STATUS[t.status]}`}>{t.status}</span></td>
                <td className="px-3 py-2"><div className="flex gap-2">
                  {t.status === 'DRAFT' && <><button onClick={() => act(t.id, 'ship')} className="text-blue-600 text-xs hover:underline">ship</button><button onClick={() => act(t.id, 'cancel')} className="text-red-500 text-xs hover:underline">cancel</button></>}
                  {t.status === 'SHIPPED' && <button onClick={() => act(t.id, 'receive')} className="text-green-600 text-xs hover:underline">receive</button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TABS = ['Organizations', 'Item Assignments', 'Inter-Org Transfers'];

export default function MultiOrgPage() {
  const [tab, setTab] = useState('Organizations');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Multi-Org Inventory</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Inventory multi-organization parity — inventory orgs (distinct from warehouses) with
          hierarchy and cost method, item-org assignments, and inter-org transfers with pricing.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Organizations' && <OrgsTab />}
      {tab === 'Item Assignments' && <AssignmentsTab />}
      {tab === 'Inter-Org Transfers' && <TransfersTab />}
    </div>
  );
}
