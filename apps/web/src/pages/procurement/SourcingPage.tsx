import { useState, useEffect } from 'react';
import { sourcingApi } from '../../api/sourcing';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}
const money = (n: any) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600', PUBLISHED: 'bg-blue-100 text-blue-700', BIDDING: 'bg-amber-100 text-amber-700',
  SCORING: 'bg-purple-100 text-purple-700', AWARDED: 'bg-green-100 text-green-700', CANCELLED: 'bg-red-100 text-red-700',
};

export default function SourcingPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [bids, setBids] = useState<any[]>([]);
  const [scores, setScores] = useState<Record<string, any>>({});
  const [eventForm, setEventForm] = useState({ eventType: 'RFQ', title: '', visibility: 'SEALED' });
  const [lineForm, setLineForm] = useState({ description: '', quantity: 1, targetPrice: 0 });
  const [bidForm, setBidForm] = useState({ lineId: '', supplierId: '', unitPrice: 0, leadTimeDays: 0, qualityScore: 0 });

  useEffect(() => { loadEvents(); }, []);
  async function loadEvents() { setEvents(unwrap(await sourcingApi.listEvents())); }
  async function selectEvent(e: any) {
    setSelected(e); setScores({});
    setLines(unwrap(await sourcingApi.listLines(e.id)));
    setBids(unwrap(await sourcingApi.listBids(e.id)));
  }
  async function refresh() { if (selected) { const e = events.find((x) => x.id === selected.id); await selectEvent(e ?? selected); await loadEvents(); } }

  async function createEvent(ev: React.FormEvent) {
    ev.preventDefault();
    try { await sourcingApi.createEvent(eventForm); setEventForm({ eventType: 'RFQ', title: '', visibility: 'SEALED' }); loadEvents(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function addLine(ev: React.FormEvent) {
    ev.preventDefault();
    try { await sourcingApi.addLine(selected.id, lineForm); setLineForm({ description: '', quantity: 1, targetPrice: 0 }); refresh(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function act(fn: () => Promise<any>) { try { await fn(); refresh(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); } }
  async function submitBid(ev: React.FormEvent) {
    ev.preventDefault();
    try { await sourcingApi.submitBid(selected.id, bidForm); setBidForm({ lineId: '', supplierId: '', unitPrice: 0, leadTimeDays: 0, qualityScore: 0 }); refresh(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function score(lineId: string) {
    try { const r = await sourcingApi.scoreLine(selected.id, lineId); setScores({ ...scores, [lineId]: r.data?.data ?? r.data }); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }
  async function awardRec(lineId: string) {
    const rec = scores[lineId]?.recommendation;
    if (!rec) { alert('Score the line first'); return; }
    if (!confirm(`Award 100% to ${rec.supplierId} at ${rec.unitPrice}?`)) return;
    await act(() => sourcingApi.awardLine(selected.id, lineId, [{ supplierId: rec.supplierId, unitPrice: rec.unitPrice, splitPct: 100 }]));
  }
  async function toPo() {
    try { const r = await sourcingApi.awardToPo(selected.id); const data = r.data?.data ?? r.data; alert(`Generated ${data.proposals.length} PO proposal(s): ${data.proposals.map((p: any) => p.poRef).join(', ')}`); refresh(); } catch (err: any) { alert(err.response?.data?.message ?? 'Failed'); }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Strategic Sourcing</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle Sourcing parity — RFI / RFQ / reverse-auction events, multi-round sealed bidding with history,
          weighted price/quality/delivery scoring, split-award, and one-click award-to-PO.
        </p>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="space-y-3">
          <form onSubmit={createEvent} className="bg-gray-50 p-3 rounded-lg space-y-2">
            <input required placeholder="Event title" value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
            <div className="flex gap-2">
              <select value={eventForm.eventType} onChange={(e) => setEventForm({ ...eventForm, eventType: e.target.value })} className="flex-1 border rounded px-2 py-1 text-sm">{['RFI', 'RFQ', 'AUCTION'].map((t) => <option key={t}>{t}</option>)}</select>
              <select value={eventForm.visibility} onChange={(e) => setEventForm({ ...eventForm, visibility: e.target.value })} className="flex-1 border rounded px-2 py-1 text-sm">{['SEALED', 'OPEN'].map((t) => <option key={t}>{t}</option>)}</select>
            </div>
            <button type="submit" className="w-full bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">+ Event</button>
          </form>
          <ul className="border rounded-lg divide-y text-sm">
            {events.length === 0 ? <li className="px-3 py-4 text-center text-gray-400">No events.</li> : events.map((e) => (
              <li key={e.id} className={`px-3 py-2 cursor-pointer ${selected?.id === e.id ? 'bg-indigo-50' : ''}`} onClick={() => selectEvent(e)}>
                <div className="flex justify-between items-center"><span className="font-medium">{e.title}</span><span className={`text-xs px-1.5 py-0.5 rounded ${STATUS[e.status]}`}>{e.status}</span></div>
                <span className="text-xs text-gray-400 font-mono">{e.eventNumber} · {e.eventType} · R{e.currentRound}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="col-span-2 space-y-3">
          {!selected ? <p className="text-sm text-gray-400">Select an event.</p> : (
            <>
              <div className="flex gap-2 items-center">
                <h3 className="font-semibold">{selected.title}</h3>
                {selected.status === 'DRAFT' && <button onClick={() => act(() => sourcingApi.publish(selected.id))} className="text-blue-600 text-xs hover:underline">publish</button>}
                {['BIDDING', 'SCORING'].includes(selected.status) && <button onClick={() => act(() => sourcingApi.nextRound(selected.id))} className="text-amber-600 text-xs hover:underline">next round</button>}
                {selected.status === 'SCORING' && <button onClick={toPo} className="text-green-600 text-xs hover:underline">award → PO</button>}
              </div>
              {selected.status === 'DRAFT' && (
                <form onSubmit={addLine} className="grid grid-cols-4 gap-2 bg-gray-50 p-2 rounded items-end">
                  <input required placeholder="Description" value={lineForm.description} onChange={(e) => setLineForm({ ...lineForm, description: e.target.value })} className="col-span-2 border rounded px-2 py-1 text-sm" />
                  <input type="number" placeholder="Qty" value={lineForm.quantity} onChange={(e) => setLineForm({ ...lineForm, quantity: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" />
                  <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">+ Line</button>
                </form>
              )}
              <table className="w-full text-sm border rounded-lg overflow-hidden">
                <thead className="bg-gray-50"><tr><th className="px-2 py-2 text-left">#</th><th className="px-2 py-2 text-left">Description</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2" /></tr></thead>
                <tbody className="divide-y">
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-2 py-2">{l.lineNo}</td>
                      <td className="px-2 py-2">{l.description}{scores[l.id]?.recommendation && <span className="block text-xs text-green-600">rec: {scores[l.id].recommendation.supplierId} @ {money(scores[l.id].recommendation.unitPrice)} (score {scores[l.id].recommendation.totalScore})</span>}</td>
                      <td className="px-2 py-2 text-right">{l.quantity}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">
                        <button onClick={() => score(l.id)} className="text-indigo-600 text-xs hover:underline mr-2">score</button>
                        {selected.status !== 'AWARDED' && <button onClick={() => awardRec(l.id)} className="text-green-600 text-xs hover:underline">award</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {selected.status === 'BIDDING' && (
                <form onSubmit={submitBid} className="grid grid-cols-5 gap-2 bg-gray-50 p-2 rounded items-end">
                  <select required value={bidForm.lineId} onChange={(e) => setBidForm({ ...bidForm, lineId: e.target.value })} className="border rounded px-2 py-1 text-sm"><option value="">Line</option>{lines.map((l) => <option key={l.id} value={l.id}>#{l.lineNo}</option>)}</select>
                  <input required placeholder="Supplier" value={bidForm.supplierId} onChange={(e) => setBidForm({ ...bidForm, supplierId: e.target.value })} className="border rounded px-2 py-1 text-sm" />
                  <input type="number" placeholder="Price" value={bidForm.unitPrice} onChange={(e) => setBidForm({ ...bidForm, unitPrice: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" />
                  <input type="number" placeholder="Quality 0-100" value={bidForm.qualityScore} onChange={(e) => setBidForm({ ...bidForm, qualityScore: Number(e.target.value) })} className="border rounded px-2 py-1 text-sm" />
                  <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">Bid</button>
                </form>
              )}
              {bids.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 mb-1">Bid History</h4>
                  <table className="w-full text-xs border rounded-lg overflow-hidden">
                    <thead className="bg-gray-50"><tr><th className="px-2 py-1 text-left">Round</th><th className="px-2 py-1 text-left">Supplier</th><th className="px-2 py-1 text-right">Price</th><th className="px-2 py-1 text-right">Lead</th><th className="px-2 py-1 text-right">Quality</th></tr></thead>
                    <tbody className="divide-y">
                      {bids.map((b) => (
                        <tr key={b.id}><td className="px-2 py-1">R{b.round}</td><td className="px-2 py-1">{b.supplierId}</td><td className="px-2 py-1 text-right">{money(b.unitPrice)}</td><td className="px-2 py-1 text-right">{b.leadTimeDays ?? '—'}</td><td className="px-2 py-1 text-right">{b.qualityScore ?? '—'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
