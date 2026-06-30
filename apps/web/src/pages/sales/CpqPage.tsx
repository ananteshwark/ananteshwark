import { useState, useEffect } from 'react';
import { cpqApi } from '../../api/cpq';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', PRICED: 'bg-blue-100 text-blue-700', APPROVAL_PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700', REJECTED: 'bg-red-100 text-red-700', ORDERED: 'bg-purple-100 text-purple-700',
};

function ConfigureTab() {
  const [models, setModels] = useState<any[]>([]);
  const [modelCode, setModelCode] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [validation, setValidation] = useState<any>(null);
  const [pricing, setPricing] = useState({ quantity: 1, customerName: '', customerDiscountPct: 0, volumeDiscountPct: 0, promoDiscountPct: 0 });

  useEffect(() => { cpqApi.listModels().then((r) => setModels(unwrap(r))); }, []);
  const model = models.find((m) => m.code === modelCode);

  function toggle(code: string) { setSelected(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]); }
  async function validate() {
    if (!modelCode) return;
    try { const r = await cpqApi.validate(modelCode, selected); setValidation(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function createQuote() {
    try { await cpqApi.createQuote({ modelCode, selectedOptions: selected, ...pricing }); alert('Quote created (see Quotes tab)'); setValidation(null); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-3">
        <div><label className="text-xs text-gray-500">Product Model</label>
          <select value={modelCode} onChange={(e) => { setModelCode(e.target.value); setSelected([]); setValidation(null); }} className="w-full border rounded px-2 py-1 text-sm"><option value="">— select —</option>{models.map((m) => <option key={m.code} value={m.code}>{m.name} ({money(m.basePrice)})</option>)}</select>
        </div>
        {model && (model.optionGroups ?? []).map((g: any) => (
          <div key={g.id} className="border rounded-lg p-3">
            <p className="text-sm font-medium">{g.name} {g.required && <span className="text-red-500 text-xs">*</span>} <span className="text-xs text-gray-400">(pick {g.minSelect}–{g.maxSelect})</span></p>
            <div className="mt-1 space-y-1">
              {g.options.map((o: any) => (
                <label key={o.code} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(o.code)} onChange={() => toggle(o.code)} /> {o.name} <span className="text-xs text-gray-400">+{money(o.priceDelta)}</span></label>
              ))}
            </div>
          </div>
        ))}
        {model && <button onClick={validate} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Validate & Price</button>}
      </div>
      <div className="space-y-3">
        {validation && (
          <div className={`border rounded-lg p-3 ${validation.valid ? 'border-green-300' : 'border-red-300'}`}>
            <p className="text-sm font-medium">{validation.valid ? '✓ Valid configuration' : '✗ Invalid configuration'}</p>
            {validation.violations?.length > 0 && <ul className="text-xs text-red-600 list-disc list-inside mt-1">{validation.violations.map((v: string, i: number) => <li key={i}>{v}</li>)}</ul>}
            <p className="text-lg font-bold mt-2">Configured price: {money(validation.configuredPrice)}</p>
          </div>
        )}
        {validation?.valid && (
          <div className="border rounded-lg p-3 space-y-2">
            <h3 className="text-sm font-semibold">Pricing Waterfall</h3>
            <input placeholder="Customer name" value={pricing.customerName} onChange={(e) => setPricing({ ...pricing, customerName: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-gray-500">Qty<input type="number" value={pricing.quantity} onChange={(e) => setPricing({ ...pricing, quantity: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></label>
              <label className="text-xs text-gray-500">Customer disc %<input type="number" value={pricing.customerDiscountPct} onChange={(e) => setPricing({ ...pricing, customerDiscountPct: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></label>
              <label className="text-xs text-gray-500">Volume disc %<input type="number" value={pricing.volumeDiscountPct} onChange={(e) => setPricing({ ...pricing, volumeDiscountPct: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></label>
              <label className="text-xs text-gray-500">Promo disc %<input type="number" value={pricing.promoDiscountPct} onChange={(e) => setPricing({ ...pricing, promoDiscountPct: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></label>
            </div>
            <button onClick={createQuote} className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Create Quote</button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuotesTab() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [doc, setDoc] = useState<any>(null);
  useEffect(() => { load(); }, []);
  async function load() { setQuotes(unwrap(await cpqApi.listQuotes())); }
  async function act(fn: () => Promise<any>) { try { await fn(); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function viewDoc(id: string) { try { const r = await cpqApi.document(id); setDoc(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function convert(id: string) { try { const r = await cpqApi.convert(id); const d = r.data?.data ?? r.data; alert(`Sales order ${d.orderNumber} created`); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2">
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead className="bg-gray-50"><tr><th className="px-2 py-2 text-left">Quote</th><th className="px-2 py-2 text-left">Model</th><th className="px-2 py-2 text-right">Net Total</th><th className="px-2 py-2 text-right">Disc%</th><th className="px-2 py-2 text-left">Status</th><th className="px-2 py-2" /></tr></thead>
          <tbody className="divide-y">
            {quotes.length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No quotes.</td></tr> : quotes.map((q) => (
              <tr key={q.id}>
                <td className="px-2 py-2 font-mono text-xs">{q.quoteNumber}</td>
                <td className="px-2 py-2">{q.modelCode}</td>
                <td className="px-2 py-2 text-right">{money(q.netTotal)}</td>
                <td className="px-2 py-2 text-right">{q.totalDiscountPct}%{q.requiresApproval && <span title="needs approval" className="text-amber-500"> ⚠</span>}</td>
                <td className="px-2 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${STATUS[q.status]}`}>{q.status}</span></td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <button onClick={() => viewDoc(q.id)} className="text-gray-600 text-xs hover:underline mr-2">doc</button>
                  {q.status === 'PRICED' && <button onClick={() => act(() => cpqApi.submit(q.id))} className="text-blue-600 text-xs hover:underline mr-2">submit</button>}
                  {q.status === 'APPROVAL_PENDING' && <><button onClick={() => act(() => cpqApi.decide(q.id, 'APPROVE'))} className="text-green-600 text-xs hover:underline mr-2">approve</button><button onClick={() => act(() => cpqApi.decide(q.id, 'REJECT'))} className="text-red-500 text-xs hover:underline mr-2">reject</button></>}
                  {q.status === 'APPROVED' && <button onClick={() => convert(q.id)} className="text-purple-600 text-xs hover:underline">→ order</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        {doc && (
          <div className="border rounded-lg p-4 text-sm space-y-2">
            <div className="flex justify-between items-center"><h3 className="font-bold">Quote {doc.quoteNumber}</h3><span className={`text-xs px-1.5 py-0.5 rounded ${STATUS[doc.status]}`}>{doc.status}</span></div>
            <p className="text-xs text-gray-500">{doc.customer?.name ?? 'No customer'}</p>
            <p className="font-medium">{doc.model?.name} <span className="text-xs text-gray-400">base {money(doc.model?.basePrice)}</span></p>
            <ul className="text-xs">{(doc.options ?? []).map((o: any, i: number) => <li key={i}>+ {o.option} ({o.group}) {money(o.priceDelta)}</li>)}</ul>
            <div className="border-t pt-2 text-xs space-y-0.5">
              <div className="flex justify-between"><span>List</span><span>{money(doc.pricing.listPrice)}</span></div>
              <div className="flex justify-between"><span>Customer disc</span><span>{doc.pricing.customerDiscountPct}%</span></div>
              <div className="flex justify-between"><span>Volume disc</span><span>{doc.pricing.volumeDiscountPct}%</span></div>
              <div className="flex justify-between"><span>Promo disc</span><span>{doc.pricing.promoDiscountPct}%</span></div>
              <div className="flex justify-between font-bold"><span>Net unit × {doc.pricing.quantity}</span><span>{money(doc.pricing.netTotal)}</span></div>
            </div>
            <ul className="text-[10px] text-gray-400 list-disc list-inside">{doc.termsAndConditions.map((t: string, i: number) => <li key={i}>{t}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}

const TABS = ['Configure & Price', 'Quotes'];

export default function CpqPage() {
  const [tab, setTab] = useState('Configure & Price');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">CPQ — Configure, Price, Quote</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle CPQ parity — product configurator (option groups, min/max, requires/excludes constraints),
          pricing waterfall (list → customer → volume → promo → net) with deal-desk approval, branded quote
          documents, and one-click quote-to-order.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Configure & Price' && <ConfigureTab />}
      {tab === 'Quotes' && <QuotesTab />}
    </div>
  );
}
