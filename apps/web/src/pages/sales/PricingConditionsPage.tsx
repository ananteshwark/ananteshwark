import { useState, useEffect } from 'react';
import { Plus, X, Trash2, Calculator } from 'lucide-react';
import { pricingApi } from '../../api/pricing';

const unwrap = (res: any) => res.data?.data ?? res.data;

const CONDITION_TYPES = [
  'BASE_PRICE', 'DISCOUNT_PERCENT', 'DISCOUNT_AMOUNT', 'SURCHARGE_PERCENT', 'SURCHARGE_AMOUNT',
];
const KEY_TYPES = ['ITEM', 'CUSTOMER', 'CUSTOMER_ITEM', 'ALL'];

const TYPE_COLORS: Record<string, string> = {
  BASE_PRICE: 'bg-blue-100 text-blue-700',
  DISCOUNT_PERCENT: 'bg-green-100 text-green-700',
  DISCOUNT_AMOUNT: 'bg-green-100 text-green-700',
  SURCHARGE_PERCENT: 'bg-orange-100 text-orange-700',
  SURCHARGE_AMOUNT: 'bg-orange-100 text-orange-700',
};

function CreateConditionModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    conditionType: 'BASE_PRICE', keyType: 'ALL',
    customerId: '', itemId: '', rate: '0', currency: 'USD',
    minQty: '', maxQty: '', validFrom: '', validTo: '', priority: '10', description: '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await pricingApi.create({
        conditionType: form.conditionType,
        keyType: form.keyType,
        customerId: form.customerId || null,
        itemId: form.itemId || null,
        rate: parseFloat(form.rate) || 0,
        currency: form.currency || 'USD',
        minQty: form.minQty ? parseFloat(form.minQty) : null,
        maxQty: form.maxQty ? parseFloat(form.maxQty) : null,
        validFrom: form.validFrom || null,
        validTo: form.validTo || null,
        priority: parseInt(form.priority, 10) || 10,
        description: form.description || null,
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">New Pricing Condition</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Condition Type</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.conditionType}
              onChange={e => set('conditionType', e.target.value)}>
              {CONDITION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Key Type</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.keyType}
              onChange={e => set('keyType', e.target.value)}>
              {KEY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Customer ID</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.customerId}
              onChange={e => set('customerId', e.target.value)} placeholder="optional UUID" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Item ID</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.itemId}
              onChange={e => set('itemId', e.target.value)} placeholder="optional UUID" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Rate</label>
            <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.rate}
              onChange={e => set('rate', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Currency</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.currency}
              onChange={e => set('currency', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Min Qty</label>
            <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.minQty}
              onChange={e => set('minQty', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Max Qty</label>
            <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.maxQty}
              onChange={e => set('maxQty', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Valid From</label>
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.validFrom}
              onChange={e => set('validFrom', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Valid To</label>
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.validTo}
              onChange={e => set('validTo', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Priority</label>
            <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.priority}
              onChange={e => set('priority', e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Description</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.description}
              onChange={e => set('description', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Saving...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PricePreview() {
  const [form, setForm] = useState({ itemId: '', customerId: '', quantity: '1', date: new Date().toISOString().slice(0, 10) });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      const res = await pricingApi.preview({
        itemId: form.itemId || null,
        customerId: form.customerId || null,
        quantity: parseFloat(form.quantity) || 1,
        date: form.date || undefined,
      });
      setResult(unwrap(res));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Calculator className="h-4 w-4" /> Price Preview</h3>
      <div className="grid grid-cols-4 gap-3 mb-3">
        <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Item ID" value={form.itemId}
          onChange={e => setForm(p => ({ ...p, itemId: e.target.value }))} />
        <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Customer ID" value={form.customerId}
          onChange={e => setForm(p => ({ ...p, customerId: e.target.value }))} />
        <input type="number" className="border rounded-lg px-3 py-2 text-sm" placeholder="Qty" value={form.quantity}
          onChange={e => setForm(p => ({ ...p, quantity: e.target.value }))} />
        <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={form.date}
          onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
      </div>
      <button onClick={run} disabled={loading} className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg disabled:opacity-50">
        {loading ? 'Calculating...' : 'Calculate'}
      </button>

      {result && (
        <div className="mt-4 grid grid-cols-4 gap-3 text-sm">
          <div className="bg-gray-50 rounded-lg p-3"><div className="text-xs text-gray-500">Base</div><div className="font-semibold">{(result.basePrice ?? 0).toFixed(2)}</div></div>
          <div className="bg-green-50 rounded-lg p-3"><div className="text-xs text-gray-500">Discount</div><div className="font-semibold text-green-700">-{(result.discountAmount ?? 0).toFixed(2)}</div></div>
          <div className="bg-orange-50 rounded-lg p-3"><div className="text-xs text-gray-500">Surcharge</div><div className="font-semibold text-orange-700">+{(result.surchargeAmount ?? 0).toFixed(2)}</div></div>
          <div className="bg-blue-50 rounded-lg p-3"><div className="text-xs text-gray-500">Net</div><div className="font-semibold text-blue-700">{(result.netPrice ?? 0).toFixed(2)}</div></div>
          {result.conditions?.length > 0 && (
            <div className="col-span-4 mt-2">
              <div className="text-xs text-gray-500 mb-1">Applied Conditions</div>
              <ul className="text-xs space-y-1">
                {result.conditions.map((c: any, i: number) => (
                  <li key={i} className="flex justify-between border-b py-1">
                    <span>{c.type} {c.description ? `— ${c.description}` : ''}</span>
                    <span className="font-mono">rate {c.rate} → {(c.amount ?? 0).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PricingConditionsPage() {
  const [conditions, setConditions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    setLoading(true);
    pricingApi.list().then(r => setConditions(unwrap(r) || [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const del = async (id: string) => {
    await pricingApi.remove(id);
    load();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pricing Conditions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Condition-based pricing engine for sales</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus className="h-4 w-4" /> New Condition
        </button>
      </div>

      <PricePreview />

      <div className="bg-white rounded-xl border">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : conditions.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No pricing conditions defined.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Type', 'Key', 'Customer', 'Item', 'Rate', 'Qty Range', 'Validity', 'Priority', 'Active', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {conditions.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_COLORS[c.conditionType] || 'bg-gray-100 text-gray-600'}`}>{c.conditionType}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">{c.keyType}</td>
                  <td className="px-4 py-2 font-mono text-xs">{c.customerId ? c.customerId.slice(0, 8) : '—'}</td>
                  <td className="px-4 py-2 font-mono text-xs">{c.itemId ? c.itemId.slice(0, 8) : '—'}</td>
                  <td className="px-4 py-2 text-right">{c.rate} {c.currency}</td>
                  <td className="px-4 py-2 text-gray-500">{c.minQty ?? '0'}–{c.maxQty ?? '∞'}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{c.validFrom || '—'} / {c.validTo || '—'}</td>
                  <td className="px-4 py-2 text-center">{c.priority}</td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-xs ${c.isActive ? 'text-green-600' : 'text-gray-400'}`}>{c.isActive ? 'Yes' : 'No'}</span>
                  </td>
                  <td className="px-4 py-2">
                    {c.isActive && (
                      <button onClick={() => del(c.id)} className="text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateConditionModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}
