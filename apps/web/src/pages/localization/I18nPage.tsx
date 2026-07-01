import { useState, useEffect } from 'react';
import { i18nApi } from '../../api/i18n';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

function LocalesTab() {
  const [locales, setLocales] = useState<any[]>([]);
  const [tform, setTform] = useState({ locale: 'hi', namespace: 'invoice', key: 'greeting', value: 'नमस्ते {{name}}' });
  useEffect(() => { load(); }, []);
  async function load() { setLocales(unwrap(await i18nApi.listLocales())); }
  async function seed() { try { await i18nApi.seed(); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function upsert(e: React.FormEvent) { e.preventDefault(); try { await i18nApi.upsert(tform); alert('Translation saved'); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  return (
    <div className="space-y-3">
      {locales.length === 0 && <button onClick={seed} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Seed Default Locales</button>}
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Direction</th><th className="px-3 py-2 text-left">Currency</th></tr></thead>
        <tbody className="divide-y">
          {locales.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No locales.</td></tr> : locales.map((l) => (
            <tr key={l.id}><td className="px-3 py-2 font-mono text-xs">{l.code}</td><td className="px-3 py-2" dir={l.rtl ? 'rtl' : 'ltr'}>{l.name}</td><td className="px-3 py-2">{l.rtl ? <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">RTL</span> : 'LTR'}</td><td className="px-3 py-2">{l.currency}</td></tr>
          ))}
        </tbody>
      </table>
      <form onSubmit={upsert} className="grid grid-cols-4 gap-2 bg-gray-50 p-3 rounded-lg items-end">
        <input placeholder="Locale" value={tform.locale} onChange={(e) => setTform({ ...tform, locale: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Namespace" value={tform.namespace} onChange={(e) => setTform({ ...tform, namespace: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Key" value={tform.key} onChange={(e) => setTform({ ...tform, key: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <div className="flex gap-2"><input placeholder="Value" value={tform.value} onChange={(e) => setTform({ ...tform, value: e.target.value })} className="flex-1 border rounded px-2 py-1 text-sm" /><button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">Save</button></div>
      </form>
    </div>
  );
}

function TranslateTab() {
  const [form, setForm] = useState({ locale: 'hi', namespace: 'invoice', key: 'greeting', vars: '{"name":"Asha"}' });
  const [result, setResult] = useState<any>(null);
  async function run() {
    let vars = {};
    try { vars = JSON.parse(form.vars || '{}'); } catch { alert('Invalid JSON vars'); return; }
    try { const r = await i18nApi.translate({ ...form, vars }); setResult(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3 max-w-2xl">
      <div className="grid grid-cols-3 gap-2">
        <input placeholder="Locale" value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Namespace" value={form.namespace} onChange={(e) => setForm({ ...form, namespace: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <input placeholder="Key" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} className="border rounded px-2 py-1 text-sm" />
      </div>
      <input placeholder="Vars (JSON)" value={form.vars} onChange={(e) => setForm({ ...form, vars: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" />
      <button onClick={run} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Translate</button>
      {result && (
        <div className="border rounded-lg p-3">
          <p className="text-lg">{result.text}</p>
          <p className="text-xs text-gray-400 mt-1">rendered in {result.locale}{result.fallback ? ' (fell back to English)' : ''}</p>
        </div>
      )}
    </div>
  );
}

function FormatTab() {
  const [form, setForm] = useState({ locale: 'en-IN', kind: 'currency', value: '1234567.89', currency: 'INR' });
  const [result, setResult] = useState<any>(null);
  async function run() {
    try { const r = await i18nApi.format(form); setResult(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3 max-w-2xl">
      <div className="grid grid-cols-4 gap-2 items-end">
        <div><label className="text-xs text-gray-500">Locale</label><input value={form.locale} onChange={(e) => setForm({ ...form, locale: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Kind</label><select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">{['number', 'currency', 'date'].map((k) => <option key={k}>{k}</option>)}</select></div>
        <div><label className="text-xs text-gray-500">Value</label><input value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
        <div><label className="text-xs text-gray-500">Currency</label><input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
      </div>
      <button onClick={run} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Format</button>
      {result && <p className="text-2xl font-bold">{result.formatted}</p>}
    </div>
  );
}

const TABS = ['Locales & Translations', 'Translate', 'Formatting'];

export default function I18nPage() {
  const [tab, setTab] = useState('Locales & Translations');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Multi-Language & Localization</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Fusion Localization parity — an i18n translation store with document/UI namespaces and
          {'{{'}var{'}}'} interpolation, English fallback, RTL locales (Arabic/Hebrew), and locale-aware number/currency/date formatting.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Locales & Translations' && <LocalesTab />}
      {tab === 'Translate' && <TranslateTab />}
      {tab === 'Formatting' && <FormatTab />}
    </div>
  );
}
