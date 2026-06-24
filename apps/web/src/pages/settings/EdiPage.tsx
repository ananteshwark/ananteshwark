import { useState, useEffect, useCallback } from 'react';
import {
  Network,
  Plus,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Upload,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  Loader,
} from 'lucide-react';
import * as ediApi from '../../api/edi';

const TRANSACTION_SETS = ['850', '855', '856', '810'];
const SET_LABELS: Record<string, string> = {
  '850': 'Purchase Order',
  '855': 'PO Acknowledgment',
  '856': 'Ship Notice (ASN)',
  '810': 'Invoice',
};

const STATUS_STYLES: Record<string, string> = {
  RECEIVED: 'bg-blue-900/30 text-blue-300',
  PROCESSING: 'bg-yellow-900/30 text-yellow-300',
  PROCESSED: 'bg-green-900/30 text-green-300',
  SENT: 'bg-indigo-900/30 text-indigo-300',
  FAILED: 'bg-red-900/30 text-red-300',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  RECEIVED: <Clock className="w-3 h-3" />,
  PROCESSING: <Loader className="w-3 h-3 animate-spin" />,
  PROCESSED: <CheckCircle className="w-3 h-3" />,
  SENT: <CheckCircle className="w-3 h-3" />,
  FAILED: <XCircle className="w-3 h-3" />,
};

interface TradingPartner {
  id: string;
  partnerId: string;
  name: string;
  idQualifier: string;
  senderId: string;
  senderQualifier: string;
  isActive: boolean;
  supportedSets: string[];
  notes?: string;
}

interface EdiTransaction {
  id: string;
  tradingPartnerId: string;
  transactionSet: string;
  direction: string;
  referenceNumber?: string;
  status: string;
  errorMessage?: string;
  parsedPayload?: Record<string, unknown>;
  createdAt: string;
}

function PartnerForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<TradingPartner>;
  onSave: (data: Omit<TradingPartner, 'id' | 'isActive'>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    partnerId: initial?.partnerId ?? '',
    name: initial?.name ?? '',
    idQualifier: initial?.idQualifier ?? 'ZZ',
    senderId: initial?.senderId ?? '',
    senderQualifier: initial?.senderQualifier ?? 'ZZ',
    supportedSets: initial?.supportedSets ?? [],
    notes: initial?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  const toggleSet = (s: string) => {
    setForm((f) => ({
      ...f,
      supportedSets: f.supportedSets.includes(s)
        ? f.supportedSets.filter((x) => x !== s)
        : [...f.supportedSets, s],
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(form);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 p-4 bg-gray-800 rounded-xl border border-gray-700">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Partner ID (ISA-level, max 15)</label>
          <input
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
            value={form.partnerId}
            onChange={(e) => setForm((f) => ({ ...f, partnerId: e.target.value.slice(0, 15) }))}
            required
            disabled={!!initial?.partnerId}
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Partner Name</label>
          <input
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">ID Qualifier</label>
          <select
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
            value={form.idQualifier}
            onChange={(e) => setForm((f) => ({ ...f, idQualifier: e.target.value }))}
          >
            <option value="ZZ">ZZ – Mutually Defined</option>
            <option value="01">01 – DUNS</option>
            <option value="08">08 – EIN</option>
            <option value="12">12 – Phone</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Our Sender ID (max 15)</label>
          <input
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
            value={form.senderId}
            onChange={(e) => setForm((f) => ({ ...f, senderId: e.target.value.slice(0, 15) }))}
            required
          />
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Sender Qualifier</label>
          <select
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
            value={form.senderQualifier}
            onChange={(e) => setForm((f) => ({ ...f, senderQualifier: e.target.value }))}
          >
            <option value="ZZ">ZZ – Mutually Defined</option>
            <option value="01">01 – DUNS</option>
            <option value="08">08 – EIN</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-2">Supported Transaction Sets</label>
        <div className="flex gap-2 flex-wrap">
          {TRANSACTION_SETS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleSet(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                form.supportedSets.includes(s)
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'
              }`}
            >
              {s} – {SET_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="block text-xs text-gray-400 mb-1">Notes</label>
        <textarea
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white h-16 resize-none"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save Partner'}
        </button>
      </div>
    </form>
  );
}

function InboundUploader({ partners }: { partners: TradingPartner[] }) {
  const [partnerId, setPartnerId] = useState('');
  const [rawContent, setRawContent] = useState('');
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerId || !rawContent.trim()) return;
    setProcessing(true);
    setResult(null);
    setError('');
    try {
      const txn = await ediApi.processInbound(partnerId, rawContent.trim());
      setResult(txn);
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e2.response?.data?.message ?? e2.message ?? 'Processing failed');
    } finally {
      setProcessing(false);
    }
  };

  const loadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setRawContent(ev.target?.result as string);
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-4 p-4 bg-gray-800 rounded-xl border border-gray-700">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <Upload className="w-4 h-4 text-indigo-400" /> Process Inbound EDI
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Trading Partner</label>
            <select
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
              value={partnerId}
              onChange={(e) => setPartnerId(e.target.value)}
              required
            >
              <option value="">-- Select --</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.partnerId})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Upload .edi / .txt file</label>
            <input
              type="file"
              accept=".edi,.txt,.x12"
              onChange={loadFile}
              className="text-xs text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:text-xs hover:file:bg-indigo-700"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Raw EDI content</label>
          <textarea
            className="w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-xs text-green-400 font-mono h-32 resize-none"
            value={rawContent}
            onChange={(e) => setRawContent(e.target.value)}
            placeholder="ISA*00*          *00*          *ZZ*PARTNER..."
          />
        </div>
        <button
          type="submit"
          disabled={processing || !partnerId || !rawContent.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {processing ? <Loader className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Process
        </button>
      </form>
      {error && (
        <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-sm text-red-300">{error}</div>
      )}
      {result && (
        <div className="p-4 bg-green-900/20 border border-green-700 rounded-xl">
          <p className="text-xs font-semibold text-green-400 mb-2">Processed successfully</p>
          <pre className="text-xs text-gray-300 overflow-auto max-h-48">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default function EdiPage() {
  const [tab, setTab] = useState<'partners' | 'transactions' | 'inbound'>('partners');
  const [partners, setPartners] = useState<TradingPartner[]>([]);
  const [transactions, setTransactions] = useState<EdiTransaction[]>([]);
  const [txnTotal, setTxnTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [expandedTxn, setExpandedTxn] = useState<string | null>(null);
  const [txnFilter, setTxnFilter] = useState({ tradingPartnerId: '', transactionSet: '', direction: '' });

  const loadPartners = useCallback(async () => {
    setLoading(true);
    try {
      setPartners(await ediApi.listPartners());
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (txnFilter.tradingPartnerId) params.tradingPartnerId = txnFilter.tradingPartnerId;
      if (txnFilter.transactionSet) params.transactionSet = txnFilter.transactionSet;
      if (txnFilter.direction) params.direction = txnFilter.direction;
      const { items, total } = await ediApi.listTransactions(params);
      setTransactions(items);
      setTxnTotal(total);
    } finally {
      setLoading(false);
    }
  }, [txnFilter]);

  useEffect(() => {
    loadPartners();
  }, [loadPartners]);

  useEffect(() => {
    if (tab === 'transactions') loadTransactions();
  }, [tab, loadTransactions]);

  const savePartner = async (data: Omit<TradingPartner, 'id' | 'isActive'>) => {
    await ediApi.createPartner(data);
    setShowForm(false);
    loadPartners();
  };

  const removePartner = async (id: string) => {
    if (!confirm('Delete this trading partner?')) return;
    await ediApi.deletePartner(id);
    loadPartners();
  };

  const toggleActive = async (p: TradingPartner) => {
    await ediApi.updatePartner(p.id, { isActive: !p.isActive });
    loadPartners();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network className="w-6 h-6 text-indigo-400" />
          <div>
            <h1 className="text-xl font-bold text-white">EDI Integration</h1>
            <p className="text-xs text-gray-400">X12 EDI: 850 PO · 855 Ack · 856 ASN · 810 Invoice</p>
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-800 rounded-xl p-1 w-fit">
        {(['partners', 'transactions', 'inbound'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {t === 'partners' ? 'Trading Partners' : t === 'transactions' ? 'Transaction Log' : 'Process Inbound'}
          </button>
        ))}
      </div>

      {/* Trading Partners */}
      {tab === 'partners' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowForm(!showForm)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Partner
            </button>
          </div>

          {showForm && (
            <PartnerForm
              onSave={savePartner}
              onCancel={() => setShowForm(false)}
            />
          )}

          {loading && <div className="text-center text-gray-400 py-8">Loading…</div>}

          {!loading && partners.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Network className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No trading partners configured</p>
            </div>
          )}

          <div className="space-y-3">
            {partners.map((p) => (
              <div key={p.id} className="bg-gray-800 rounded-xl border border-gray-700 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-white">{p.name}</span>
                      <span className="text-xs text-gray-500 font-mono">{p.partnerId}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          p.isActive ? 'bg-green-900/30 text-green-400' : 'bg-gray-700 text-gray-400'
                        }`}
                      >
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 space-x-3">
                      <span>Qualifier: <span className="text-gray-300">{p.idQualifier}</span></span>
                      <span>Our ID: <span className="font-mono text-gray-300">{p.senderId}</span></span>
                    </div>
                    {p.supportedSets.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {p.supportedSets.map((s) => (
                          <span key={s} className="px-2 py-0.5 bg-indigo-900/30 text-indigo-300 text-xs rounded-full">
                            {s} – {SET_LABELS[s] ?? s}
                          </span>
                        ))}
                      </div>
                    )}
                    {p.notes && <p className="text-xs text-gray-500 mt-1">{p.notes}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleActive(p)}
                      className="text-xs px-3 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
                    >
                      {p.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => removePartner(p.id)}
                      className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction Log */}
      {tab === 'transactions' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              value={txnFilter.tradingPartnerId}
              onChange={(e) => setTxnFilter((f) => ({ ...f, tradingPartnerId: e.target.value }))}
            >
              <option value="">All Partners</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              value={txnFilter.transactionSet}
              onChange={(e) => setTxnFilter((f) => ({ ...f, transactionSet: e.target.value }))}
            >
              <option value="">All Sets</option>
              {TRANSACTION_SETS.map((s) => (
                <option key={s} value={s}>{s} – {SET_LABELS[s]}</option>
              ))}
            </select>
            <select
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
              value={txnFilter.direction}
              onChange={(e) => setTxnFilter((f) => ({ ...f, direction: e.target.value }))}
            >
              <option value="">All Directions</option>
              <option value="INBOUND">Inbound</option>
              <option value="OUTBOUND">Outbound</option>
            </select>
            <button
              onClick={loadTransactions}
              className="p-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <span className="text-xs text-gray-500 ml-auto">{txnTotal} total</span>
          </div>

          {loading && <div className="text-center text-gray-400 py-8">Loading…</div>}

          {!loading && transactions.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <Download className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No EDI transactions found</p>
            </div>
          )}

          <div className="space-y-2">
            {transactions.map((t) => {
              const expanded = expandedTxn === t.id;
              const partner = partners.find((p) => p.id === t.tradingPartnerId);
              return (
                <div key={t.id} className="bg-gray-800 rounded-xl border border-gray-700">
                  <button
                    onClick={() => setExpandedTxn(expanded ? null : t.id)}
                    className="w-full flex items-center gap-3 p-4 text-left"
                  >
                    <div
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_STYLES[t.status] ?? 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {STATUS_ICONS[t.status]}
                      {t.status}
                    </div>
                    <span className="font-mono text-sm text-indigo-300">
                      {t.transactionSet} – {SET_LABELS[t.transactionSet] ?? ''}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs ${
                        t.direction === 'INBOUND'
                          ? 'bg-teal-900/30 text-teal-300'
                          : 'bg-orange-900/30 text-orange-300'
                      }`}
                    >
                      {t.direction === 'INBOUND' ? '↓ IN' : '↑ OUT'}
                    </span>
                    <span className="text-sm text-gray-300">{partner?.name ?? t.tradingPartnerId}</span>
                    {t.referenceNumber && (
                      <span className="text-xs text-gray-500">#{t.referenceNumber}</span>
                    )}
                    <span className="ml-auto text-xs text-gray-500">
                      {new Date(t.createdAt).toLocaleString()}
                    </span>
                    {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  </button>
                  {expanded && (
                    <div className="border-t border-gray-700 p-4 space-y-3">
                      {t.errorMessage && (
                        <div className="p-2 bg-red-900/20 border border-red-700 rounded text-xs text-red-300">
                          {t.errorMessage}
                        </div>
                      )}
                      {t.parsedPayload && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 mb-1">Parsed Payload</p>
                          <pre className="text-xs text-gray-300 bg-gray-900 rounded-lg p-3 overflow-auto max-h-48">
                            {JSON.stringify(t.parsedPayload, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Inbound Processing */}
      {tab === 'inbound' && <InboundUploader partners={partners} />}
    </div>
  );
}
