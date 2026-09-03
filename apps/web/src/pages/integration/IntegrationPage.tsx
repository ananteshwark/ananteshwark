import { useState, useEffect } from 'react';
import { integrationApi } from '../../api/integration';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const ESTATUS: Record<string, string> = { PENDING: 'bg-amber-100 text-amber-700', DELIVERED: 'bg-green-100 text-green-700', FAILED: 'bg-orange-100 text-orange-700', DEAD_LETTER: 'bg-red-100 text-red-700' };
const now = () => new Date().toISOString();

function AdaptersTab() {
  const [adapters, setAdapters] = useState<any[]>([]);
  const [connectors, setConnectors] = useState<any[]>([]);
  const [pick, setPick] = useState({ connectorKey: 'STRIPE', code: '' });
  const [events, setEvents] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => { load(); }, []);
  async function load() {
    setAdapters(unwrap(await integrationApi.listAdapters()));
    setConnectors(unwrap(await integrationApi.connectors()));
    setEvents(unwrap(await integrationApi.listEvents()));
  }
  async function create() {
    if (!pick.code) return;
    try { await integrationApi.fromConnector(pick.connectorKey, pick.code); setPick({ connectorKey: 'STRIPE', code: '' }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function publish() {
    if (!selected) { alert('Select an adapter'); return; }
    try { await integrationApi.publish(selected, 'demo.event', { hello: 'world' }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function act(fn: () => Promise<any>) { try { await fn(); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2 bg-gray-50 p-3 rounded-lg">
        <select value={pick.connectorKey} onChange={(e) => setPick({ ...pick, connectorKey: e.target.value })} className="border rounded px-2 py-1 text-sm">{connectors.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>
        <input placeholder="Adapter code" value={pick.code} onChange={(e) => setPick({ ...pick, code: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <button onClick={create} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ From Connector</button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold mb-1">Adapters</h3>
          <ul className="border rounded-lg divide-y text-sm">
            {adapters.length === 0 ? <li className="px-3 py-4 text-center text-gray-400">No adapters.</li> : adapters.map((a) => (
              <li key={a.id} className={`px-3 py-2 cursor-pointer flex justify-between ${selected === a.id ? 'bg-indigo-50' : ''}`} onClick={() => setSelected(a.id)}>
                <span><span className="font-mono text-xs">{a.code}</span> · {a.connector}</span>
                <span className="text-xs text-gray-400">{a.authType}</span>
              </li>
            ))}
          </ul>
          <button onClick={publish} className="mt-2 bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Publish Event to Selected</button>
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-1">Events</h3>
          <table className="w-full text-sm border rounded-lg overflow-hidden">
            <thead className="bg-gray-50"><tr><th className="px-2 py-2 text-left">Type</th><th className="px-2 py-2 text-left">Status</th><th className="px-2 py-2 text-right">Attempts</th><th className="px-2 py-2" /></tr></thead>
            <tbody className="divide-y">
              {events.length === 0 ? <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No events.</td></tr> : events.map((e) => (
                <tr key={e.id}>
                  <td className="px-2 py-2 font-mono text-xs">{e.eventType}</td>
                  <td className="px-2 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${ESTATUS[e.status]}`}>{e.status}</span></td>
                  <td className="px-2 py-2 text-right">{e.attempts}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {(e.status === 'PENDING' || e.status === 'FAILED') && <><button onClick={() => act(() => integrationApi.deliver(e.id, true, now()))} className="text-green-600 text-xs hover:underline mr-1">deliver</button><button onClick={() => act(() => integrationApi.deliver(e.id, false, now(), 'sim fail'))} className="text-red-500 text-xs hover:underline">fail</button></>}
                    {e.status === 'DEAD_LETTER' && <button onClick={() => act(() => integrationApi.replay(e.id))} className="text-indigo-600 text-xs hover:underline">replay</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MonitoringTab() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { load(); }, []);
  async function load() { const r = await integrationApi.monitoring(); setData(r.data?.data ?? r.data); }
  return (
    <div className="space-y-3">
      {data && <p className="text-sm">Dead-letter queue: <strong className="text-red-600">{data.deadLetterCount}</strong></p>}
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Adapter</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Delivered</th><th className="px-3 py-2 text-right">Failed</th><th className="px-3 py-2 text-right">Dead</th><th className="px-3 py-2 text-right">Success%</th></tr></thead>
        <tbody className="divide-y">
          {(data?.adapters ?? []).length === 0 ? <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">No adapters.</td></tr> : data.adapters.map((a: any) => (
            <tr key={a.adapterId}><td className="px-3 py-2 font-mono text-xs">{a.code}</td><td className="px-3 py-2 text-right">{a.total}</td><td className="px-3 py-2 text-right text-green-600">{a.delivered}</td><td className="px-3 py-2 text-right text-orange-600">{a.failed}</td><td className="px-3 py-2 text-right text-red-600">{a.deadLetter}</td><td className="px-3 py-2 text-right font-bold">{a.successRate == null ? '—' : `${a.successRate}%`}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TABS = ['Adapters & Events', 'Monitoring'];

export default function IntegrationPage() {
  const [tab, setTab] = useState('Adapters & Events');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Integration Framework</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Integration Cloud parity — a generic adapter model with pre-built connectors (Salesforce,
          Stripe, Shopify, QuickBooks, JIRA), event streaming with retry and a dead-letter queue, and monitoring.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Adapters & Events' && <AdaptersTab />}
      {tab === 'Monitoring' && <MonitoringTab />}
    </div>
  );
}
