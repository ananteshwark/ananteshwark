import { useState, useEffect } from 'react';
import { inventoryApi } from '../../api/inventory';

const TASK_STATUS_STYLES: Record<string, string> = {
  OPEN: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-400',
};

const LOT_STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  QUARANTINE: 'bg-orange-100 text-orange-700',
  EXPIRED: 'bg-red-100 text-red-700',
  CONSUMED: 'bg-gray-100 text-gray-500',
};

const CHAR_RESULT_STYLES: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-500',
  PASS: 'bg-green-100 text-green-700',
  FAIL: 'bg-red-100 text-red-700',
};

function BatchManagementTab() {
  const [lotSerialId, setLotSerialId] = useState('');
  const [characteristics, setCharacteristics] = useState<any[]>([]);
  const [lotStatus, setLotStatus] = useState<string | null>(null);
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
      <div className="flex gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">Lot/Serial ID (UUID)</label>
          <input
            className="border rounded px-2 py-1 text-sm w-80"
            placeholder="Lot serial UUID"
            value={lotSerialId}
            onChange={e => setLotSerialId(e.target.value)}
          />
        </div>
        <button onClick={loadCharacteristics} disabled={!lotSerialId} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm disabled:opacity-50">
          Load
        </button>
        <button onClick={releaseBatch} disabled={!lotSerialId} className="px-3 py-1.5 bg-green-600 text-white rounded text-sm disabled:opacity-50">
          Release
        </button>
        <button onClick={quarantineBatch} disabled={!lotSerialId} className="px-3 py-1.5 bg-orange-500 text-white rounded text-sm disabled:opacity-50">
          Quarantine
        </button>
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
              <input type="number" step="any" className="w-full border rounded px-2 py-1" value={newChar.minValue} onChange={e => setNewChar({ ...newChar, minValue: e.target.value })} placeholder="optional" />
            </div>
            <div>
              <label className="block font-medium mb-1">Max Value</label>
              <input type="number" step="any" className="w-full border rounded px-2 py-1" value={newChar.maxValue} onChange={e => setNewChar({ ...newChar, maxValue: e.target.value })} placeholder="optional" />
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
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">
          + New Task
        </button>
      </div>

      {message && (
        <div className="border rounded p-3 text-sm bg-red-50 border-red-200 text-red-700">
          {message}
          <button className="ml-3 text-xs" onClick={() => setMessage(null)}>dismiss</button>
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
              <label className="block font-medium mb-1">Priority (1-100)</label>
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
              <td className="p-2 border">
                <div className="flex gap-1">
                  {(t.status === 'OPEN' || t.status === 'IN_PROGRESS') && (
                    <button onClick={() => complete(t.id)} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded border border-green-200">
                      Complete
                    </button>
                  )}
                  {t.status !== 'COMPLETED' && t.status !== 'CANCELLED' && (
                    <button onClick={() => cancel(t.id)} className="text-xs px-2 py-1 border rounded text-gray-500">
                      Cancel
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {tasks.length === 0 && (
            <tr><td colSpan={7} className="p-4 text-center text-gray-400">No warehouse tasks</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const TABS = [
  { key: 'batch', label: 'Batch Management' },
  { key: 'bin-stock', label: 'Bin Stock' },
  { key: 'tasks', label: 'Warehouse Tasks' },
];

export default function WmsPage() {
  const [tab, setTab] = useState('tasks');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Extended WMS &amp; Batch Management</h1>
        <p className="text-gray-500 text-sm mt-1">Warehouse task management, bin-level stock tracking, and quality batch characteristics</p>
      </div>

      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'batch' && <BatchManagementTab />}
        {tab === 'bin-stock' && <BinStockTab />}
        {tab === 'tasks' && <WarehouseTasksTab />}
      </div>
    </div>
  );
}
