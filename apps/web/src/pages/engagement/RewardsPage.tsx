import { useState, useEffect } from 'react';
import { Plus, X, Gift, Send, BellRing } from 'lucide-react';
import { channelsApi } from '../../api/channels';
import { useAuthStore } from '../../store/authStore';

const unwrap = (res: any) => res.data?.data ?? res.data;
const listOf = (res: any) => {
  const p = unwrap(res);
  return Array.isArray(p) ? p : p?.data ?? [];
};

const STATUS_COLORS: Record<string, string> = {
  REQUESTED: 'bg-amber-100 text-amber-700',
  FULFILLED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  REJECTED: 'bg-red-100 text-red-700',
  SENT: 'bg-green-100 text-green-700',
  SKIPPED: 'bg-gray-100 text-gray-500',
  FAILED: 'bg-red-100 text-red-700',
};

const CHANNELS = ['TEAMS', 'SLACK', 'WEB_PUSH', 'EMAIL'];

function ItemModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', description: '', pointsCost: '100', stock: '' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await channelsApi.createReward({
        name: form.name, description: form.description || undefined,
        pointsCost: Number(form.pointsCost),
        stock: form.stock === '' ? null : Number(form.stock),
      });
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not create reward');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Reward</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Reward name (e.g. Company Mug)"
            value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Description"
            value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">Points cost
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                value={form.pointsCost} onChange={e => setForm(p => ({ ...p, pointsCost: e.target.value }))} />
            </label>
            <label className="text-xs text-gray-500">Stock (blank = unlimited)
              <input type="number" className="w-full border rounded-lg px-3 py-2 text-sm mt-1"
                value={form.stock} onChange={e => setForm(p => ({ ...p, stock: e.target.value }))} />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !form.name.trim() || !(Number(form.pointsCost) > 0)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Create Reward'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RewardsPage() {
  const [tab, setTab] = useState<'store' | 'redemptions' | 'channels'>('store');
  const [items, setItems] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [redemptions, setRedemptions] = useState<any[]>([]);
  const [subs, setSubs] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [showItemModal, setShowItemModal] = useState(false);
  const { user } = useAuthStore();

  const load = async () => {
    const [i, b, r, s, d] = await Promise.all([
      channelsApi.listRewards().catch(() => null),
      channelsApi.balance().catch(() => null),
      channelsApi.listRedemptions().catch(() => null),
      channelsApi.listSubscriptions().catch(() => null),
      channelsApi.listDeliveries().catch(() => null),
    ]);
    if (i) setItems(listOf(i));
    if (b) setBalance(unwrap(b));
    if (r) setRedemptions(listOf(r));
    if (s) setSubs(listOf(s));
    if (d) setDeliveries(listOf(d));
  };

  useEffect(() => { load(); }, []);

  const act = async (fn: () => Promise<any>, label: string) => {
    try {
      await fn();
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || `Could not ${label}`);
    }
  };

  const addSubscription = async () => {
    const channel = prompt(`Channel? (${CHANNELS.join(', ')})`, 'SLACK');
    if (!channel) return;
    const target: Record<string, string> = {};
    if (channel === 'TEAMS' || channel === 'SLACK') {
      const url = prompt('Incoming webhook URL (https)');
      if (!url) return;
      target.webhookUrl = url;
    } else if (channel === 'WEB_PUSH') {
      const endpoint = prompt('Push endpoint');
      if (!endpoint) return;
      target.endpoint = endpoint;
    } else {
      const address = prompt('Email address');
      if (!address) return;
      target.address = address;
    }
    await act(() => channelsApi.subscribe({ channel, target }), 'subscribe');
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Gift className="h-5 w-5 text-pink-500" />Rewards & Channels</h1>
          <p className="text-sm text-gray-500">
            Spend recognition points in the rewards store
            {balance && <> — your balance: <span className="font-semibold text-gray-800">{balance.available}</span> points ({balance.earned} earned − {balance.spent} spent)</>}.
          </p>
        </div>
        <button onClick={() => setShowItemModal(true)} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700">
          <Plus className="h-4 w-4" />New Reward
        </button>
      </div>

      <div className="flex gap-1 border-b">
        {([
          { key: 'store', label: `Store (${items.length})`, icon: <Gift className="h-4 w-4" /> },
          { key: 'redemptions', label: `Redemptions (${redemptions.length})`, icon: <Send className="h-4 w-4" /> },
          { key: 'channels', label: `Notification Channels (${subs.length})`, icon: <BellRing className="h-4 w-4" /> },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm flex items-center gap-1.5 border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-500'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'store' && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.length === 0 && <p className="text-sm text-gray-400 col-span-full">No rewards in the store yet.</p>}
          {items.map(i => (
            <div key={i.id} className="bg-white rounded-xl border p-4 flex flex-col">
              <p className="font-medium text-sm">{i.name}</p>
              {i.description && <p className="text-xs text-gray-500 mt-1">{i.description}</p>}
              <div className="mt-auto pt-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-pink-600">{i.pointsCost} pts</span>
                <span className="text-xs text-gray-400">{i.stock == null ? 'in stock' : `${i.stock} left`}</span>
              </div>
              <button onClick={() => act(() => channelsApi.redeem(i.id), 'redeem')}
                disabled={!i.active || i.stock === 0}
                className="mt-2 px-3 py-1.5 bg-pink-600 text-white rounded-lg text-sm disabled:opacity-40">Redeem</button>
            </div>
          ))}
        </div>
      )}

      {tab === 'redemptions' && (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="p-3">Reward</th><th>Points</th><th>Status</th><th className="text-right pr-3">Actions</th></tr></thead>
            <tbody className="divide-y">
              {redemptions.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-gray-400">No redemptions yet.</td></tr>}
              {redemptions.map(r => (
                <tr key={r.id}>
                  <td className="p-3">{r.itemName ?? r.itemId}</td>
                  <td>{r.pointsSpent}</td>
                  <td><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] ?? ''}`}>{r.status}</span></td>
                  <td className="text-right pr-3 space-x-2">
                    {r.status === 'REQUESTED' && (
                      <>
                        <button onClick={() => act(() => channelsApi.setRedemptionStatus(r.id, { status: 'FULFILLED' }), 'fulfill')} className="text-green-600 text-xs">Fulfill</button>
                        <button onClick={() => act(() => channelsApi.setRedemptionStatus(r.id, { status: 'CANCELLED' }), 'cancel')} className="text-gray-500 text-xs">Cancel</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'channels' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="text-sm font-semibold">My Subscriptions</p>
              <span className="space-x-3">
                <button onClick={addSubscription} className="text-blue-600 text-sm">+ Subscribe</button>
                <button onClick={() => {
                  const title = prompt('Test message title', 'Hello from the ERP');
                  if (title && user?.id) act(() => channelsApi.dispatch({ userId: user.id, title, body: 'Channel test message' }), 'send test');
                }} className="text-blue-600 text-sm">Send test</button>
              </span>
            </div>
            <div className="divide-y">
              {subs.length === 0 && <p className="p-4 text-sm text-gray-400">No channel subscriptions. Teams/Slack deliver via incoming webhooks when the deployment enables them.</p>}
              {subs.map(s => (
                <div key={s.id} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{s.channel}</p>
                    <p className="text-xs text-gray-500 truncate max-w-md">{s.target?.webhookUrl ?? s.target?.endpoint ?? s.target?.address ?? ''}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input type="checkbox" checked={!!s.enabled} onChange={e => act(() => channelsApi.setSubscriptionEnabled(s.id, e.target.checked), 'toggle subscription')} />
                    Enabled
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border overflow-x-auto">
            <p className="px-4 pt-3 pb-1 text-sm font-semibold">Recent deliveries</p>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-gray-500 border-b"><th className="p-3">Title</th><th>Channel</th><th>Status</th><th>Detail</th></tr></thead>
              <tbody className="divide-y">
                {deliveries.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-gray-400">No deliveries yet.</td></tr>}
                {deliveries.slice(0, 20).map(d => (
                  <tr key={d.id}>
                    <td className="p-3">{d.title}</td>
                    <td>{d.channel}</td>
                    <td><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[d.status] ?? ''}`}>{d.status}</span></td>
                    <td className="text-xs text-gray-500">{d.error ?? d.reference ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showItemModal && <ItemModal onClose={() => setShowItemModal(false)} onDone={() => { setShowItemModal(false); load(); }} />}
    </div>
  );
}
