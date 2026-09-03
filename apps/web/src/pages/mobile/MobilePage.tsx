import { useState } from 'react';
import { mobileApi } from '../../api/mobile';

const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ReceiptTab() {
  const [text, setText] = useState('Cafe Coffee Day\n2026-06-15\nLatte 250.00\nTax 45.00\nTotal ₹ 295.00');
  const [result, setResult] = useState<any>(null);
  async function parse() {
    try { const r = await mobileApi.parseReceipt(text); setResult(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="space-y-2">
        <label className="text-xs text-gray-500">Receipt OCR text (simulated camera capture)</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} className="w-full border rounded px-2 py-1 text-sm font-mono" rows={7} />
        <button onClick={parse} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Parse to Expense</button>
      </div>
      {result && (
        <div className="border rounded-lg p-4 space-y-2">
          <p className="text-sm"><span className="text-gray-500">Merchant:</span> <strong>{result.merchant ?? '—'}</strong></p>
          <p className="text-sm"><span className="text-gray-500">Amount:</span> <strong>{result.amount != null ? `${result.currency} ${money(result.amount)}` : '—'}</strong></p>
          <p className="text-sm"><span className="text-gray-500">Date:</span> <strong>{result.date ?? '—'}</strong></p>
          <p className="text-xs text-gray-400">Confidence {Math.round(result.confidence * 100)}%</p>
        </div>
      )}
    </div>
  );
}

function TimesheetTab() {
  const [employeeId, setEmployeeId] = useState('emp-1');
  const [checkins, setCheckins] = useState<any[]>([]);
  const [sheet, setSheet] = useState<any>(null);
  const [form, setForm] = useState({ date: '2026-06-15', projectId: '', at: '2026-06-15T09:00:00Z' });
  async function load() {
    const c = await mobileApi.checkins(employeeId); setCheckins(c.data?.data ?? c.data ?? []);
    const t = await mobileApi.timesheet(employeeId, '2026-06-15', '2026-06-21'); setSheet(t.data?.data ?? t.data);
  }
  async function checkin() {
    try { await mobileApi.checkIn({ employeeId, ...form, gpsLat: 12.97, gpsLng: 77.59 }); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function checkout(id: string) {
    try { await mobileApi.checkOut(id, '2026-06-15T17:30:00Z'); load(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2">
        <div><label className="text-xs text-gray-500">Employee</label><input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-40 border rounded px-2 py-1 text-sm font-mono" /></div>
        <button onClick={load} className="bg-gray-700 text-white px-3 py-1.5 rounded text-sm">Load</button>
        <input placeholder="Project ID" value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })} className="border rounded px-2 py-1 text-sm" />
        <button onClick={checkin} className="bg-green-600 text-white px-3 py-1.5 rounded text-sm">Check In (GPS)</button>
      </div>
      {sheet && <p className="text-sm">Week total: <strong>{sheet.totalHours}h</strong></p>}
      <table className="w-full text-sm border rounded-lg overflow-hidden">
        <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">GPS</th><th className="px-3 py-2 text-right">Hours</th><th className="px-3 py-2" /></tr></thead>
        <tbody className="divide-y">
          {checkins.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No check-ins.</td></tr> : checkins.map((c) => (
            <tr key={c.id}><td className="px-3 py-2">{c.date}</td><td className="px-3 py-2 text-xs">{c.gpsLat}, {c.gpsLng}</td><td className="px-3 py-2 text-right">{c.hours}</td><td className="px-3 py-2 text-right">{!c.checkOutAt && <button onClick={() => checkout(c.id)} className="text-indigo-600 text-xs hover:underline">check out</button>}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScanTab() {
  const [expected, setExpected] = useState({ bin: 'A1', item: 'SKU9', qty: 5 });
  const [scanned, setScanned] = useState({ bin: 'A1', item: 'SKU9', qty: 5 });
  const [result, setResult] = useState<any>(null);
  async function confirm() {
    try { const r = await mobileApi.confirmScan(expected, scanned); setResult(r.data?.data ?? r.data); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  const field = (obj: any, set: any, k: string, label: string) => (
    <label className="text-xs text-gray-500">{label}<input value={obj[k]} onChange={(e) => set({ ...obj, [k]: k === 'qty' ? Number(e.target.value) : e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></label>
  );
  return (
    <div className="grid grid-cols-2 gap-6 max-w-4xl">
      <div className="border rounded-lg p-3 space-y-2"><p className="text-sm font-semibold">Expected (pick line)</p>{field(expected, setExpected, 'bin', 'Bin')}{field(expected, setExpected, 'item', 'Item')}{field(expected, setExpected, 'qty', 'Qty')}</div>
      <div className="border rounded-lg p-3 space-y-2"><p className="text-sm font-semibold">Scanned</p>{field(scanned, setScanned, 'bin', 'Bin')}{field(scanned, setScanned, 'item', 'Item')}{field(scanned, setScanned, 'qty', 'Qty')}</div>
      <div className="col-span-2"><button onClick={confirm} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Confirm Scan</button></div>
      {result && (
        <div className={`col-span-2 border rounded-lg p-3 ${result.confirmed ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
          <p className="font-semibold">{result.confirmed ? '✓ Confirmed' : `✗ Mismatch: ${result.mismatches.join(', ')}`}</p>
          {!result.qtyMatch && <p className="text-xs">Short qty: {result.shortQty}</p>}
        </div>
      )}
    </div>
  );
}

const TABS = ['Receipt Capture', 'Timesheet (GPS)', 'Warehouse Scan'];

export default function MobilePage() {
  const [tab, setTab] = useState('Receipt Capture');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Mobile</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle mobile parity — the app ships as an installable PWA (offline shell + service worker); here:
          photo-to-expense receipt parsing, GPS timesheet check-in/out, and RF warehouse scan confirmation.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Receipt Capture' && <ReceiptTab />}
      {tab === 'Timesheet (GPS)' && <TimesheetTab />}
      {tab === 'Warehouse Scan' && <ScanTab />}
    </div>
  );
}
