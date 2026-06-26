import { useState, useEffect } from 'react';
import { Plus, Play, CheckCircle, FileText, Trash2 } from 'lucide-react';
import { financeApi } from '../../api/finance';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  DISPOSED: 'bg-gray-100 text-gray-600',
  IMPAIRED: 'bg-yellow-100 text-yellow-700',
  RETIRED: 'bg-red-100 text-red-700',
};

const RUN_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-yellow-100 text-yellow-700',
  POSTED: 'bg-green-100 text-green-700',
  REVERSED: 'bg-gray-100 text-gray-600',
};

type Tab = 'assets' | 'runs' | 'cip';

function CreateAssetModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    assetCode: '', name: '', categoryId: '', acquisitionDate: '', acquisitionCost: '',
    usefulLifeMonths: '60', residualValue: '0', depreciationMethod: 'SLM',
    location: '', serialNumber: '', notes: '',
  });
  const [categories, setCategories] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    financeApi.getAssetCategories({ limit: 100 }).then(r => setCategories(r.data?.items || []));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await financeApi.createFixedAsset({
        ...form,
        acquisitionCost: parseFloat(form.acquisitionCost),
        residualValue: parseFloat(form.residualValue),
        usefulLifeMonths: parseInt(form.usefulLifeMonths),
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6">
        <h2 className="text-lg font-semibold mb-4">Add Fixed Asset</h2>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Asset Code', key: 'assetCode', type: 'text' },
            { label: 'Name', key: 'name', type: 'text' },
            { label: 'Acquisition Date', key: 'acquisitionDate', type: 'date' },
            { label: 'Acquisition Cost', key: 'acquisitionCost', type: 'number' },
            { label: 'Useful Life (months)', key: 'usefulLifeMonths', type: 'number' },
            { label: 'Residual Value', key: 'residualValue', type: 'number' },
            { label: 'Location', key: 'location', type: 'text' },
            { label: 'Serial Number', key: 'serialNumber', type: 'text' },
          ].map(f => (
            <div key={f.key}>
              <label className="block text-xs text-gray-500 mb-1">{f.label}</label>
              <input
                type={f.type}
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={(form as any)[f.key]}
                onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
              />
            </div>
          ))}
          <div>
            <label className="block text-xs text-gray-500 mb-1">Category</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.categoryId}
              onChange={e => setForm(p => ({ ...p, categoryId: e.target.value }))}
            >
              <option value="">Select category</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Depreciation Method</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.depreciationMethod}
              onChange={e => setForm(p => ({ ...p, depreciationMethod: e.target.value }))}
            >
              <option value="SLM">SLM (Straight Line)</option>
              <option value="WDV">WDV (Written Down Value)</option>
              <option value="DB">DB (Double Declining)</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={2}
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button
            onClick={save}
            disabled={saving || !form.assetCode || !form.name || !form.acquisitionDate || !form.acquisitionCost}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Add Asset'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DisposeModal({ asset, onClose, onDone }: { asset: any; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ disposalDate: '', disposalAmount: '', disposalReason: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await financeApi.disposeAsset(asset.id, {
        disposalDate: form.disposalDate,
        disposalAmount: parseFloat(form.disposalAmount),
        disposalReason: form.disposalReason,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Dispose Asset: {asset.assetCode}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Disposal Date</label>
            <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.disposalDate} onChange={e => setForm(p => ({ ...p, disposalDate: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Disposal Amount</label>
            <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.disposalAmount} onChange={e => setForm(p => ({ ...p, disposalAmount: e.target.value }))} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Reason</label>
            <input type="text" className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.disposalReason} onChange={e => setForm(p => ({ ...p, disposalReason: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button
            onClick={save}
            disabled={saving || !form.disposalDate || !form.disposalAmount}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg disabled:opacity-50"
          >
            {saving ? 'Processing...' : 'Dispose'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RunDepreciationModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const now = new Date();
  const [form, setForm] = useState({
    periodYear: now.getFullYear().toString(),
    periodMonth: (now.getMonth() + 1).toString(),
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await financeApi.runDepreciation({
        periodYear: parseInt(form.periodYear),
        periodMonth: parseInt(form.periodMonth),
        notes: form.notes,
      });
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold mb-4">Run Depreciation</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Year</label>
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.periodYear} onChange={e => setForm(p => ({ ...p, periodYear: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Month (1-12)</label>
              <input type="number" min={1} max={12} className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.periodMonth} onChange={e => setForm(p => ({ ...p, periodMonth: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input type="text" className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
          >
            {saving ? 'Running...' : 'Run'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FixedAssetsPage() {
  const [tab, setTab] = useState<Tab>('assets');
  const [assets, setAssets] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateAsset, setShowCreateAsset] = useState(false);
  const [showRunDep, setShowRunDep] = useState(false);
  const [disposeTarget, setDisposeTarget] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [cipAssets, setCipAssets] = useState<any[]>([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      financeApi.getFixedAssets({ limit: 100, search: search || undefined }),
      financeApi.getDepreciationRuns({ limit: 50 }),
      financeApi.listCipAssets(),
    ]).then(([r1, r2, r3]) => {
      setAssets(r1.data?.items || []);
      setRuns(r2.data?.items || []);
      setCipAssets(r3.data?.data ?? r3.data ?? []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search]);

  const postRun = async (id: string) => {
    await financeApi.postDepreciationRun(id);
    load();
  };

  const handleImpair = async (a: any) => {
    const v = window.prompt(`Impairment — recoverable amount for ${a.assetCode} (current NBV ${a.netBookValue}):`);
    if (!v) return;
    try {
      await financeApi.impairAsset(a.id, { date: new Date().toISOString().slice(0, 10), recoverableAmount: Number(v) });
      load();
    } catch (e: any) { alert(e.response?.data?.message ?? 'Impairment failed'); }
  };

  const handleRevalue = async (a: any) => {
    const v = window.prompt(`Revalue — fair value for ${a.assetCode} (current NBV ${a.netBookValue}):`);
    if (!v) return;
    try {
      await financeApi.revalueAsset(a.id, { date: new Date().toISOString().slice(0, 10), fairValue: Number(v) });
      load();
    } catch (e: any) { alert(e.response?.data?.message ?? 'Revaluation failed'); }
  };

  const handleCreateCip = async () => {
    const name = window.prompt('CIP asset name:');
    if (!name) return;
    const categoryId = window.prompt('Category ID:');
    if (!categoryId) return;
    const code = `CIP-${Date.now().toString().slice(-6)}`;
    await financeApi.createCipAsset({ cipCode: code, name, categoryId, startDate: new Date().toISOString().slice(0, 10) });
    load();
  };

  const handleAddCipCost = async (cip: any) => {
    const amt = window.prompt(`Add cost to ${cip.cipCode}:`);
    if (!amt) return;
    await financeApi.addCipCost(cip.id, { date: new Date().toISOString().slice(0, 10), description: 'Cost', amount: Number(amt) });
    load();
  };

  const handleCapitalize = async (cip: any) => {
    const life = window.prompt(`Capitalize ${cip.cipCode} (accumulated ${cip.accumulatedCost}). Useful life in months:`);
    if (!life) return;
    try {
      await financeApi.capitalizeCip(cip.id, { capitalizedDate: new Date().toISOString().slice(0, 10), usefulLifeMonths: Number(life) });
      load();
    } catch (e: any) { alert(e.response?.data?.message ?? 'Capitalize failed'); }
  };

  const totalNBV = assets.filter(a => a.status === 'ACTIVE').reduce((s: number, a: any) => s + (a.netBookValue || 0), 0);
  const totalCost = assets.filter(a => a.status === 'ACTIVE').reduce((s: number, a: any) => s + (a.acquisitionCost || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fixed Assets</h1>
          <p className="text-sm text-gray-500 mt-0.5">Asset register, depreciation, and disposals</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowRunDep(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700"
          >
            <Play className="h-4 w-4" /> Run Depreciation
          </button>
          <button
            onClick={() => setShowCreateAsset(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Add Asset
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Active Assets</p>
          <p className="text-2xl font-bold mt-1">{assets.filter(a => a.status === 'ACTIVE').length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Total Cost (Active)</p>
          <p className="text-2xl font-bold mt-1">{totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Net Book Value (Active)</p>
          <p className="text-2xl font-bold mt-1">{totalNBV.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {(['assets', 'runs', 'cip'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'assets' ? 'Asset Register' : t === 'runs' ? 'Depreciation Runs' : 'CIP (Construction)'}
          </button>
        ))}
      </div>

      {tab === 'assets' && (
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b flex gap-3">
            <input
              type="text"
              placeholder="Search assets..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm w-64"
            />
          </div>
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : assets.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No assets found. Add your first fixed asset.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Code', 'Name', 'Method', 'Acquisition Cost', 'Acc. Depreciation', 'Net Book Value', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {assets.map((a: any) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{a.assetCode}</td>
                    <td className="px-4 py-2 font-medium">{a.name}</td>
                    <td className="px-4 py-2 text-gray-500">{a.depreciationMethod}</td>
                    <td className="px-4 py-2 text-right">{(a.acquisitionCost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-right text-red-600">{(a.accumulatedDepreciation ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-right font-medium">{(a.netBookValue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[a.status] || ''}`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1">
                        {(a.status === 'ACTIVE' || a.status === 'IMPAIRED') && (
                          <>
                            <button onClick={() => handleImpair(a)} className="text-xs text-orange-600 hover:underline" title="Impair (IAS 36)">Impair</button>
                            <button onClick={() => handleRevalue(a)} className="text-xs text-indigo-600 hover:underline" title="Revalue (IAS 16)">Revalue</button>
                          </>
                        )}
                        {a.status === 'ACTIVE' && (
                          <button
                            onClick={() => setDisposeTarget(a)}
                            className="text-red-500 hover:text-red-700 p-1"
                            title="Dispose"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'runs' && (
        <div className="bg-white rounded-xl border">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading...</div>
          ) : runs.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No depreciation runs yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Period', 'Run Date', 'Assets', 'Total Depreciation', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {runs.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{r.periodYear}-{String(r.periodMonth).padStart(2, '0')}</td>
                    <td className="px-4 py-2 text-gray-500">{r.runDate}</td>
                    <td className="px-4 py-2">{r.assetCount}</td>
                    <td className="px-4 py-2 text-right font-medium">{(r.totalDepreciation ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${RUN_STATUS_COLORS[r.status] || ''}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {r.status === 'DRAFT' && (
                        <button
                          onClick={() => postRun(r.id)}
                          className="flex items-center gap-1 text-xs text-green-600 hover:text-green-800 border border-green-300 rounded px-2 py-1"
                        >
                          <CheckCircle className="h-3 w-3" /> Post
                        </button>
                      )}
                      {r.status === 'POSTED' && (
                        <span className="flex items-center gap-1 text-xs text-gray-400">
                          <FileText className="h-3 w-3" /> {r.journalEntryId ? 'GL Posted' : 'Posted'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'cip' && (
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b flex justify-between items-center">
            <p className="text-sm text-gray-500">Construction-in-Progress assets accumulate cost until capitalization (transfers CIP → fixed asset).</p>
            <button onClick={handleCreateCip} className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              <Plus className="h-4 w-4" /> New CIP
            </button>
          </div>
          {cipAssets.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No CIP assets.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Code', 'Name', 'Accumulated Cost', 'Start Date', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {cipAssets.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{c.cipCode}</td>
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2 text-right">{Number(c.accumulatedCost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-gray-500">{c.startDate}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.status === 'CAPITALIZED' ? 'bg-green-100 text-green-700' : c.status === 'CANCELLED' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700'}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-2">
                      {c.status === 'IN_PROGRESS' && (
                        <div className="flex gap-2">
                          <button onClick={() => handleAddCipCost(c)} className="text-xs text-blue-600 hover:underline">+ Cost</button>
                          <button onClick={() => handleCapitalize(c)} className="text-xs text-green-600 hover:underline">Capitalize</button>
                        </div>
                      )}
                      {c.status === 'CAPITALIZED' && <span className="text-xs text-gray-400">→ asset created</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showCreateAsset && (
        <CreateAssetModal
          onClose={() => setShowCreateAsset(false)}
          onCreated={() => { setShowCreateAsset(false); load(); }}
        />
      )}
      {showRunDep && (
        <RunDepreciationModal
          onClose={() => setShowRunDep(false)}
          onDone={() => { setShowRunDep(false); load(); }}
        />
      )}
      {disposeTarget && (
        <DisposeModal
          asset={disposeTarget}
          onClose={() => setDisposeTarget(null)}
          onDone={() => { setDisposeTarget(null); load(); }}
        />
      )}
    </div>
  );
}
