import { useState, useEffect } from 'react';
import { inventoryApi } from '../../api/inventory';

const TASK_STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-400',
};

const WAVE_STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  RELEASED: 'bg-purple-100 text-purple-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-400',
};

const CHAR_RESULT_STYLES: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-500',
  PASS: 'bg-green-100 text-green-700',
  FAIL: 'bg-red-100 text-red-700',
};

// ─── Batch Management ─────────────────────────────────────────────────────────

function BatchManagementTab() {
  const [lotSerialId, setLotSerialId] = useState('');
  const [characteristics, setCharacteristics] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [newChar, setNewChar] = useState({ name: '', value: '', unit: '', minValue: '', maxValue: '' });

  async function loadCharacteristics() {
    if (!lotSerialId) return;
    try {
      const res = await inventoryApi.getBatchCharacteristics(lotSerialId);
      setCharacteristics(res.data?.data ?? res.data ?? []);
    } catch {}
  }

  async function addCharacteristic(e: React.FormEvent) {
    e.preventDefault();
    try {
      await inventoryApi.recordBatchCharacteristics(lotSerialId, [{
        ...newChar,
        minValue: newChar.minValue ? Number(newChar.minValue) : undefined,
        maxValue: newChar.maxValue ? Number(newChar.maxValue) : undefined,
      }]);
      setNewChar({ name: '', value: '', unit: '', minValue: '', maxValue: '' });
      loadCharacteristics();
    } catch (err: any) {
      setMessage(`Error: ${err?.response?.data?.message ?? 'Failed'}`);
    }
  }

  async function releaseBatch() {
    try {
      await inventoryApi.releaseBatch(lotSerialId);
      setMessage('Batch released to ACTIVE');
    } catch (err: any) {
      setMessage(`Error: ${err?.response?.data?.message ?? 'Failed'}`);
    }
  }

  async function quarantineBatch() {
    try {
      await inventoryApi.quarantineBatch(lotSerialId);
      setMessage('Batch moved to QUARANTINE');
    } catch (err: any) {
      setMessage(`Error: ${err?.response?.data?.message ?? 'Failed'}`);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Batch / Lot Management</h2>
      <div className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="block text-xs font-medium mb-1">Lot/Serial ID (UUID)</label>
          <input
            className="border rounded px-2 py-1 text-sm w-80"
            placeholder="Lot serial UUID"
            value={lotSerialId}
            onChange={e => setLotSerialId(e.target.value)}
          />
        </div>
        <button onClick={loadCharacteristics} disabled={!lotSerialId} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50">Load</button>
        <button onClick={releaseBatch} disabled={!lotSerialId} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm disabled:opacity-50">Release</button>
        <button onClick={quarantineBatch} disabled={!lotSerialId} className="px-3 py-1.5 bg-orange-500 text-white rounded text-sm disabled:opacity-50">Quarantine</button>
      </div>

      {message && (
        <div className={`border rounded p-3 text-sm ${message.startsWith('Error') ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
          {message}
          <button className="ml-3 text-xs text-gray-400" onClick={() => setMessage(null)}>dismiss</button>
        </div>
      )}

      {lotSerialId && (
        <form onSubmit={addCharacteristic} className="bg-gray-50 border rounded p-4 space-y-3 text-sm">
          <div className="text-sm font-medium">Record Quality Characteristic</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-medium mb-1">Name</label>
              <input className="w-full border rounded px-2 py-1" value={newChar.name} onChange={e => setNewChar({ ...newChar, name: e.target.value })} required placeholder="e.g. pH" />
            </div>
            <div>
              <label className="block font-medium mb-1">Value</label>
              <input className="w-full border rounded px-2 py-1" value={newChar.value} onChange={e => setNewChar({ ...newChar, value: e.target.value })} placeholder="e.g. 7.2" />
            </div>
            <div>
              <label className="block font-medium mb-1">Unit</label>
              <input className="w-full border rounded px-2 py-1" value={newChar.unit} onChange={e => setNewChar({ ...newChar, unit: e.target.value })} placeholder="e.g. pH units" />
            </div>
            <div>
              <label className="block font-medium mb-1">Min Value</label>
              <input type="number" step="any" className="w-full border rounded px-2 py-1" value={newChar.minValue} onChange={e => setNewChar({ ...newChar, minValue: e.target.value })} />
            </div>
            <div>
              <label className="block font-medium mb-1">Max Value</label>
              <input type="number" step="any" className="w-full border rounded px-2 py-1" value={newChar.maxValue} onChange={e => setNewChar({ ...newChar, maxValue: e.target.value })} />
            </div>
          </div>
          <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">Record</button>
        </form>
      )}

      {characteristics.length > 0 && (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-2 border">Characteristic</th>
              <th className="p-2 border">Value</th>
              <th className="p-2 border">Unit</th>
              <th className="p-2 border">Min</th>
              <th className="p-2 border">Max</th>
              <th className="p-2 border">Result</th>
              <th className="p-2 border">Tested At</th>
            </tr>
          </thead>
          <tbody>
            {characteristics.map((c: any) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="p-2 border">{c.name}</td>
                <td className="p-2 border">{c.value ?? '—'}</td>
                <td className="p-2 border">{c.unit ?? '—'}</td>
                <td className="p-2 border">{c.minValue ?? '—'}</td>
                <td className="p-2 border">{c.maxValue ?? '—'}</td>
                <td className="p-2 border">
                  <span className={`px-2 py-0.5 rounded text-xs ${CHAR_RESULT_STYLES[c.result] ?? ''}`}>{c.result}</span>
                </td>
                <td className="p-2 border text-xs">{c.testedAt ? new Date(c.testedAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─── Bin Stock ────────────────────────────────────────────────────────────────

function BinStockTab() {
  const [binStock, setBinStock] = useState<any[]>([]);
  const [filters, setFilters] = useState({ warehouseId: '', itemId: '' });

  async function load() {
    try {
      const params: any = {};
      if (filters.warehouseId) params.warehouseId = filters.warehouseId;
      if (filters.itemId) params.itemId = filters.itemId;
      const res = await inventoryApi.getBinStock(params);
      setBinStock(res.data?.data ?? res.data ?? []);
    } catch {}
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Bin-Level Stock</h2>
      <div className="flex gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">Warehouse ID</label>
          <input className="border rounded px-2 py-1 text-sm w-64" placeholder="UUID" value={filters.warehouseId} onChange={e => setFilters({ ...filters, warehouseId: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Item ID</label>
          <input className="border rounded px-2 py-1 text-sm w-64" placeholder="UUID" value={filters.itemId} onChange={e => setFilters({ ...filters, itemId: e.target.value })} />
        </div>
        <button onClick={load} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">Search</button>
      </div>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2 border">Bin Location</th>
            <th className="p-2 border">Item</th>
            <th className="p-2 border">Lot</th>
            <th className="p-2 border text-right">Qty</th>
            <th className="p-2 border text-right">Reserved</th>
          </tr>
        </thead>
        <tbody>
          {binStock.map((b: any) => (
            <tr key={b.id} className="hover:bg-gray-50">
              <td className="p-2 border font-mono text-xs">{b.binLocationId}</td>
              <td className="p-2 border font-mono text-xs">{b.itemId}</td>
              <td className="p-2 border text-xs">{b.lotSerialId ?? '—'}</td>
              <td className="p-2 border text-right">{Number(b.qty).toLocaleString()}</td>
              <td className="p-2 border text-right text-red-600">{Number(b.reservedQty).toLocaleString()}</td>
            </tr>
          ))}
          {binStock.length === 0 && (
            <tr><td colSpan={5} className="p-4 text-center text-gray-400">No bin stock data</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Warehouse Tasks ──────────────────────────────────────────────────────────

function WarehouseTasksTab() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ taskType: 'PUTAWAY', warehouseId: '', itemId: '', qty: '', sourceBinId: '', destBinId: '', priority: '50' });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await inventoryApi.getWarehouseTasks();
      setTasks(res.data?.data ?? res.data ?? []);
    } catch {}
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await inventoryApi.createWarehouseTask({ ...form, qty: Number(form.qty), priority: Number(form.priority) });
    setShowForm(false);
    load();
  }

  async function complete(id: string) {
    try { await inventoryApi.completeWarehouseTask(id); load(); } catch (err: any) {
      setMessage(`Error: ${err?.response?.data?.message ?? 'Failed'}`);
    }
  }

  async function cancel(id: string) {
    try { await inventoryApi.cancelWarehouseTask(id); load(); } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Warehouse Tasks</h2>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">+ New Task</button>
      </div>

      {message && (
        <div className="border rounded p-3 text-sm bg-red-50 border-red-200 text-red-700">
          {message} <button className="ml-3 text-xs" onClick={() => setMessage(null)}>dismiss</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-gray-50 border rounded p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Task Type</label>
              <select className="w-full border rounded px-2 py-1" value={form.taskType} onChange={e => setForm({ ...form, taskType: e.target.value })}>
                {['PUTAWAY', 'PICK', 'MOVE', 'REPLENISH'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Warehouse ID</label>
              <input className="w-full border rounded px-2 py-1" value={form.warehouseId} onChange={e => setForm({ ...form, warehouseId: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Item ID</label>
              <input className="w-full border rounded px-2 py-1" value={form.itemId} onChange={e => setForm({ ...form, itemId: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Qty</label>
              <input type="number" className="w-full border rounded px-2 py-1" value={form.qty} onChange={e => setForm({ ...form, qty: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Source Bin ID</label>
              <input className="w-full border rounded px-2 py-1" value={form.sourceBinId} onChange={e => setForm({ ...form, sourceBinId: e.target.value })} placeholder="optional" />
            </div>
            <div>
              <label className="block font-medium mb-1">Dest Bin ID</label>
              <input className="w-full border rounded px-2 py-1" value={form.destBinId} onChange={e => setForm({ ...form, destBinId: e.target.value })} placeholder="optional" />
            </div>
            <div>
              <label className="block font-medium mb-1">Priority (1–100)</label>
              <input type="number" className="w-full border rounded px-2 py-1" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded">Create</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 border rounded">Cancel</button>
          </div>
        </form>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2 border">Task #</th>
            <th className="p-2 border">Type</th>
            <th className="p-2 border text-right">Qty</th>
            <th className="p-2 border">Source Bin</th>
            <th className="p-2 border">Dest Bin</th>
            <th className="p-2 border">Status</th>
            <th className="p-2 border">Wave</th>
            <th className="p-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((t: any) => (
            <tr key={t.id} className="hover:bg-gray-50">
              <td className="p-2 border font-mono text-xs">{t.taskNumber}</td>
              <td className="p-2 border">{t.taskType}</td>
              <td className="p-2 border text-right">{Number(t.qty).toLocaleString()}</td>
              <td className="p-2 border text-xs">{t.sourceBinId ? t.sourceBinId.slice(0, 8) + '…' : '—'}</td>
              <td className="p-2 border text-xs">{t.destBinId ? t.destBinId.slice(0, 8) + '…' : '—'}</td>
              <td className="p-2 border">
                <span className={`px-2 py-0.5 rounded text-xs ${TASK_STATUS_STYLES[t.status] ?? ''}`}>{t.status}</span>
              </td>
              <td className="p-2 border text-xs text-gray-400">{t.waveId ? t.waveId.slice(0, 8) + '…' : '—'}</td>
              <td className="p-2 border">
                <div className="flex gap-1">
                  {(t.status === 'OPEN' || t.status === 'IN_PROGRESS') && (
                    <button onClick={() => complete(t.id)} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded border border-green-200">Complete</button>
                  )}
                  {t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && (
                    <button onClick={() => cancel(t.id)} className="text-xs px-2 py-1 border rounded text-gray-500">Cancel</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {tasks.length === 0 && (
            <tr><td colSpan={8} className="p-4 text-center text-gray-400">No warehouse tasks</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Putaway Rules ────────────────────────────────────────────────────────────

const RULE_TYPE_LABELS: Record<string, string> = {
  FIXED_BIN: 'Fixed Bin',
  ITEM_ZONE: 'Item → Zone',
  CATEGORY_ZONE: 'Category → Zone',
  CONSOLIDATE: 'Consolidate',
  NEAREST_EMPTY: 'Nearest Empty',
};

function PutawayRulesTab() {
  const [rules, setRules] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    warehouseId: '', name: '', ruleType: 'CONSOLIDATE', priority: '50',
    itemId: '', itemCategoryId: '', destBinId: '', destZone: '',
  });
  const [suggest, setSuggest] = useState({ warehouseId: '', itemId: '', qty: '1' });
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { loadRules(); }, []);

  async function loadRules() {
    try {
      const res = await inventoryApi.listPutawayRules();
      setRules(res.data?.data ?? res.data ?? []);
    } catch {}
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await inventoryApi.createPutawayRule({
        ...form,
        priority: Number(form.priority),
        itemId: form.itemId || null,
        itemCategoryId: form.itemCategoryId || null,
        destBinId: form.destBinId || null,
        destZone: form.destZone || null,
      });
      setShowForm(false);
      setForm({ warehouseId: '', name: '', ruleType: 'CONSOLIDATE', priority: '50', itemId: '', itemCategoryId: '', destBinId: '', destZone: '' });
      loadRules();
    } catch (err: any) {
      setMessage(`Error: ${err?.response?.data?.message ?? 'Failed'}`);
    }
  }

  async function deleteRule(id: string) {
    try {
      await inventoryApi.deletePutawayRule(id);
      loadRules();
    } catch (err: any) {
      setMessage(`Error: ${err?.response?.data?.message ?? 'Failed'}`);
    }
  }

  async function runSuggest(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await inventoryApi.suggestPutaway({
        warehouseId: suggest.warehouseId, itemId: suggest.itemId, qty: Number(suggest.qty),
      });
      setSuggestions(res.data?.data ?? res.data ?? []);
    } catch (err: any) {
      setMessage(`Error: ${err?.response?.data?.message ?? 'Failed'}`);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Putaway Strategy Rules</h2>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">+ New Rule</button>
      </div>

      {message && (
        <div className="border rounded p-3 text-sm bg-red-50 border-red-200 text-red-700">
          {message} <button className="ml-3 text-xs" onClick={() => setMessage(null)}>dismiss</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-gray-50 border rounded p-4 space-y-3 text-sm">
          <div className="font-medium">New Putaway Rule</div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-medium mb-1">Name</label>
              <input className="w-full border rounded px-2 py-1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required placeholder="e.g. Cold zone food items" />
            </div>
            <div>
              <label className="block font-medium mb-1">Warehouse ID</label>
              <input className="w-full border rounded px-2 py-1" value={form.warehouseId} onChange={e => setForm({ ...form, warehouseId: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Rule Type</label>
              <select className="w-full border rounded px-2 py-1" value={form.ruleType} onChange={e => setForm({ ...form, ruleType: e.target.value })}>
                {Object.entries(RULE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Priority (lower = first)</label>
              <input type="number" className="w-full border rounded px-2 py-1" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} />
            </div>
            <div>
              <label className="block font-medium mb-1">Item ID (optional)</label>
              <input className="w-full border rounded px-2 py-1" value={form.itemId} onChange={e => setForm({ ...form, itemId: e.target.value })} placeholder="UUID or leave blank" />
            </div>
            <div>
              <label className="block font-medium mb-1">Category ID (optional)</label>
              <input className="w-full border rounded px-2 py-1" value={form.itemCategoryId} onChange={e => setForm({ ...form, itemCategoryId: e.target.value })} placeholder="UUID or leave blank" />
            </div>
            {form.ruleType === 'FIXED_BIN' && (
              <div>
                <label className="block font-medium mb-1">Dest Bin ID</label>
                <input className="w-full border rounded px-2 py-1" value={form.destBinId} onChange={e => setForm({ ...form, destBinId: e.target.value })} placeholder="UUID" />
              </div>
            )}
            {(form.ruleType === 'ITEM_ZONE' || form.ruleType === 'CATEGORY_ZONE') && (
              <div>
                <label className="block font-medium mb-1">Dest Zone</label>
                <input className="w-full border rounded px-2 py-1" value={form.destZone} onChange={e => setForm({ ...form, destZone: e.target.value })} placeholder="e.g. COLD, DRY, BULK" />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded">Create</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 border rounded">Cancel</button>
          </div>
        </form>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2 border">Priority</th>
            <th className="p-2 border">Name</th>
            <th className="p-2 border">Type</th>
            <th className="p-2 border">Dest</th>
            <th className="p-2 border">Item/Cat filter</th>
            <th className="p-2 border">Active</th>
            <th className="p-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r: any) => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="p-2 border text-center">{r.priority}</td>
              <td className="p-2 border font-medium">{r.name}</td>
              <td className="p-2 border">
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">{RULE_TYPE_LABELS[r.ruleType] ?? r.ruleType}</span>
              </td>
              <td className="p-2 border text-xs text-gray-600">
                {r.destBinId ? `Bin: …${r.destBinId.slice(-6)}` : r.destZone ? `Zone: ${r.destZone}` : '—'}
              </td>
              <td className="p-2 border text-xs text-gray-500">
                {r.itemId ? `Item: …${r.itemId.slice(-6)}` : r.itemCategoryId ? `Cat: …${r.itemCategoryId.slice(-6)}` : 'Any'}
              </td>
              <td className="p-2 border text-center">
                <span className={`px-2 py-0.5 rounded text-xs ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                  {r.isActive ? 'Yes' : 'No'}
                </span>
              </td>
              <td className="p-2 border">
                <button onClick={() => deleteRule(r.id)} className="text-xs px-2 py-1 text-red-600 border border-red-200 rounded hover:bg-red-50">Delete</button>
              </td>
            </tr>
          ))}
          {rules.length === 0 && (
            <tr><td colSpan={7} className="p-4 text-center text-gray-400">No putaway rules configured</td></tr>
          )}
        </tbody>
      </table>

      {/* Suggest putaway bin */}
      <div className="bg-white border rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-sm">Try Putaway Suggestion</h3>
        <form onSubmit={runSuggest} className="flex gap-3 items-end flex-wrap text-sm">
          <div>
            <label className="block text-xs font-medium mb-1">Warehouse ID</label>
            <input className="border rounded px-2 py-1 w-52" value={suggest.warehouseId} onChange={e => setSuggest({ ...suggest, warehouseId: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Item ID</label>
            <input className="border rounded px-2 py-1 w-52" value={suggest.itemId} onChange={e => setSuggest({ ...suggest, itemId: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Qty</label>
            <input type="number" className="border rounded px-2 py-1 w-24" value={suggest.qty} onChange={e => setSuggest({ ...suggest, qty: e.target.value })} required />
          </div>
          <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded">Suggest</button>
        </form>

        {suggestions.length > 0 && (
          <div className="space-y-2">
            {suggestions.map((s: any, i: number) => (
              <div key={i} className="flex items-center gap-4 text-sm bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2">
                <span className="text-xs font-bold text-indigo-600 w-4">{i + 1}</span>
                <span className="font-mono font-medium">{s.binCode}</span>
                {s.zone && <span className="text-xs text-gray-500">Zone: {s.zone}</span>}
                {s.aisle && <span className="text-xs text-gray-500">Aisle: {s.aisle}</span>}
                <span className="text-xs text-gray-500">Current stock: {s.currentQty}</span>
                <span className="text-xs text-indigo-700 flex-1">{s.reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Pick Waves ───────────────────────────────────────────────────────────────

function PickWavesTab() {
  const [waves, setWaves] = useState<any[]>([]);
  const [selectedWave, setSelectedWave] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ warehouseId: '', pickStrategy: 'FEFO', priority: '50', notes: '' });
  const [pickSuggest, setPickSuggest] = useState({ warehouseId: '', itemId: '', qty: '1', strategy: 'FEFO' });
  const [picks, setPicks] = useState<any[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { loadWaves(); }, []);

  async function loadWaves() {
    try {
      const res = await inventoryApi.listWaves();
      setWaves(res.data?.data ?? res.data ?? []);
    } catch {}
  }

  async function openWave(wave: any) {
    try {
      const res = await inventoryApi.getWave(wave.id);
      setSelectedWave(res.data?.data ?? res.data);
    } catch {}
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await inventoryApi.createWave({ ...form, priority: Number(form.priority) });
      setShowForm(false);
      loadWaves();
    } catch (err: any) {
      setMessage(`Error: ${err?.response?.data?.message ?? 'Failed'}`);
    }
  }

  async function releaseWave(id: string) {
    try { await inventoryApi.releaseWave(id); loadWaves(); if (selectedWave?.id === id) openWave({ id }); }
    catch (err: any) { setMessage(`Error: ${err?.response?.data?.message ?? 'Failed'}`); }
  }

  async function completeWave(id: string) {
    try { await inventoryApi.completeWave(id); loadWaves(); if (selectedWave?.id === id) openWave({ id }); }
    catch (err: any) { setMessage(`Error: ${err?.response?.data?.message ?? 'Failed'}`); }
  }

  async function cancelWave(id: string) {
    try { await inventoryApi.cancelWave(id); loadWaves(); setSelectedWave(null); }
    catch (err: any) { setMessage(`Error: ${err?.response?.data?.message ?? 'Failed'}`); }
  }

  async function runPickSuggest(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await inventoryApi.suggestPicks({
        warehouseId: pickSuggest.warehouseId, itemId: pickSuggest.itemId,
        qty: Number(pickSuggest.qty), strategy: pickSuggest.strategy,
      });
      setPicks(res.data?.data ?? res.data ?? []);
    } catch (err: any) {
      setMessage(`Error: ${err?.response?.data?.message ?? 'Failed'}`);
    }
  }

  return (
    <div className="space-y-6">
      {message && (
        <div className="border rounded p-3 text-sm bg-red-50 border-red-200 text-red-700">
          {message} <button className="ml-3 text-xs" onClick={() => setMessage(null)}>dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Wave list */}
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Pick Waves</h2>
            <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">+ New Wave</button>
          </div>

          {showForm && (
            <form onSubmit={handleCreate} className="bg-gray-50 border rounded p-4 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Warehouse ID</label>
                  <input className="w-full border rounded px-2 py-1" value={form.warehouseId} onChange={e => setForm({ ...form, warehouseId: e.target.value })} required />
                </div>
                <div>
                  <label className="block font-medium mb-1">Pick Strategy</label>
                  <select className="w-full border rounded px-2 py-1" value={form.pickStrategy} onChange={e => setForm({ ...form, pickStrategy: e.target.value })}>
                    <option value="FIFO">FIFO (oldest lot first)</option>
                    <option value="FEFO">FEFO (earliest expiry first)</option>
                    <option value="ZONE">Zone (zone-directed)</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium mb-1">Priority</label>
                  <input type="number" className="w-full border rounded px-2 py-1" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} />
                </div>
                <div>
                  <label className="block font-medium mb-1">Notes</label>
                  <input className="w-full border rounded px-2 py-1" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded">Create</button>
                <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 border rounded">Cancel</button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {waves.map((w: any) => (
              <div
                key={w.id}
                onClick={() => openWave(w)}
                className={`border rounded-lg p-3 cursor-pointer hover:border-blue-400 transition-colors ${selectedWave?.id === w.id ? 'border-blue-500 bg-blue-50' : 'bg-white'}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-mono font-semibold text-sm">{w.waveNumber}</span>
                    <span className="ml-2 text-xs text-gray-500">{w.pickStrategy}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs ${WAVE_STATUS_STYLES[w.status] ?? ''}`}>{w.status}</span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {w.taskCount ?? 0} tasks • {w.completedCount ?? 0} done
                  {w.notes && <span className="ml-2 italic">{w.notes}</span>}
                </div>
                <div className="flex gap-2 mt-2">
                  {w.status === 'OPEN' && (
                    <button onClick={ev => { ev.stopPropagation(); releaseWave(w.id); }}
                      className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded">Release</button>
                  )}
                  {(w.status === 'RELEASED' || w.status === 'IN_PROGRESS') && (
                    <button onClick={ev => { ev.stopPropagation(); completeWave(w.id); }}
                      className="text-xs px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded">Complete</button>
                  )}
                  {w.status !== 'COMPLETED' && w.status !== 'CANCELLED' && (
                    <button onClick={ev => { ev.stopPropagation(); cancelWave(w.id); }}
                      className="text-xs px-2 py-0.5 border rounded text-gray-500">Cancel</button>
                  )}
                </div>
              </div>
            ))}
            {waves.length === 0 && (
              <div className="text-center text-gray-400 text-sm py-8 border rounded-lg">No pick waves yet</div>
            )}
          </div>
        </div>

        {/* Wave detail */}
        <div>
          {selectedWave ? (
            <div className="space-y-3">
              <h3 className="font-semibold">{selectedWave.waveNumber} — Tasks</h3>
              <div className="space-y-1">
                {(selectedWave.tasks ?? []).map((t: any) => (
                  <div key={t.id} className="flex items-center gap-3 text-xs border rounded px-3 py-1.5 bg-white">
                    <span className="font-mono">{t.taskNumber}</span>
                    <span className="text-gray-500">{t.taskType}</span>
                    <span className="text-right ml-auto">{Number(t.qty).toLocaleString()}</span>
                    <span className={`px-2 py-0.5 rounded ${TASK_STATUS_STYLES[t.status] ?? ''}`}>{t.status}</span>
                  </div>
                ))}
                {(selectedWave.tasks ?? []).length === 0 && (
                  <div className="text-xs text-gray-400 py-4 text-center">No tasks in this wave</div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-400 text-center py-16 border rounded-xl">Select a wave to see its tasks</div>
          )}
        </div>
      </div>

      {/* Directed pick suggestion */}
      <div className="bg-white border rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-sm">Directed Pick Suggestion</h3>
        <p className="text-xs text-gray-500">
          System suggests which bins and lots to pick from in the optimal sequence for your chosen strategy.
        </p>
        <form onSubmit={runPickSuggest} className="flex gap-3 items-end flex-wrap text-sm">
          <div>
            <label className="block text-xs font-medium mb-1">Warehouse ID</label>
            <input className="border rounded px-2 py-1 w-48" value={pickSuggest.warehouseId} onChange={e => setPickSuggest({ ...pickSuggest, warehouseId: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Item ID</label>
            <input className="border rounded px-2 py-1 w-48" value={pickSuggest.itemId} onChange={e => setPickSuggest({ ...pickSuggest, itemId: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Qty Needed</label>
            <input type="number" className="border rounded px-2 py-1 w-24" value={pickSuggest.qty} onChange={e => setPickSuggest({ ...pickSuggest, qty: e.target.value })} required />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Strategy</label>
            <select className="border rounded px-2 py-1" value={pickSuggest.strategy} onChange={e => setPickSuggest({ ...pickSuggest, strategy: e.target.value })}>
              <option value="FIFO">FIFO</option>
              <option value="FEFO">FEFO</option>
              <option value="ZONE">Zone</option>
            </select>
          </div>
          <button type="submit" className="px-3 py-1.5 bg-indigo-600 text-white rounded">Suggest Picks</button>
        </form>

        {picks.length > 0 && (
          <table className="w-full text-sm border-collapse mt-2">
            <thead>
              <tr className="bg-gray-50 text-xs text-left">
                <th className="p-2 border">#</th>
                <th className="p-2 border">Bin</th>
                <th className="p-2 border">Zone</th>
                <th className="p-2 border">Lot</th>
                <th className="p-2 border">Expiry</th>
                <th className="p-2 border text-right">Available</th>
                <th className="p-2 border text-right">Pick Qty</th>
              </tr>
            </thead>
            <tbody>
              {picks.map((p: any) => (
                <tr key={p.sequence} className={p.sequence % 2 === 0 ? 'bg-gray-50' : ''}>
                  <td className="p-2 border text-center text-xs font-bold text-indigo-600">{p.sequence}</td>
                  <td className="p-2 border font-mono text-xs">{p.binCode}</td>
                  <td className="p-2 border text-xs">{p.zone ?? '—'}{p.aisle ? ` · ${p.aisle}` : ''}</td>
                  <td className="p-2 border text-xs">{p.lotNumber ?? '—'}</td>
                  <td className="p-2 border text-xs">{p.expiryDate ?? '—'}</td>
                  <td className="p-2 border text-right">{p.availableQty.toLocaleString()}</td>
                  <td className="p-2 border text-right font-semibold text-green-700">{p.suggestedQty.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TABS = [
  { key: 'tasks', label: 'Warehouse Tasks' },
  { key: 'putaway', label: 'Putaway Rules' },
  { key: 'waves', label: 'Pick Waves' },
  { key: 'batch', label: 'Batch Management' },
  { key: 'bin-stock', label: 'Bin Stock' },
];

export default function WmsPage() {
  const [tab, setTab] = useState('tasks');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Warehouse Management</h1>
        <p className="text-gray-500 text-sm mt-1">
          Putaway &amp; picking strategies, wave management, bin-level stock, and batch quality
        </p>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'tasks' && <WarehouseTasksTab />}
        {tab === 'putaway' && <PutawayRulesTab />}
        {tab === 'waves' && <PickWavesTab />}
        {tab === 'batch' && <BatchManagementTab />}
        {tab === 'bin-stock' && <BinStockTab />}
      </div>
    </div>
  );
}
