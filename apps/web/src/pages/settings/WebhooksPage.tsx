import { useState, useEffect } from 'react';
import {
  Webhook,
  Plus,
  RefreshCw,
  Play,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Copy,
  Pencil,
} from 'lucide-react';
import { webhooksApi } from '../../api/webhooks';

const unwrapList = (res: any) => {
  const d = res.data?.data ?? res.data;
  return Array.isArray(d) ? d : d?.items ?? [];
};
const unwrap = (res: any) => res.data?.data ?? res.data;

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  SUCCESS: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
  RETRYING: 'bg-blue-100 text-blue-700',
};

const StatusIcon = ({ status }: { status: string }) => {
  if (status === 'SUCCESS') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === 'FAILED') return <XCircle className="w-4 h-4 text-red-500" />;
  if (status === 'RETRYING') return <RotateCcw className="w-4 h-4 text-blue-500" />;
  return <Clock className="w-4 h-4 text-yellow-500" />;
};

type Tab = 'subscriptions' | 'deliveries';

export default function WebhooksPage() {
  const [tab, setTab] = useState<Tab>('subscriptions');
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [expandedDelivery, setExpandedDelivery] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    targetUrl: '',
    selectedEvents: [] as string[],
    maxRetries: 3,
  });

  const load = async () => {
    setLoading(true);
    try {
      const [subRes, evRes] = await Promise.all([
        webhooksApi.listSubscriptions(),
        webhooksApi.listEventTypes(),
      ]);
      setSubscriptions(unwrapList(subRes));
      const evList = evRes.data?.data ?? evRes.data;
      setEventTypes(Array.isArray(evList) ? evList : []);
    } finally {
      setLoading(false);
    }
  };

  const loadDeliveries = async (subId?: string) => {
    const res = await webhooksApi.listDeliveries(subId);
    setDeliveries(unwrapList(res));
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (tab === 'deliveries') loadDeliveries(selectedSubId ?? undefined);
  }, [tab, selectedSubId]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', targetUrl: '', selectedEvents: [], maxRetries: 3 });
    setShowForm(true);
  };

  const startEdit = (sub: any) => {
    setEditingId(sub.id);
    setForm({
      name: sub.name ?? '',
      targetUrl: sub.targetUrl ?? '',
      selectedEvents: sub.eventTypes ?? [],
      maxRetries: sub.maxRetries ?? 3,
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ name: '', targetUrl: '', selectedEvents: [], maxRetries: 3 });
  };

  const submitSub = async () => {
    if (!form.name || !form.targetUrl || !form.selectedEvents.length) return;
    const payload = {
      name: form.name,
      targetUrl: form.targetUrl,
      eventTypes: form.selectedEvents,
      maxRetries: form.maxRetries,
    };
    if (editingId) {
      await webhooksApi.updateSubscription(editingId, payload);
    } else {
      await webhooksApi.createSubscription(payload);
    }
    closeForm();
    load();
  };

  const rotateSecret = async (id: string) => {
    await webhooksApi.rotateSecret(id);
    load();
  };

  const testSub = async (id: string) => {
    await webhooksApi.testSubscription(id);
    setTab('deliveries');
    setSelectedSubId(id);
  };

  const deleteSub = async (id: string) => {
    if (!confirm('Delete this webhook and all its delivery history?')) return;
    await webhooksApi.deleteSubscription(id);
    load();
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleEvent = (evt: string) => {
    setForm((prev) => ({
      ...prev,
      selectedEvents: prev.selectedEvents.includes(evt)
        ? prev.selectedEvents.filter((e) => e !== evt)
        : [...prev.selectedEvents, evt],
    }));
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'subscriptions', label: 'Subscriptions' },
    { key: 'deliveries', label: 'Delivery Log' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Webhook className="w-7 h-7 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
            <p className="text-sm text-gray-500">Push event notifications to external systems</p>
          </div>
        </div>
        {tab === 'subscriptions' && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
          >
            <Plus className="w-4 h-4" /> New Webhook
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 flex gap-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Subscriptions ────────────────────────────────────────────────── */}
      {tab === 'subscriptions' && (
        <div className="space-y-4">
          {showForm && (
            <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-800">{editingId ? 'Edit Webhook Subscription' : 'New Webhook Subscription'}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Name *</label>
                  <input
                    className="border rounded-lg px-3 py-2 text-sm w-full"
                    value={form.name}
                    placeholder="My Integration"
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Target URL *</label>
                  <input
                    className="border rounded-lg px-3 py-2 text-sm w-full font-mono"
                    value={form.targetUrl}
                    placeholder="https://example.com/webhook"
                    onChange={(e) => setForm({ ...form, targetUrl: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Max Retries</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    className="border rounded-lg px-3 py-2 text-sm w-full"
                    value={form.maxRetries}
                    onChange={(e) => setForm({ ...form, maxRetries: parseInt(e.target.value) || 3 })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Event Types *</label>
                <div className="flex flex-wrap gap-2">
                  {eventTypes.map((evt) => (
                    <button
                      key={evt}
                      onClick={() => toggleEvent(evt)}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        form.selectedEvents.includes(evt)
                          ? 'bg-indigo-100 border-indigo-400 text-indigo-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-indigo-300'
                      }`}
                    >
                      {evt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={closeForm}
                  className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submitSub}
                  disabled={!form.name || !form.targetUrl || !form.selectedEvents.length}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {editingId ? 'Save Changes' : 'Create Webhook'}
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="text-center py-8 text-gray-400">Loading…</div>
          ) : (
            <div className="space-y-3">
              {subscriptions.map((sub) => (
                <div key={sub.id} className="bg-white border rounded-xl p-5 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-gray-900">{sub.name}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            sub.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {sub.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <p className="text-xs font-mono text-gray-500 mt-0.5">{sub.targetUrl}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => testSub(sub.id)}
                        title="Send test event"
                        className="p-1.5 text-gray-400 hover:text-green-600 rounded hover:bg-green-50"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => startEdit(sub)}
                        title="Edit"
                        className="p-1.5 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => rotateSecret(sub.id)}
                        title="Rotate secret"
                        className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteSub(sub.id)}
                        title="Delete"
                        className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Secret */}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-gray-500 w-12 shrink-0">Secret:</span>
                    <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                      {showSecret[sub.id] ? sub.secret : '••••••••••••••••••••••••'}
                    </code>
                    <button
                      onClick={() =>
                        setShowSecret((p) => ({ ...p, [sub.id]: !p[sub.id] }))
                      }
                      className="p-1 text-gray-400 hover:text-gray-600 rounded"
                    >
                      {showSecret[sub.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    </button>
                    {showSecret[sub.id] && (
                      <button
                        onClick={() => copyToClipboard(sub.secret, sub.id)}
                        className="p-1 text-gray-400 hover:text-gray-600 rounded"
                        title="Copy"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                    {copiedId === sub.id && (
                      <span className="text-xs text-green-600">Copied!</span>
                    )}
                  </div>

                  {/* Event types */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(sub.eventTypes ?? []).map((evt: string) => (
                      <span
                        key={evt}
                        className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full"
                      >
                        {evt}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              {!subscriptions.length && !showForm && (
                <div className="text-center py-12 text-gray-400">
                  No webhooks configured. Click "New Webhook" to add one.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Delivery Log ─────────────────────────────────────────────────── */}
      {tab === 'deliveries' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={selectedSubId ?? ''}
              onChange={(e) => setSelectedSubId(e.target.value || null)}
            >
              <option value="">All subscriptions</option>
              {subscriptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button
              onClick={() => loadDeliveries(selectedSubId ?? undefined)}
              className="flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>

          <div className="space-y-2">
            {deliveries.map((d) => (
              <div key={d.id} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                <button
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
                  onClick={() => setExpandedDelivery(expandedDelivery === d.id ? null : d.id)}
                >
                  <div className="flex items-center gap-3">
                    <StatusIcon status={d.status} />
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-900">{d.eventType}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(d.createdAt).toLocaleString()} · attempt {d.attemptCount}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[d.status] ?? ''}`}>
                      {d.status}
                    </span>
                    {d.httpStatus && (
                      <span className="text-xs text-gray-500">HTTP {d.httpStatus}</span>
                    )}
                    {expandedDelivery === d.id
                      ? <ChevronDown className="w-4 h-4 text-gray-400" />
                      : <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>
                {expandedDelivery === d.id && (
                  <div className="border-t p-4 bg-gray-50 space-y-3">
                    {d.errorMessage && (
                      <div className="bg-red-50 border border-red-200 rounded p-3">
                        <p className="text-xs text-red-600 font-medium mb-1">Error</p>
                        <p className="text-xs text-red-700 font-mono">{d.errorMessage}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Payload</p>
                      <pre className="text-xs font-mono bg-white border rounded p-3 overflow-auto max-h-40">
                        {JSON.stringify(d.payload, null, 2)}
                      </pre>
                    </div>
                    {d.responseBody && (
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Response</p>
                        <pre className="text-xs font-mono bg-white border rounded p-3 overflow-auto max-h-24">
                          {d.responseBody}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {!deliveries.length && (
              <div className="text-center py-10 text-gray-400">No delivery records found.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
