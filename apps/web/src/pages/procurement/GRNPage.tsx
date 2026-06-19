import { useState, useEffect } from 'react';
import { procurementApi } from '../../api/procurement';
import { Plus } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

function NewGrnDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [poId, setPoId] = useState('');
  const [poDetail, setPoDetail] = useState<any>(null);
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadPo = async () => {
    if (!poId) return;
    try {
      const res = await procurementApi.getPurchaseOrder(poId);
      setPoDetail(res.data);
      setLines(
        (res.data.lines || []).map((l: any) => ({
          poLineId: l.id,
          description: l.description,
          quantityOrdered: l.quantity,
          quantityReceived: l.quantity - (l.quantityReceived || 0),
          quantityAccepted: l.quantity - (l.quantityReceived || 0),
          quantityRejected: 0,
        })),
      );
    } catch {
      setError('PO not found');
    }
  };

  const updateLine = (i: number, field: string, value: any) =>
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await procurementApi.createGrn({
        poId,
        receiptDate,
        notes,
        lines: lines.map((l) => ({
          poLineId: l.poLineId,
          quantityReceived: Number(l.quantityReceived),
          quantityAccepted: Number(l.quantityAccepted),
          quantityRejected: Number(l.quantityRejected || 0),
        })),
      });
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.message || 'Failed to create GRN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b"><h2 className="text-lg font-semibold">New Goods Receipt Note</h2></div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
              placeholder="PO ID or PO Number"
              value={poId}
              onChange={(e) => setPoId(e.target.value)}
            />
            <button type="button" onClick={loadPo} className="px-3 py-2 text-sm border rounded-lg hover:bg-gray-50">Load PO</button>
          </div>
          {poDetail && (
            <div className="text-sm bg-gray-50 p-3 rounded-lg">
              <strong>{poDetail.poNumber}</strong> — {poDetail.vendorName} — Status: {poDetail.status}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Receipt Date *</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          {lines.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Lines</label>
              <table className="w-full text-xs border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left">Description</th>
                    <th className="px-2 py-2 text-right">Ordered</th>
                    <th className="px-2 py-2 text-right">Received</th>
                    <th className="px-2 py-2 text-right">Accepted</th>
                    <th className="px-2 py-2 text-right">Rejected</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">{line.description}</td>
                      <td className="px-2 py-1 text-right">{line.quantityOrdered}</td>
                      <td className="px-2 py-1">
                        <input type="number" className="w-16 border rounded px-1 text-right" value={line.quantityReceived} min={0} onChange={(e) => updateLine(i, 'quantityReceived', e.target.value)} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" className="w-16 border rounded px-1 text-right" value={line.quantityAccepted} min={0} onChange={(e) => updateLine(i, 'quantityAccepted', e.target.value)} />
                      </td>
                      <td className="px-2 py-1">
                        <input type="number" className="w-16 border rounded px-1 text-right" value={line.quantityRejected} min={0} onChange={(e) => updateLine(i, 'quantityRejected', e.target.value)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={loading || !poDetail} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{loading ? 'Creating...' : 'Create GRN'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function GRNPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [matchResult, setMatchResult] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await procurementApi.getGrns();
      setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleConfirm = async (id: string) => {
    try {
      await procurementApi.confirmGrn(id);
      const matchRes = await procurementApi.getGrnMatch(id);
      setMatchResult(matchRes.data);
      loadData();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Confirm failed');
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await procurementApi.cancelGrn(id);
      loadData();
    } catch (e: any) {
      alert(e.response?.data?.message || 'Cancel failed');
    }
  };

  const items = data?.items || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Goods Receipt Notes</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} GRNs</p>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
          <Plus className="h-4 w-4" /> New GRN
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No GRNs found</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">GRN #</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">PO ID</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Vendor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Receipt Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((grn: any) => (
                <tr key={grn.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{grn.grnNumber}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{grn.poId?.slice(0, 8)}...</td>
                  <td className="px-4 py-3 text-gray-700">{grn.vendorId?.slice(0, 8)}...</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[grn.status] || ''}`}>{grn.status}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{grn.receiptDate}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {grn.status === 'DRAFT' && (
                        <>
                          <button onClick={() => handleConfirm(grn.id)} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">Confirm</button>
                          <button onClick={() => handleCancel(grn.id)} className="text-xs px-2 py-1 bg-gray-50 text-gray-600 rounded hover:bg-gray-100">Cancel</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {matchResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="p-6 border-b flex items-center justify-between">
              <h2 className="text-lg font-semibold">3-Way Match Result</h2>
              <button onClick={() => setMatchResult(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-6">
              <div className={`mb-4 p-3 rounded-lg text-sm font-medium ${matchResult.matched ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                {matchResult.matched ? 'All lines matched — AP Bill created automatically' : 'Partial match — manual review required'}
              </div>
              <div className="space-y-2">
                {matchResult.lines?.map((l: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b pb-2">
                    <span className="text-gray-700">{l.description}</span>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>PO: {l.poQty}</span>
                      <span>GRN: {l.grnQty}</span>
                      <span className={l.matched ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>{l.matched ? 'Matched' : 'Unmatched'}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showNew && <NewGrnDialog onClose={() => setShowNew(false)} onSaved={loadData} />}
    </div>
  );
}
