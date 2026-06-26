import { useState, useEffect } from 'react';
import { financeApi } from '../../api/finance';

const CERT_TYPES = ['FORM_16A', 'FORM_1099', 'GENERIC'];

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

function CodesTab() {
  const [codes, setCodes] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', section: '', rate: 10, thresholdAmount: 0, certificateType: 'FORM_16A' });
  const [test, setTest] = useState({ whtCodeId: '', grossAmount: 100000 });
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => { load(); }, []);
  async function load() { setCodes(unwrap(await financeApi.listWhtCodes())); }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await financeApi.createWhtCode(form);
    setShowForm(false);
    setForm({ code: '', name: '', section: '', rate: 10, thresholdAmount: 0, certificateType: 'FORM_16A' });
    load();
  }

  async function handleTest() {
    if (!test.whtCodeId) return;
    setTestResult(unwrap(await financeApi.computeWht(test)));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">WHT / TDS Codes</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700">+ Code</button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="border rounded-lg p-4 bg-gray-50 grid grid-cols-3 gap-3">
          <div><label className="text-xs text-gray-500">Code</label><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="194J" className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Professional fees" className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Section</label><input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} placeholder="194J" className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Rate %</label><input type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Threshold</label><input type="number" value={form.thresholdAmount} onChange={(e) => setForm({ ...form, thresholdAmount: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <div><label className="text-xs text-gray-500">Cert Type</label><select value={form.certificateType} onChange={(e) => setForm({ ...form, certificateType: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">{CERT_TYPES.map((c) => <option key={c}>{c}</option>)}</select></div>
          <div className="col-span-3 flex justify-end gap-2"><button type="button" onClick={() => setShowForm(false)} className="border rounded px-3 py-1 text-sm">Cancel</button><button type="submit" className="bg-indigo-600 text-white px-3 py-1 rounded text-sm">Create</button></div>
        </form>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Section</th><th className="px-3 py-2 text-right">Rate %</th><th className="px-3 py-2 text-right">Threshold</th><th className="px-3 py-2 text-left">Cert</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">
            {codes.length === 0 ? <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">No WHT codes.</td></tr> : codes.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono">{c.code}</td>
                <td className="px-3 py-2">{c.name}</td>
                <td className="px-3 py-2">{c.section ?? '—'}</td>
                <td className="px-3 py-2 text-right">{Number(c.rate)}</td>
                <td className="px-3 py-2 text-right">{Number(c.thresholdAmount).toLocaleString()}</td>
                <td className="px-3 py-2 text-xs">{c.certificateType}</td>
                <td className="px-3 py-2"><button onClick={async () => { if (confirm('Delete?')) { await financeApi.deleteWhtCode(c.id); load(); } }} className="text-red-500 text-xs hover:underline">Del</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t pt-3">
        <p className="text-xs font-medium text-gray-600 mb-2">WHT calculator</p>
        <div className="flex gap-2 items-center">
          <select value={test.whtCodeId} onChange={(e) => setTest({ ...test, whtCodeId: e.target.value })} className="border rounded px-2 py-1 text-sm">
            <option value="">Select code…</option>
            {codes.map((c) => <option key={c.id} value={c.id}>{c.code} ({c.rate}%)</option>)}
          </select>
          <input type="number" value={test.grossAmount} onChange={(e) => setTest({ ...test, grossAmount: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm w-32" />
          <button onClick={handleTest} className="bg-gray-200 px-3 py-1 rounded text-sm">Compute</button>
        </div>
        {testResult && (
          <div className="mt-2 text-sm">
            {testResult.applicable
              ? <span className="text-green-600">WHT = {Number(testResult.whtAmount).toLocaleString()} ({testResult.rate}%)</span>
              : <span className="text-gray-500">Not applicable — {testResult.reason}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

function CertificatesTab() {
  const [certs, setCerts] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [form, setForm] = useState({ vendorId: '', fiscalYear: '2026-27', periodFrom: '2026-04-01', periodTo: '2027-03-31' });
  const [error, setError] = useState('');

  useEffect(() => { load(); loadVendors(); }, []);
  async function load() { setCerts(unwrap(await financeApi.listWhtCertificates())); }
  async function loadVendors() {
    try { const res = await financeApi.getVendors(); setVendors(res.data?.data?.items ?? res.data?.data ?? res.data ?? []); } catch {}
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await financeApi.generateWhtCertificate(form);
      load();
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to generate');
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleGenerate} className="border rounded-lg p-4 bg-gray-50 grid grid-cols-4 gap-3 items-end">
        <div><label className="text-xs text-gray-500">Vendor</label><select required value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm"><option value="">Select…</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
        <div><label className="text-xs text-gray-500">Fiscal Year</label><input value={form.fiscalYear} onChange={(e) => setForm({ ...form, fiscalYear: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">From</label><input type="date" value={form.periodFrom} onChange={(e) => setForm({ ...form, periodFrom: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div className="flex gap-2"><div className="flex-1"><label className="text-xs text-gray-500">To</label><input type="date" value={form.periodTo} onChange={(e) => setForm({ ...form, periodTo: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div><button type="submit" className="bg-indigo-600 text-white px-3 py-1 rounded text-sm h-8">Generate</button></div>
      </form>
      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Cert #</th><th className="px-3 py-2 text-left">Vendor</th><th className="px-3 py-2 text-left">Section</th><th className="px-3 py-2 text-left">FY</th><th className="px-3 py-2 text-left">Period</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2 text-right">WHT</th><th className="px-3 py-2 text-right">Bills</th></tr></thead>
          <tbody className="divide-y">
            {certs.length === 0 ? <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No certificates generated.</td></tr> : certs.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{c.certificateNumber}</td>
                <td className="px-3 py-2">{c.vendorName}</td>
                <td className="px-3 py-2">{c.section ?? '—'}</td>
                <td className="px-3 py-2">{c.fiscalYear}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{c.periodFrom} → {c.periodTo}</td>
                <td className="px-3 py-2 text-right">{Number(c.grossAmount).toLocaleString()}</td>
                <td className="px-3 py-2 text-right font-medium">{Number(c.whtAmount).toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{c.billCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const TABS = ['Codes', 'Certificates'];

export default function WithholdingTaxPage() {
  const [tab, setTab] = useState('Codes');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Withholding Tax (TDS)</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Payables WHT parity — configure TDS codes with rate/threshold/section, auto-deduct at
          bill posting (vendor credited net, WHT liability booked), and generate Form 16A certificates.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Codes' && <CodesTab />}
      {tab === 'Certificates' && <CertificatesTab />}
    </div>
  );
}
