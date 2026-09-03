import { useState, useEffect } from 'react';
import { Award, Plus, Trophy, X } from 'lucide-react';
import { engagementApi } from '../../api/engagement';
import { hrApi } from '../../api/hr';

function GiveModal({ badges, onClose, onDone }: { badges: any[]; onClose: () => void; onDone: () => void }) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [form, setForm] = useState({ badgeId: badges[0]?.id ?? '', toEmployeeId: '', message: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    hrApi.getEmployees({ page: 1, limit: 200 }).then((r: any) =>
      setEmployees(r.data?.items || r.data?.data || []));
  }, []);

  const save = async () => {
    const emp = employees.find(e => e.id === form.toEmployeeId);
    if (!emp || !form.badgeId || !form.message.trim()) return;
    setSaving(true);
    try {
      await engagementApi.giveRecognition({
        badgeId: form.badgeId,
        toEmployeeId: emp.id,
        toName: `${emp.firstName} ${emp.lastName}`.trim(),
        message: form.message,
      });
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not give recognition');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Give Recognition</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Badge</label>
            <div className="grid grid-cols-2 gap-2">
              {badges.map(b => (
                <button key={b.id} onClick={() => setForm(p => ({ ...p, badgeId: b.id }))}
                  className={`border rounded-lg px-3 py-2 text-sm text-left ${form.badgeId === b.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'}`}>
                  <span className="mr-1">{b.icon}</span>{b.name}
                  {b.points > 0 && <span className="text-xs text-amber-600 ml-1">+{b.points}</span>}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.toEmployeeId}
              onChange={e => setForm(p => ({ ...p, toEmployeeId: e.target.value }))}>
              <option value="">Select employee…</option>
              {employees.map(e => (
                <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Message</label>
            <textarea rows={3} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.message}
              placeholder="What did they do that was great?"
              onChange={e => setForm(p => ({ ...p, message: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !form.toEmployeeId || !form.message.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Sending…' : 'Recognize'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RecognitionPage() {
  const [wall, setWall] = useState<any[]>([]);
  const [badges, setBadges] = useState<any[]>([]);
  const [board, setBoard] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGive, setShowGive] = useState(false);
  const [newBadge, setNewBadge] = useState({ name: '', icon: '🏅', points: '10' });
  const [canManage, setCanManage] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      engagementApi.getWall(1, 30),
      engagementApi.getBadges(true),
      engagementApi.getLeaderboard(),
    ]).then(([w, b, l]) => {
      setWall(w.data?.items || []);
      setBadges(b.data || []);
      setBoard(l.data || []);
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const addBadge = async () => {
    if (!newBadge.name.trim()) return;
    try {
      await engagementApi.createBadge({ name: newBadge.name, icon: newBadge.icon || '🏅', points: parseInt(newBadge.points) || 0 });
      setNewBadge({ name: '', icon: '🏅', points: '10' });
      load();
    } catch {
      setCanManage(false);
      alert('You do not have permission to manage badges.');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rewards & Recognition</h1>
          <p className="text-sm text-gray-500 mt-0.5">Celebrate wins with badges, points, and a live leaderboard</p>
        </div>
        <button onClick={() => setShowGive(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Award className="h-4 w-4" /> Give Recognition
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Recognition Wall</h2>
          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading…</div>
          ) : wall.length === 0 ? (
            <div className="p-8 text-center text-gray-400 bg-white rounded-xl border">No recognitions yet — be the first!</div>
          ) : wall.map(r => (
            <div key={r.id} className="bg-white rounded-xl border p-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{r.badgeIcon}</span>
                <div>
                  <p className="text-sm">
                    <span className="font-medium">{r.fromName}</span> recognized{' '}
                    <span className="font-medium">{r.toName}</span> with{' '}
                    <span className="font-medium text-amber-700">{r.badgeName}</span>
                    {r.points > 0 && <span className="text-xs text-amber-600 ml-1">+{r.points} pts</span>}
                  </p>
                  <p className="text-xs text-gray-400">{new Date(r.createdAt).toLocaleString()}</p>
                </div>
              </div>
              <p className="text-sm text-gray-700 mt-2 italic">“{r.message}”</p>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border p-4">
            <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
              <Trophy className="h-4 w-4 text-amber-500" /> Leaderboard
            </h2>
            {board.length === 0 ? (
              <p className="text-xs text-gray-400">No points earned yet.</p>
            ) : (
              <ol className="space-y-2">
                {board.map((e, i) => (
                  <li key={e.employeeId} className="flex items-center justify-between text-sm">
                    <span><span className="text-gray-400 mr-2">{i + 1}.</span>{e.name}</span>
                    <span className="font-semibold text-amber-700">{e.points} pts</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {canManage && (
            <div className="bg-white rounded-xl border p-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Badge Catalog</h2>
              <div className="space-y-1.5 mb-3">
                {badges.map(b => (
                  <div key={b.id} className="flex items-center justify-between text-sm">
                    <span>{b.icon} {b.name}</span>
                    <span className="text-xs text-amber-600">+{b.points}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input value={newBadge.icon} onChange={e => setNewBadge(p => ({ ...p, icon: e.target.value }))}
                  className="w-12 border rounded-lg px-2 py-1.5 text-sm text-center" />
                <input value={newBadge.name} onChange={e => setNewBadge(p => ({ ...p, name: e.target.value }))}
                  placeholder="Badge name" className="flex-1 border rounded-lg px-2 py-1.5 text-sm" />
                <input value={newBadge.points} onChange={e => setNewBadge(p => ({ ...p, points: e.target.value }))}
                  className="w-14 border rounded-lg px-2 py-1.5 text-sm" />
                <button onClick={addBadge} className="px-2 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showGive && (
        <GiveModal badges={badges} onClose={() => setShowGive(false)}
          onDone={() => { setShowGive(false); load(); }} />
      )}
    </div>
  );
}
