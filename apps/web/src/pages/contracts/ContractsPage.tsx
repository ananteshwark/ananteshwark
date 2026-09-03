import { useState, useEffect } from 'react';
import { Plus, AlertTriangle, CheckCircle, XCircle, RefreshCw, Pencil } from 'lucide-react';
import { contractsApi } from '../../api/contracts';
import CurrencySelect from '../../components/ui/CurrencySelect';

const STATUS_COLORS: Record<string, string> = {
  DRAFT:       'bg-gray-100 text-gray-600',
  ACTIVE:      'bg-green-100 text-green-700',
  EXPIRED:     'bg-red-100 text-red-700',
  TERMINATED:  'bg-red-100 text-red-700',
  RENEWED:     'bg-blue-100 text-blue-700',
};

const TYPE_LABELS: Record<string, string> = {
  PURCHASE: 'Purchase', SALES: 'Sales', SERVICE: 'Service', LEASE: 'Lease', OTHER: 'Other',
};

function CreateContractModal({ editing, onClose, onCreated }: { editing?: any; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    title: editing?.title ?? '', type: editing?.type ?? 'SERVICE', counterpartyName: editing?.counterpartyName ?? '',
    startDate: editing?.startDate ?? '', endDate: editing?.endDate ?? '',
    contractValue: editing?.contractValue != null ? String(editing.contractValue) : '',
    currency: editing?.currency ?? 'INR', terms: editing?.terms ?? '', notes: editing?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        contractValue: form.contractValue ? parseFloat(form.contractValue) : undefined,
      };
      if (editing) {
        await contractsApi.updateContract(editing.id, payload);
      } else {
        await contractsApi.createContract(payload);
      }
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">{editing ? 'Edit Contract' : 'New Contract'}</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Title</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.type}
                onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Counterparty</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.counterpartyName}
                onChange={e => setForm(p => ({ ...p, counterpartyName: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start Date</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.startDate}
                onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Date</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.endDate}
                onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Value</label>
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.contractValue}
                onChange={e => setForm(p => ({ ...p, contractValue: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Currency</label>
              <CurrencySelect className="w-full border rounded-lg px-3 py-2 text-sm" value={form.currency}
                onChange={code => setForm(p => ({ ...p, currency: code }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Terms</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} value={form.terms}
              onChange={e => setForm(p => ({ ...p, terms: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving || !form.title || !form.startDate}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Saving...' : editing ? 'Save Contract' : 'Create Contract'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ContractsPage() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [expiring, setExpiring] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [acting, setActing] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      contractsApi.getContracts({ limit: 50, search: search || undefined, status: statusFilter || undefined }),
      contractsApi.getExpiringContracts(30),
    ]).then(([r1, r2]) => {
      setContracts(r1.data?.items || []);
      setExpiring(r2.data?.data || []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [search, statusFilter]);

  const activate = async (id: string) => {
    setActing(id);
    try { await contractsApi.activateContract(id); load(); } finally { setActing(null); }
  };

  const terminate = async (id: string) => {
    if (!confirm('Terminate this contract?')) return;
    setActing(id);
    try { await contractsApi.terminateContract(id); load(); } finally { setActing(null); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contract Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Purchase, sales, and service contracts with renewal alerts</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus className="h-4 w-4" /> New Contract
        </button>
      </div>

      {expiring.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-yellow-800">{expiring.length} contract{expiring.length > 1 ? 's' : ''} expiring within 30 days</p>
            <ul className="mt-1 space-y-0.5">
              {expiring.slice(0, 5).map((c: any) => (
                <li key={c.id} className="text-xs text-yellow-700">{c.contractNumber}: {c.title} (ends {c.endDate})</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-4">
        {['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED'].map(s => (
          <div key={s} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">{s}</p>
            <p className="text-2xl font-bold mt-1">{contracts.filter(c => c.status === s).length}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex gap-3">
          <input type="text" placeholder="Search contracts..." value={search}
            onChange={e => setSearch(e.target.value)} className="border rounded-lg px-3 py-2 text-sm w-56" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="">All Statuses</option>
            {['DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED', 'RENEWED'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : contracts.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No contracts found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Number', 'Title', 'Type', 'Counterparty', 'Start', 'End', 'Value', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {contracts.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{c.contractNumber}</td>
                  <td className="px-4 py-2 font-medium max-w-[160px] truncate">{c.title}</td>
                  <td className="px-4 py-2 text-gray-500">{TYPE_LABELS[c.type] || c.type}</td>
                  <td className="px-4 py-2 text-gray-500">{c.counterpartyName || '—'}</td>
                  <td className="px-4 py-2 text-gray-500">{c.startDate}</td>
                  <td className="px-4 py-2 text-gray-500">{c.endDate || '—'}</td>
                  <td className="px-4 py-2 text-right">
                    {c.contractValue ? (c.contractValue).toLocaleString(undefined, { minimumFractionDigits: 0 }) : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] || ''}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      {c.status === 'DRAFT' && (
                        <button onClick={() => activate(c.id)} disabled={acting === c.id}
                          className="text-green-600 hover:text-green-800 p-1" title="Activate">
                          <CheckCircle className="h-4 w-4" />
                        </button>
                      )}
                      {c.status === 'ACTIVE' && (
                        <>
                          <button onClick={() => terminate(c.id)} disabled={acting === c.id}
                            className="text-red-500 hover:text-red-700 p-1" title="Terminate">
                            <XCircle className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <CreateContractModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
      )}
    </div>
  );
}
