import { useState } from 'react';
import { inventoryApi } from '../../api/inventory';

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

function LotTree({ node, childKey }: { node: any; childKey: 'children' | 'parents' }) {
  const kids = node[childKey] ?? [];
  return (
    <div className="ml-3 border-l pl-3 py-0.5">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{node.lotNumber ?? node.lotId?.slice(0, 8)}</span>
        {node.relation && <span className="text-xs text-gray-400">{node.relation}</span>}
        {node.quantityUsed != null && node.quantityUsed > 0 && <span className="text-xs text-gray-400">qty {node.quantityUsed}</span>}
        {node.status && <span className={`text-xs px-1 rounded ${node.status === 'QUARANTINE' ? 'bg-red-100 text-red-600' : 'bg-green-50 text-green-600'}`}>{node.status}</span>}
      </div>
      {kids.map((k: any, i: number) => <LotTree key={k.lotId + i} node={k} childKey={childKey} />)}
    </div>
  );
}

export default function GenealogyPage() {
  const [tab, setTab] = useState<'capture' | 'trace' | 'recall'>('trace');
  const [edgeForm, setEdgeForm] = useState({ parentLotId: '', childLotId: '', quantityUsed: 0, eventDate: new Date().toISOString().slice(0, 10) });
  const [traceLot, setTraceLot] = useState('');
  const [backward, setBackward] = useState<any>(null);
  const [forward, setForward] = useState<any>(null);
  const [recallLot, setRecallLot] = useState('');
  const [recall, setRecall] = useState<any>(null);
  const [msg, setMsg] = useState('');

  async function recordEdge(e: React.FormEvent) {
    e.preventDefault();
    setMsg('');
    try {
      await inventoryApi.recordGenealogyEdge(edgeForm);
      setMsg('Genealogy edge recorded.');
      setEdgeForm({ parentLotId: '', childLotId: '', quantityUsed: 0, eventDate: new Date().toISOString().slice(0, 10) });
    } catch (err: any) { setMsg(err.response?.data?.message ?? 'Failed'); }
  }

  async function runTrace() {
    if (!traceLot) return;
    try {
      const [b, f] = await Promise.all([inventoryApi.backwardTrace(traceLot), inventoryApi.forwardTrace(traceLot)]);
      setBackward(b.data?.data ?? b.data);
      setForward(f.data?.data ?? f.data);
    } catch (err: any) { alert(err.response?.data?.message ?? 'Trace failed'); }
  }

  async function runRecall() {
    if (!recallLot) return;
    try {
      const r = await inventoryApi.recallImpact(recallLot);
      setRecall(r.data?.data ?? r.data);
    } catch (err: any) { alert(err.response?.data?.message ?? 'Recall failed'); }
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Lot Genealogy & Traceability</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle SCM Lot Genealogy parity — capture parent-child lot relationships, forward/backward trace,
          and recall impact analysis for pharma / food / aerospace.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {(['capture', 'trace', 'recall'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px capitalize ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500'}`}>{t === 'recall' ? 'Recall Impact' : t}</button>
        ))}
      </div>

      {tab === 'capture' && (
        <form onSubmit={recordEdge} className="border rounded-lg p-4 bg-gray-50 grid grid-cols-4 gap-3 items-end max-w-3xl">
          <div><label className="text-xs text-gray-500">Parent (FG) Lot ID</label><input required value={edgeForm.parentLotId} onChange={(e) => setEdgeForm({ ...edgeForm, parentLotId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
          <div><label className="text-xs text-gray-500">Child (RM) Lot ID</label><input required value={edgeForm.childLotId} onChange={(e) => setEdgeForm({ ...edgeForm, childLotId: e.target.value })} className="w-full border rounded px-2 py-1 text-sm font-mono" /></div>
          <div><label className="text-xs text-gray-500">Qty Used</label><input type="number" value={edgeForm.quantityUsed} onChange={(e) => setEdgeForm({ ...edgeForm, quantityUsed: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          <button type="submit" className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Record Edge</button>
          {msg && <p className="col-span-4 text-xs text-gray-600">{msg}</p>}
        </form>
      )}

      {tab === 'trace' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-center">
            <input value={traceLot} onChange={(e) => setTraceLot(e.target.value)} placeholder="Lot ID" className="border rounded px-2 py-1 text-sm font-mono w-80" />
            <button onClick={runTrace} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm">Trace</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="border rounded-lg p-3">
              <h3 className="font-medium text-sm mb-2">⬇ Backward (components consumed)</h3>
              {backward ? <LotTree node={backward} childKey="children" /> : <p className="text-gray-400 text-sm">Run a trace.</p>}
            </div>
            <div className="border rounded-lg p-3">
              <h3 className="font-medium text-sm mb-2">⬆ Forward (finished goods produced)</h3>
              {forward ? <LotTree node={forward} childKey="parents" /> : <p className="text-gray-400 text-sm">Run a trace.</p>}
            </div>
          </div>
        </div>
      )}

      {tab === 'recall' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-center">
            <input value={recallLot} onChange={(e) => setRecallLot(e.target.value)} placeholder="Recalled raw-material Lot ID" className="border rounded px-2 py-1 text-sm font-mono w-96" />
            <button onClick={runRecall} className="bg-red-600 text-white px-3 py-1.5 rounded text-sm">Analyze Recall Impact</button>
          </div>
          {recall && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Recalled Lot</p><p className="text-lg font-bold font-mono">{recall.recalledLot?.lotNumber}</p></div>
                <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Affected Lots</p><p className="text-2xl font-bold text-red-600">{recall.affectedLotCount}</p></div>
                <div className="border rounded-lg p-3"><p className="text-xs text-gray-500">Finished-Good Lots</p><p className="text-2xl font-bold text-orange-600">{recall.finishedGoodLots?.length ?? 0}</p></div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 text-sm font-medium">Finished-Good Lots to Recall</div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Lot Number</th><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2 text-left">Expiry</th></tr></thead>
                  <tbody className="divide-y">
                    {(recall.finishedGoodLots ?? []).length === 0 ? <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-400">No downstream finished goods.</td></tr> : recall.finishedGoodLots.map((l: any) => (
                      <tr key={l.lotId} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs">{l.lotNumber ?? l.lotId?.slice(0, 8)}</td>
                        <td className="px-3 py-2 font-mono text-xs">{l.itemId?.slice(0, 8)}</td>
                        <td className="px-3 py-2">{l.status}</td>
                        <td className="px-3 py-2 text-xs">{l.expiryDate ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
