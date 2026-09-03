import { useState, useEffect } from 'react';
import { Plus, X, Map, Play, CheckCircle2, SkipForward, Ban } from 'lucide-react';
import { journeysApi } from '../../api/journeys';

const unwrap = (res: any) => res.data?.data ?? res.data;
const listOf = (res: any) => {
  const p = unwrap(res);
  return Array.isArray(p) ? p : p?.data ?? [];
};

const TRIGGERS = ['ONBOARDING', 'OFFBOARDING', 'PROMOTION', 'RELOCATION', 'LEAVE_RETURN', 'ROLE_CHANGE', 'PROBATION_END', 'CUSTOM'];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  PENDING: 'bg-gray-100 text-gray-600',
  DONE: 'bg-green-100 text-green-700',
  SKIPPED: 'bg-amber-100 text-amber-700',
};

function TemplateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [triggerEvent, setTriggerEvent] = useState('ONBOARDING');
  const [steps, setSteps] = useState([{ key: 'welcome', title: 'Welcome & introductions', offsetDays: 0, ownerRole: 'MANAGER', mandatory: true }]);
  const [saving, setSaving] = useState(false);

  const setStep = (i: number, patch: any) => setSteps(prev => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const save = async () => {
    setSaving(true);
    try {
      await journeysApi.createTemplate({ name, triggerEvent, steps });
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not create template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">New Journey Template</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Template name" value={name} onChange={e => setName(e.target.value)} />
          <select className="border rounded-lg px-3 py-2 text-sm" value={triggerEvent} onChange={e => setTriggerEvent(e.target.value)}>
            {TRIGGERS.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
        </div>
        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Steps (offset in days from the anchor date)</p>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <input className="col-span-2 border rounded px-2 py-1.5 text-sm" placeholder="key" value={s.key} onChange={e => setStep(i, { key: e.target.value })} />
              <input className="col-span-5 border rounded px-2 py-1.5 text-sm" placeholder="Step title" value={s.title} onChange={e => setStep(i, { title: e.target.value })} />
              <input type="number" className="col-span-2 border rounded px-2 py-1.5 text-sm" placeholder="offset" value={s.offsetDays} onChange={e => setStep(i, { offsetDays: Number(e.target.value) })} />
              <input className="col-span-2 border rounded px-2 py-1.5 text-sm" placeholder="owner role" value={s.ownerRole} onChange={e => setStep(i, { ownerRole: e.target.value })} />
              <button className="col-span-1 text-red-400" onClick={() => setSteps(prev => prev.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <button onClick={() => setSteps(prev => [...prev, { key: `step${prev.length + 1}`, title: '', offsetDays: 0, ownerRole: 'HR', mandatory: true }])}
          className="mt-2 text-sm text-blue-600">+ Add step</button>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !name.trim() || steps.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Create Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function JourneysPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [instances, setInstances] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    const [tpls, insts] = await Promise.all([
      journeysApi.listTemplates().catch(() => null),
      journeysApi.listInstances().catch(() => null),
    ]);
    if (tpls) setTemplates(listOf(tpls));
    if (insts) setInstances(listOf(insts));
  };

  useEffect(() => { load(); }, []);

  const openInstance = async (id: string) => {
    const res = await journeysApi.getInstance(id);
    setSelected(unwrap(res));
  };

  const act = async (fn: () => Promise<any>, label: string) => {
    try {
      await fn();
      await load();
      if (selected) await openInstance(selected.instance?.id ?? selected.id);
    } catch (e: any) {
      alert(e?.response?.data?.message || `Could not ${label}`);
    }
  };

  const triggerManually = async (tpl: any) => {
    const employeeId = prompt('Employee ID');
    if (!employeeId) return;
    const employeeName = prompt('Employee name') ?? employeeId;
    const anchorDate = prompt('Anchor date (YYYY-MM-DD)', new Date().toISOString().slice(0, 10));
    if (!anchorDate) return;
    await act(() => journeysApi.triggerTemplate(tpl.id, { employeeId, employeeName, anchorDate }), 'trigger journey');
  };

  const inst = selected?.instance ?? selected;
  const steps = selected?.steps ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><Map className="h-5 w-5" />Employee Journeys</h1>
          <p className="text-sm text-gray-500">Event-triggered step plans for onboarding, offboarding, promotions and more. Journeys fire automatically from HR events.</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700">
          <Plus className="h-4 w-4" />New Template
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="space-y-4">
          <div className="bg-white rounded-xl border">
            <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase">Templates</p>
            <div className="divide-y">
              {templates.length === 0 && <p className="p-4 text-sm text-gray-400">No templates yet.</p>}
              {templates.map(t => (
                <div key={t.id} className="p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.triggerEvent} · {(t.steps ?? []).length} steps</p>
                  </div>
                  <button onClick={() => triggerManually(t)} title="Trigger manually" className="text-blue-600"><Play className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border">
            <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase">Running instances</p>
            <div className="divide-y max-h-[45vh] overflow-y-auto">
              {instances.length === 0 && <p className="p-4 text-sm text-gray-400">No journeys in flight.</p>}
              {instances.map(i => (
                <button key={i.id} onClick={() => openInstance(i.id)}
                  className={`w-full text-left p-3 hover:bg-gray-50 ${inst?.id === i.id ? 'bg-blue-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{i.employeeName ?? i.employeeId}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[i.status] ?? ''}`}>{i.status}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{i.name} · anchored {i.anchorDate}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-white rounded-xl border p-6">
          {!selected && <p className="text-sm text-gray-400 text-center py-16">Select a journey instance to see its steps.</p>}
          {selected && (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{inst.name} — {inst.employeeName ?? inst.employeeId}</h2>
                  <p className="text-xs text-gray-500 mt-1">{inst.triggerEvent} · anchored {inst.anchorDate} · {inst.status}</p>
                </div>
                {inst.status === 'ACTIVE' && (
                  <button onClick={() => act(() => journeysApi.cancelInstance(inst.id), 'cancel journey')}
                    className="px-3 py-1.5 border rounded-lg text-sm text-red-600 flex items-center gap-1"><Ban className="h-3.5 w-3.5" />Cancel</button>
                )}
              </div>
              <ol className="mt-4 space-y-2">
                {steps.map((s: any) => (
                  <li key={s.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div>
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="text-xs text-gray-500">due {s.dueDate} · owner {s.ownerRole ?? '—'} · {s.mandatory ? 'mandatory' : 'optional'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[s.status] ?? ''}`}>{s.status}</span>
                      {s.status === 'PENDING' && (
                        <>
                          <button onClick={() => act(() => journeysApi.completeStep(s.id), 'complete step')} title="Complete" className="text-green-600"><CheckCircle2 className="h-4 w-4" /></button>
                          <button onClick={() => act(() => journeysApi.skipStep(s.id), 'skip step')} title="Skip" className="text-amber-500"><SkipForward className="h-4 w-4" /></button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      </div>

      {showModal && <TemplateModal onClose={() => setShowModal(false)} onDone={() => { setShowModal(false); load(); }} />}
    </div>
  );
}
