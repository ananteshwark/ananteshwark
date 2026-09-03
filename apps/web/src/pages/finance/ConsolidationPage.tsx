import { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Building2,
} from 'lucide-react';
import { consolidationApi } from '../../api/consolidation';
import { hrApi } from '../../api/hr';

const unwrapList = (res: any) => {
  const d = res.data?.data ?? res.data;
  return Array.isArray(d) ? d : d?.items ?? [];
};
const unwrap = (res: any) => res.data?.data ?? res.data;
const fmt = (v: any) =>
  Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Tab = 'groups' | 'run' | 'history';

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  RUNNING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-700',
};

const StatusIcon = ({ status }: { status: string }) => {
  if (status === 'COMPLETED') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
  if (status === 'FAILED') return <XCircle className="w-4 h-4 text-red-500" />;
  return <Clock className="w-4 h-4 text-yellow-500" />;
};

export default function ConsolidationPage() {
  const [tab, setTab] = useState<Tab>('groups');
  const [groups, setGroups] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRun, setSelectedRun] = useState<any | null>(null);
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  // Group form
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState({
    code: '',
    name: '',
    reportingCurrency: 'USD',
    memberEntityIds: [] as string[],
  });

  // Run form
  const [runForm, setRunForm] = useState({
    groupId: '',
    periodStart: '',
    periodEnd: '',
  });

  const load = async () => {
    setLoading(true);
    try {
      const [gRes, rRes, eRes] = await Promise.all([
        consolidationApi.listGroups(),
        consolidationApi.listRuns(),
        hrApi.getLegalEntities(),
      ]);
      setGroups(unwrapList(gRes));
      setRuns(unwrapList(rRes));
      setEntities(unwrapList(eRes));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const resetGroupForm = () => {
    setEditingGroupId(null);
    setGroupForm({ code: '', name: '', reportingCurrency: 'USD', memberEntityIds: [] });
  };

  const startEditGroup = (g: any) => {
    setEditingGroupId(g.id);
    setGroupForm({
      code: g.code ?? '',
      name: g.name ?? '',
      reportingCurrency: g.reportingCurrency ?? 'USD',
      memberEntityIds: [...(g.memberEntityIds ?? [])],
    });
    setShowGroupForm(true);
  };

  const createGroup = async () => {
    if (!groupForm.code || !groupForm.name || !groupForm.memberEntityIds.length) return;
    if (editingGroupId) await consolidationApi.updateGroup(editingGroupId, groupForm);
    else await consolidationApi.createGroup(groupForm);
    setShowGroupForm(false);
    resetGroupForm();
    load();
  };

  const runConsolidation = async () => {
    if (!runForm.groupId || !runForm.periodStart || !runForm.periodEnd) return;
    setLoading(true);
    try {
      const res = await consolidationApi.runConsolidation(runForm);
      const run = unwrap(res);
      setSelectedRun(run);
      await load();
      setTab('history');
    } finally {
      setLoading(false);
    }
  };

  const entityName = (id: string) => entities.find((e) => e.id === id)?.name ?? id;

  const toggleEntityMember = (id: string) => {
    setGroupForm((prev) => ({
      ...prev,
      memberEntityIds: prev.memberEntityIds.includes(id)
        ? prev.memberEntityIds.filter((x) => x !== id)
        : [...prev.memberEntityIds, id],
    }));
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'groups', label: 'Groups' },
    { key: 'run', label: 'Run Consolidation' },
    { key: 'history', label: 'History' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Layers className="w-7 h-7 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Financial Consolidation</h1>
            <p className="text-sm text-gray-500">Multi-entity consolidation with IC elimination</p>
          </div>
        </div>
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

      {loading && (
        <div className="text-center py-8 text-gray-500">Loading…</div>
      )}

      {/* ── Groups Tab ─────────────────────────────────────────────────────── */}
      {tab === 'groups' && !loading && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => { resetGroupForm(); setShowGroupForm(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
            >
              <Plus className="w-4 h-4" /> New Group
            </button>
          </div>

          {showGroupForm && (
            <div className="bg-white border rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="font-semibold text-gray-800">{editingGroupId ? 'Edit Consolidation Group' : 'Create Consolidation Group'}</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Code *</label>
                  <input
                    className="border rounded-lg px-3 py-2 text-sm w-full"
                    value={groupForm.code}
                    onChange={(e) => setGroupForm({ ...groupForm, code: e.target.value })}
                    placeholder="GRP-001"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Name *</label>
                  <input
                    className="border rounded-lg px-3 py-2 text-sm w-full"
                    value={groupForm.name}
                    onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                    placeholder="Global Consolidation"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Currency</label>
                  <input
                    className="border rounded-lg px-3 py-2 text-sm w-full"
                    value={groupForm.reportingCurrency}
                    onChange={(e) => setGroupForm({ ...groupForm, reportingCurrency: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-2 block">Member Entities *</label>
                <div className="flex flex-wrap gap-2">
                  {entities.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => toggleEntityMember(e.id)}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs border transition-colors ${
                        groupForm.memberEntityIds.includes(e.id)
                          ? 'bg-indigo-100 border-indigo-400 text-indigo-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-indigo-300'
                      }`}
                    >
                      <Building2 className="w-3 h-3" />
                      {e.name}
                    </button>
                  ))}
                  {!entities.length && (
                    <p className="text-xs text-gray-400">No legal entities found. Add them in HR settings.</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setShowGroupForm(false); resetGroupForm(); }}
                  className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={createGroup}
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  {editingGroupId ? 'Update Group' : 'Create Group'}
                </button>
              </div>
            </div>
          )}

          <div className="grid gap-4">
            {groups.map((g) => (
              <div key={g.id} className="bg-white border rounded-xl p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{g.name}</span>
                      <span className="text-xs text-gray-400 font-mono">{g.code}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          g.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {g.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">Currency: {g.reportingCurrency}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => startEditGroup(g)}
                      className="px-3 py-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setRunForm({ ...runForm, groupId: g.id });
                        setTab('run');
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      <Play className="w-3 h-3" /> Run
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(g.memberEntityIds ?? []).map((eid: string) => (
                    <span
                      key={eid}
                      className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2 py-1 rounded-full"
                    >
                      <Building2 className="w-3 h-3" />
                      {entityName(eid)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {!groups.length && (
              <div className="text-center py-12 text-gray-400">
                No consolidation groups yet. Create one to get started.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Run Tab ────────────────────────────────────────────────────────── */}
      {tab === 'run' && !loading && (
        <div className="max-w-lg space-y-5">
          <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
            <h3 className="font-semibold text-gray-800">Run Consolidation</h3>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Consolidation Group *</label>
              <select
                className="border rounded-lg px-3 py-2 text-sm w-full"
                value={runForm.groupId}
                onChange={(e) => setRunForm({ ...runForm, groupId: e.target.value })}
              >
                <option value="">Select group…</option>
                {groups.filter((g) => g.isActive).map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Period Start *</label>
                <input
                  type="date"
                  className="border rounded-lg px-3 py-2 text-sm w-full"
                  value={runForm.periodStart}
                  onChange={(e) => setRunForm({ ...runForm, periodStart: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Period End *</label>
                <input
                  type="date"
                  className="border rounded-lg px-3 py-2 text-sm w-full"
                  value={runForm.periodEnd}
                  onChange={(e) => setRunForm({ ...runForm, periodEnd: e.target.value })}
                />
              </div>
            </div>
            <button
              onClick={runConsolidation}
              disabled={!runForm.groupId || !runForm.periodStart || !runForm.periodEnd || loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              <Play className="w-4 h-4" />
              {loading ? 'Running…' : 'Run Consolidation'}
            </button>
          </div>

          {selectedRun && (
            <div className="bg-white border rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <StatusIcon status={selectedRun.status} />
                <span className="font-semibold text-gray-800">
                  {selectedRun.status === 'COMPLETED' ? 'Consolidation Complete' : selectedRun.status}
                </span>
              </div>
              {selectedRun.status === 'COMPLETED' && selectedRun.resultJson && (
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Total Revenue', value: selectedRun.totalRevenue, color: 'green' },
                    { label: 'Total Expenses', value: selectedRun.totalExpenses, color: 'red' },
                    { label: 'Net Income', value: selectedRun.netIncome, color: selectedRun.netIncome >= 0 ? 'green' : 'red' },
                    { label: 'Total Assets', value: selectedRun.totalAssets, color: 'blue' },
                    { label: 'Total Liabilities', value: selectedRun.totalLiabilities, color: 'orange' },
                    { label: 'Total Equity', value: selectedRun.totalEquity, color: 'purple' },
                    { label: 'IC Eliminations', value: selectedRun.icEliminations, color: 'gray' },
                  ].map((item) => (
                    <div key={item.label} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500">{item.label}</p>
                      <p className={`text-base font-semibold text-${item.color}-600`}>
                        {fmt(item.value)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {selectedRun.status === 'FAILED' && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
                  {selectedRun.errorMessage ?? 'Unknown error'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── History Tab ────────────────────────────────────────────────────── */}
      {tab === 'history' && !loading && (
        <div className="space-y-3">
          {runs.map((run) => (
            <div key={run.id} className="bg-white border rounded-xl shadow-sm overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
                onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
              >
                <div className="flex items-center gap-3">
                  <StatusIcon status={run.status} />
                  <div className="text-left">
                    <p className="font-medium text-gray-900 text-sm">{run.groupName}</p>
                    <p className="text-xs text-gray-400">
                      {run.periodStart} → {run.periodEnd}
                    </p>
                  </div>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[run.status] ?? 'bg-gray-100 text-gray-700'}`}
                  >
                    {run.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {run.status === 'COMPLETED' && (
                    <span className={`font-semibold ${run.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      Net: {fmt(run.netIncome)}
                    </span>
                  )}
                  {expandedRun === run.id
                    ? <ChevronDown className="w-4 h-4 text-gray-400" />
                    : <ChevronRight className="w-4 h-4 text-gray-400" />}
                </div>
              </button>

              {expandedRun === run.id && run.status === 'COMPLETED' && (
                <div className="border-t p-4 grid grid-cols-3 gap-3 bg-gray-50">
                  {[
                    { label: 'Revenue', value: run.totalRevenue },
                    { label: 'Expenses', value: run.totalExpenses },
                    { label: 'Net Income', value: run.netIncome },
                    { label: 'Assets', value: run.totalAssets },
                    { label: 'Liabilities', value: run.totalLiabilities },
                    { label: 'Equity', value: run.totalEquity },
                    { label: 'IC Eliminations', value: run.icEliminations },
                  ].map((item) => (
                    <div key={item.label} className="bg-white rounded-lg p-3 border">
                      <p className="text-xs text-gray-500">{item.label}</p>
                      <p className="text-sm font-semibold text-gray-800">{fmt(item.value)}</p>
                    </div>
                  ))}
                </div>
              )}
              {expandedRun === run.id && run.status === 'FAILED' && (
                <div className="border-t p-4 bg-red-50">
                  <p className="text-sm text-red-600">{run.errorMessage ?? 'Run failed'}</p>
                </div>
              )}
            </div>
          ))}
          {!runs.length && (
            <div className="text-center py-12 text-gray-400">
              No consolidation runs yet. Go to "Run Consolidation" to start.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
