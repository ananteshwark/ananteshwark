import { useState, useEffect } from 'react';
import { talentApi } from '../../api/talent';
import { Target, ChevronDown, ChevronRight } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  ON_TRACK: 'bg-green-100 text-green-700',
  AT_RISK: 'bg-yellow-100 text-yellow-700',
  BEHIND: 'bg-red-100 text-red-700',
  ACHIEVED: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

function ProgressBar({ value }: { value: number }) {
  const color = value >= 100 ? 'bg-blue-500' : value >= 70 ? 'bg-green-500' : value >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="w-full bg-gray-100 rounded-full h-2">
      <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function KeyResultRow({ kr, onUpdate }: { kr: any; onUpdate: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(kr.currentValue));
  const [loading, setLoading] = useState(false);

  const handleUpdate = async () => {
    setLoading(true);
    try {
      await talentApi.updateKrProgress(kr.id, { currentValue: Number(value) });
      setEditing(false);
      onUpdate();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      <div className="flex-1">
        <p className="text-sm font-medium text-gray-800">{kr.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <ProgressBar value={Number(kr.progress)} />
          <span className="text-xs text-gray-500 whitespace-nowrap">{kr.progress}%</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">{kr.currentValue} / {kr.targetValue} {kr.unit || ''}</p>
      </div>
      <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[kr.status] || 'bg-gray-100 text-gray-600'}`}>{kr.status}</span>
      {editing ? (
        <div className="flex items-center gap-1">
          <input type="number" className="w-20 border rounded px-2 py-1 text-xs" value={value} onChange={e => setValue(e.target.value)} />
          <button onClick={handleUpdate} disabled={loading} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">{loading ? '...' : 'Save'}</button>
          <button onClick={() => setEditing(false)} className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:underline whitespace-nowrap">Update</button>
      )}
    </div>
  );
}

function ObjectiveCard({ obj, onRefresh }: { obj: any; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [krs, setKrs] = useState<any[]>([]);

  const loadKrs = async () => {
    const r = await talentApi.getKeyResults(obj.id);
    setKrs(r.data?.data || []);
  };

  const handleExpand = () => {
    if (!expanded) loadKrs();
    setExpanded(!expanded);
  };

  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-gray-900">{obj.title}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[obj.status] || 'bg-gray-100 text-gray-600'}`}>{obj.status}</span>
              <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{obj.ownerType}</span>
            </div>
            <ProgressBar value={Number(obj.progress)} />
            <p className="text-xs text-gray-500 mt-1">{obj.progress}% complete</p>
          </div>
          <button onClick={handleExpand} className="ml-4 text-gray-400 hover:text-gray-600">
            {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {expanded && (
        <div className="border-t p-4 space-y-2 bg-gray-50">
          <h4 className="text-xs font-semibold text-gray-600 uppercase">Key Results</h4>
          {krs.length === 0 ? <p className="text-sm text-gray-500">No key results yet.</p> : krs.map(kr => (
            <KeyResultRow key={kr.id} kr={kr} onUpdate={() => { loadKrs(); onRefresh(); }} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function GoalsPage() {
  const [cycles, setCycles] = useState<any[]>([]);
  const [selectedCycle, setSelectedCycle] = useState('');
  const [objectives, setObjectives] = useState<any[]>([]);
  const [dashboard, setDashboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadCycles = async () => {
    const r = await talentApi.getOkrCycles();
    const list = r.data?.data || [];
    setCycles(list);
    if (list.length > 0) setSelectedCycle(list[0].id);
    setLoading(false);
  };

  const loadObjectives = async () => {
    if (!selectedCycle) return;
    const [objR, dashR] = await Promise.all([
      talentApi.getObjectives({ cycleId: selectedCycle, limit: 50 }),
      talentApi.getCycleDashboard(selectedCycle),
    ]);
    setObjectives(objR.data?.data || []);
    setDashboard(dashR.data?.data ?? dashR.data);
  };

  useEffect(() => { loadCycles(); }, []);
  useEffect(() => { if (selectedCycle) loadObjectives(); }, [selectedCycle]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">OKRs & Goals</h1>
          <p className="text-sm text-gray-500 mt-1">Track objectives and key results</p>
        </div>
        <select className="border rounded-lg px-3 py-2 text-sm" value={selectedCycle} onChange={e => setSelectedCycle(e.target.value)}>
          <option value="">Select Cycle</option>
          {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Objectives', value: dashboard.totalObjectives, color: 'text-blue-600' },
            { label: 'Achieved', value: dashboard.achieved, color: 'text-green-600' },
            { label: 'On Track', value: dashboard.onTrack, color: 'text-teal-600' },
            { label: 'Avg Progress', value: `${dashboard.avgProgress}%`, color: 'text-purple-600' },
          ].map(stat => (
            <div key={stat.label} className="bg-white border rounded-xl p-4">
              <p className="text-xs text-gray-500">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? <div className="text-center text-gray-500 py-8">Loading...</div> : !selectedCycle ? (
        <div className="text-center text-gray-500 py-12">
          <Target className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>Select a cycle to view objectives</p>
        </div>
      ) : objectives.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <Target className="h-12 w-12 mx-auto mb-3 text-gray-300" />
          <p>No objectives found for this cycle.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {objectives.map(obj => (
            <ObjectiveCard key={obj.id} obj={obj} onRefresh={loadObjectives} />
          ))}
        </div>
      )}
    </div>
  );
}
