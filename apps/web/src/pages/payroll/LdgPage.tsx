import { useState, useEffect } from 'react';
import { ldgApi } from '../../api/ldg';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

export default function LdgPage() {
  const [ldgs, setLdgs] = useState<any[]>([]);
  const [form, setForm] = useState({ code: '', name: '', countryCode: '', currency: 'USD', roundingRule: 'NEAREST', roundingPrecision: 2 });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => { load(); }, []);
  async function load() { setLdgs(unwrap(await ldgApi.list())); }
  async function seed() { await ldgApi.seedDefaults(); load(); }
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await ldgApi.create(form); setShowForm(false); setForm({ code: '', name: '', countryCode: '', currency: 'USD', roundingRule: 'NEAREST', roundingPrecision: 2 }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">Legislative Data Groups</h1>
          <p className="text-gray-500 text-sm mt-1">
            Oracle Global Payroll parity — per-country payroll frameworks (currency, rounding rules,
            social-insurance rates, tax-regime flags) that drive localized gross-to-net calculations.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={seed} className="bg-gray-200 px-3 py-1.5 rounded text-sm hover:bg-gray-300">Seed IN/UK/US</button>
          <button onClick={() => setShowForm(!showForm)} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700">+ LDG</button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={create} className="border rounded-lg p-4 bg-gray-50 grid grid-cols-6 gap-3 items-end">
          <div><label className="text-xs text-gray-500">Code</label><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Country (ISO-2)</label><input required value={form.countryCode} onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })} maxLength={2} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Currency</label><input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Rounding</label><select value={form.roundingRule} onChange={(e) => setForm({ ...form, roundingRule: e.target.value })} className="w-full border rounded px-2 py-1 text-sm"><option>NEAREST</option><option>UP</option><option>DOWN</option></select></div>
          <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Create</button>
        </form>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Country</th><th className="px-3 py-2 text-left">Currency</th><th className="px-3 py-2 text-left">Rounding</th><th className="px-3 py-2 text-left">Config keys</th></tr></thead>
          <tbody className="divide-y">
            {ldgs.length === 0 ? <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No LDGs. Click "Seed IN/UK/US" for reference legislations.</td></tr> : ldgs.map((l) => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{l.code}</td>
                <td className="px-3 py-2 font-medium">{l.name}</td>
                <td className="px-3 py-2">{l.countryCode}</td>
                <td className="px-3 py-2">{l.currency}</td>
                <td className="px-3 py-2 text-xs">{l.roundingRule} ({l.roundingPrecision}dp)</td>
                <td className="px-3 py-2 text-xs text-gray-400" title={JSON.stringify(l.config)}>{Object.keys(l.config ?? {}).slice(0, 4).join(', ')}{Object.keys(l.config ?? {}).length > 4 ? '…' : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
