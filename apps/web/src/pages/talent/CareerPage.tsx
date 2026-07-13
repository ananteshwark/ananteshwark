import { useState, useEffect } from 'react';
import { Plus, X, GitBranch, Grid3X3, Users, Lock } from 'lucide-react';
import { careerApi } from '../../api/career';

const unwrap = (res: any) => res.data?.data ?? res.data;
const listOf = (res: any) => {
  const p = unwrap(res);
  return Array.isArray(p) ? p : p?.data ?? [];
};

const RATINGS = ['LOW', 'MEDIUM', 'HIGH'];

// 9-box layout: rows are potential (high → low), columns performance (low → high).
const BOX_GRID = [
  [3, 6, 9],
  [2, 5, 8],
  [1, 4, 7],
];

function PlacementModal({ review, onClose, onDone }: { review: any; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ employeeId: '', employeeName: '', performance: 'MEDIUM', potential: 'MEDIUM' });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await careerApi.placeEmployee(review.id, form);
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not place employee');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Place on the Grid — {review.name}</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Employee ID"
            value={form.employeeId} onChange={e => setForm(p => ({ ...p, employeeId: e.target.value }))} />
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Employee name"
            value={form.employeeName} onChange={e => setForm(p => ({ ...p, employeeName: e.target.value }))} />
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-gray-500">Performance
              <select className="w-full border rounded-lg px-3 py-2 text-sm mt-1" value={form.performance}
                onChange={e => setForm(p => ({ ...p, performance: e.target.value }))}>
                {RATINGS.map(r => <option key={r}>{r}</option>)}
              </select>
            </label>
            <label className="text-xs text-gray-500">Potential
              <select className="w-full border rounded-lg px-3 py-2 text-sm mt-1" value={form.potential}
                onChange={e => setForm(p => ({ ...p, potential: e.target.value }))}>
                {RATINGS.map(r => <option key={r}>{r}</option>)}
              </select>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !form.employeeId.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Placing…' : 'Place'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CareerPage() {
  const [tab, setTab] = useState<'architecture' | 'pools' | 'reviews'>('reviews');
  const [families, setFamilies] = useState<any[]>([]);
  const [ladders, setLadders] = useState<any[]>([]);
  const [pools, setPools] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [review, setReview] = useState<any>(null);
  const [placements, setPlacements] = useState<any[]>([]);
  const [placeModal, setPlaceModal] = useState(false);

  const load = async () => {
    const [f, l, p, r] = await Promise.all([
      careerApi.listFamilies().catch(() => null),
      careerApi.listLadders().catch(() => null),
      careerApi.listPools().catch(() => null),
      careerApi.listReviews().catch(() => null),
    ]);
    if (f) setFamilies(listOf(f));
    if (l) setLadders(listOf(l));
    if (p) setPools(listOf(p));
    if (r) setReviews(listOf(r));
  };

  useEffect(() => { load(); }, []);

  const openReview = async (r: any) => {
    setReview(r);
    const pl = await careerApi.listPlacements(r.id).catch(() => null);
    setPlacements(pl ? listOf(pl) : []);
  };

  const act = async (fn: () => Promise<any>, label: string) => {
    try {
      await fn();
      await load();
      if (review) {
        const fresh = (listOf(await careerApi.listReviews()) as any[]).find(x => x.id === review.id);
        if (fresh) await openReview(fresh);
      }
    } catch (e: any) {
      alert(e?.response?.data?.message || `Could not ${label}`);
    }
  };

  const addFamily = async () => {
    const name = prompt('Job family name (e.g. Engineering)');
    if (name?.trim()) await act(() => careerApi.createFamily({ name }), 'create family');
  };

  const addLadder = async () => {
    if (!families.length) { alert('Create a job family first'); return; }
    const name = prompt('Ladder name (e.g. Software Engineer IC track)');
    if (!name?.trim()) return;
    const famName = prompt(`Job family? (${families.map(f => f.name).join(', ')})`, families[0].name);
    const family = families.find(f => f.name === famName) ?? families[0];
    await act(() => careerApi.createLadder({ jobFamilyId: family.id, name }), 'create ladder');
  };

  const addPool = async () => {
    const name = prompt('Talent pool name (e.g. HiPo 2027)');
    if (name?.trim()) await act(() => careerApi.createPool({ name }), 'create pool');
  };

  const addReview = async () => {
    const name = prompt('Talent review name (e.g. FY27 Leadership Review)');
    if (name?.trim()) await act(() => careerApi.createReview({ name }), 'create review');
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Career Architecture & Talent Reviews</h1>
        <p className="text-sm text-gray-500">Job families and ladders, talent pools, and 9-box calibration reviews.</p>
      </div>

      <div className="flex gap-1 border-b">
        {([
          { key: 'reviews', label: '9-Box Reviews', icon: <Grid3X3 className="h-4 w-4" /> },
          { key: 'architecture', label: 'Families & Ladders', icon: <GitBranch className="h-4 w-4" /> },
          { key: 'pools', label: 'Talent Pools', icon: <Users className="h-4 w-4" /> },
        ] as const).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm flex items-center gap-1.5 border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600 font-medium' : 'border-transparent text-gray-500'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {tab === 'architecture' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-xl border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="text-sm font-semibold">Job Families</p>
              <button onClick={addFamily} className="text-blue-600 text-sm flex items-center gap-1"><Plus className="h-4 w-4" />Add</button>
            </div>
            <div className="divide-y">
              {families.length === 0 && <p className="p-4 text-sm text-gray-400">No job families yet.</p>}
              {families.map(f => <div key={f.id} className="p-3 text-sm">{f.name}</div>)}
            </div>
          </div>
          <div className="bg-white rounded-xl border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="text-sm font-semibold">Career Ladders</p>
              <button onClick={addLadder} className="text-blue-600 text-sm flex items-center gap-1"><Plus className="h-4 w-4" />Add</button>
            </div>
            <div className="divide-y">
              {ladders.length === 0 && <p className="p-4 text-sm text-gray-400">No ladders yet.</p>}
              {ladders.map(l => (
                <div key={l.id} className="p-3">
                  <p className="text-sm font-medium">{l.name} <span className="text-xs text-gray-400">({l.track})</span></p>
                  <p className="text-xs text-gray-500 mt-0.5">{(l.rungs ?? []).map((r: any) => `L${r.level} ${r.title}`).join(' → ') || 'no rungs defined'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'pools' && (
        <div className="bg-white rounded-xl border">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <p className="text-sm font-semibold">Talent Pools</p>
            <button onClick={addPool} className="text-blue-600 text-sm flex items-center gap-1"><Plus className="h-4 w-4" />Add</button>
          </div>
          <div className="divide-y">
            {pools.length === 0 && <p className="p-4 text-sm text-gray-400">No talent pools yet.</p>}
            {pools.map(p => (
              <div key={p.id} className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{p.name} <span className="text-xs bg-gray-100 rounded-full px-2 py-0.5 ml-1">{p.type}</span></p>
                  {p.description && <p className="text-xs text-gray-500">{p.description}</p>}
                </div>
                <button onClick={() => {
                  const employeeId = prompt('Employee ID to nominate');
                  if (!employeeId) return;
                  const employeeName = prompt('Employee name') ?? employeeId;
                  act(() => careerApi.addPoolMember(p.id, { employeeId, employeeName }), 'nominate member');
                }} className="text-blue-600 text-xs">Nominate</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'reviews' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="text-sm font-semibold">Reviews</p>
              <button onClick={addReview} className="text-blue-600 text-sm flex items-center gap-1"><Plus className="h-4 w-4" />Add</button>
            </div>
            <div className="divide-y">
              {reviews.length === 0 && <p className="p-4 text-sm text-gray-400">No reviews yet.</p>}
              {reviews.map(r => (
                <button key={r.id} onClick={() => openReview(r)}
                  className={`w-full text-left p-3 hover:bg-gray-50 ${review?.id === r.id ? 'bg-blue-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{r.name}</span>
                    <span className="text-xs bg-gray-100 rounded-full px-2 py-0.5">{r.status}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-4">
            {!review && <div className="bg-white rounded-xl border p-8 text-center text-sm text-gray-400">Select a review to see its 9-box grid.</div>}
            {review && (
              <>
                <div className="bg-white rounded-xl border p-4 flex flex-wrap items-center gap-2">
                  <button onClick={() => setPlaceModal(true)} disabled={review.status === 'FINALIZED'}
                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-40">Place Employee</button>
                  <button onClick={() => act(() => careerApi.startCalibration(review.id), 'start calibration')} disabled={review.status !== 'DRAFT'}
                    className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40">Start Calibration</button>
                  <button onClick={() => act(() => careerApi.finalize(review.id), 'finalize')} disabled={review.status === 'FINALIZED'}
                    className="px-3 py-1.5 border rounded-lg text-sm disabled:opacity-40 flex items-center gap-1"><Lock className="h-3.5 w-3.5" />Finalize</button>
                  <span className="text-xs text-gray-400 ml-auto">Finalizing flows top-box talent into the linked HiPo pool.</span>
                </div>

                <div className="bg-white rounded-xl border p-4">
                  <div className="grid grid-cols-3 gap-2">
                    {BOX_GRID.flat().map(box => {
                      const inBox = placements.filter(p => p.box === box);
                      return (
                        <div key={box} className={`rounded-lg border p-2 min-h-24 ${box >= 8 ? 'bg-green-50 border-green-200' : box <= 2 ? 'bg-red-50 border-red-200' : 'bg-gray-50'}`}>
                          <p className="text-[10px] font-semibold text-gray-500 uppercase">{inBox[0]?.boxLabel ?? `Box ${box}`}</p>
                          {inBox.map(p => <p key={p.id} className="text-xs mt-1 truncate">{p.employeeName ?? p.employeeId}</p>)}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
                    <span>← Performance low</span><span>Performance high →</span>
                  </div>
                  <p className="text-[10px] text-gray-400 px-1">Rows top→bottom: potential high → low</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {placeModal && review && (
        <PlacementModal review={review} onClose={() => setPlaceModal(false)} onDone={async () => { setPlaceModal(false); await openReview(review); }} />
      )}
    </div>
  );
}
