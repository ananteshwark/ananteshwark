import { useState, useEffect, useMemo } from 'react';
import {
  Plus, X, ChevronRight, Landmark, Building2, Layers, Boxes, Network, GitBranch, Users,
  ListTree, Table as TableIcon, Search, Settings,
} from 'lucide-react';
import { hrApi } from '../../api/hr';

interface OrgLevelConfig {
  id?: string;
  level: Level;
  enabled: boolean;
  required: boolean;
}

type Level = 'legalEntity' | 'businessUnit' | 'division' | 'department' | 'function' | 'subFunction' | 'team';

interface OrgNode {
  id: string;
  code: string;
  name: string;
  level: Level;
  isActive?: boolean;
  businessUnitId?: string | null;
  divisionId?: string | null;
  parentId?: string | null;
  legalEntityId?: string | null;
  departmentId?: string | null;
  functionId?: string | null;
  subFunctionId?: string | null;
  children?: OrgNode[];
}

const LEVEL_META: Record<Level, { label: string; icon: any; color: string }> = {
  legalEntity:  { label: 'Legal Entity',  icon: Landmark,  color: 'text-indigo-600' },
  businessUnit: { label: 'Business Unit', icon: Building2,  color: 'text-blue-600' },
  division:     { label: 'Division',      icon: Layers,    color: 'text-sky-600' },
  department:   { label: 'Department',    icon: Boxes,     color: 'text-teal-600' },
  function:     { label: 'Function',      icon: Network,   color: 'text-cyan-600' },
  subFunction:  { label: 'Sub Function',  icon: GitBranch, color: 'text-amber-600' },
  team:         { label: 'Team',          icon: Users,     color: 'text-rose-600' },
};

const LEVEL_ORDER: Level[] = ['legalEntity', 'businessUnit', 'division', 'department', 'function', 'subFunction', 'team'];

function OrgNodeRow({ node, depth = 0 }: { node: OrgNode; depth?: number }) {
  const [expanded, setExpanded] = useState(true);
  const meta = LEVEL_META[node.level] ?? LEVEL_META.department;
  const Icon = meta.icon;
  const hasChildren = node.children && node.children.length > 0;
  return (
    <div>
      <div
        className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100"
        style={{ paddingLeft: `${16 + depth * 24}px` }}
      >
        {hasChildren ? (
          <button onClick={() => setExpanded(e => !e)} className="text-gray-400">
            <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <div className="w-4" />
        )}
        <Icon className={`h-4 w-4 ${meta.color}`} />
        <span className="font-mono text-xs text-gray-500 w-24">{node.code}</span>
        <span className="text-sm font-medium text-gray-900 flex-1">{node.name}</span>
        <span className="text-xs text-gray-400 w-28">{meta.label}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${node.isActive === false ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
          {node.isActive === false ? 'Inactive' : 'Active'}
        </span>
      </div>
      {expanded && node.children?.map(child => (
        <OrgNodeRow key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

interface FlatRow {
  id: string;
  code: string;
  name: string;
  level: Level;
  isActive?: boolean;
  parentName: string;
  parentLevel: Level | null;
}

// Walk the tree to collect (a) per-level lists for the parent dropdowns and
// (b) flat rows (with resolved parent) for the list view. Synthetic nodes
// (e.g. the "Unassigned" bucket, id prefixed with "__") are skipped.
function walkTree(tree: OrgNode[]) {
  const byLevel: Record<Level, OrgNode[]> = {
    legalEntity: [], businessUnit: [], division: [], department: [], function: [], subFunction: [], team: [],
  };
  const rows: FlatRow[] = [];

  const visit = (node: OrgNode, parent: OrgNode | null) => {
    const synthetic = node.id.startsWith('__');
    if (!synthetic) {
      byLevel[node.level]?.push(node);
      rows.push({
        id: node.id,
        code: node.code,
        name: node.name,
        level: node.level,
        isActive: node.isActive,
        parentName: parent && !parent.id.startsWith('__') ? parent.name : '—',
        parentLevel: parent && !parent.id.startsWith('__') ? parent.level : null,
      });
    }
    node.children?.forEach(child => visit(child, synthetic ? null : node));
  };

  tree.forEach(root => visit(root, null));
  return { byLevel, rows };
}

const emptyForm = {
  level: 'legalEntity' as Level,
  code: '',
  name: '',
  legalEntityId: '',
  businessUnitId: '',
  divisionId: '',
  parentId: '',
  departmentId: '',
  functionId: '',
  subFunctionId: '',
};

const DEFAULT_CONFIGS: OrgLevelConfig[] = [
  { level: 'legalEntity',  enabled: true, required: false },
  { level: 'businessUnit', enabled: true, required: true  },
  { level: 'division',     enabled: true, required: false },
  { level: 'department',   enabled: true, required: true  },
  { level: 'function',     enabled: true, required: true  },
  { level: 'subFunction',  enabled: true, required: false },
  { level: 'team',         enabled: true, required: false },
];

export default function DepartmentsPage() {
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [view, setView] = useState<'tree' | 'list'>('tree');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // List-view filters
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<Level | 'all'>('all');

  // Org level config
  const [showConfig, setShowConfig] = useState(false);
  const [configs, setConfigs] = useState<OrgLevelConfig[]>(DEFAULT_CONFIGS);
  const [configSaving, setConfigSaving] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSuccess, setConfigSuccess] = useState(false);

  const cfgMap = useMemo(
    () => Object.fromEntries(configs.map(c => [c.level, c])) as Record<Level, OrgLevelConfig>,
    [configs],
  );

  const fetchTree = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await hrApi.getOrgTree();
      setTree(res.data?.data ?? res.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load organization structure');
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      const res = await hrApi.getOrgLevelConfig();
      const data: OrgLevelConfig[] = res.data?.data ?? res.data ?? [];
      if (data.length > 0) setConfigs(data);
    } catch {
      // silently fall back to defaults
    }
  };

  useEffect(() => { fetchTree(); fetchConfig(); }, []);

  // Dropdown source lists + flat rows are derived from the tree, so they scale
  // to the largest organisations without any pagination cap.
  const { byLevel, rows } = useMemo(() => walkTree(tree), [tree]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(r => levelFilter === 'all' || r.level === levelFilter)
      .filter(r => !q || r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
      .sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || a.name.localeCompare(b.name));
  }, [rows, search, levelFilter]);

  const openModal = (level: Level) => {
    setForm({ ...emptyForm, level });
    setFormError(null);
    setShowModal(true);
  };

  const toggleConfig = (level: Level, field: 'enabled' | 'required', value: boolean) => {
    setConfigs(prev => prev.map(c => {
      if (c.level !== level) return c;
      if (field === 'required' && value) return { ...c, enabled: true, required: true };
      if (field === 'enabled' && !value) return { ...c, enabled: false, required: false };
      return { ...c, [field]: value };
    }));
  };

  const saveConfig = async () => {
    setConfigSaving(true);
    setConfigError(null);
    setConfigSuccess(false);
    try {
      const res = await hrApi.updateOrgLevelConfig(configs);
      const saved: OrgLevelConfig[] = res.data?.data ?? res.data ?? [];
      if (saved.length > 0) setConfigs(saved);
      setConfigSuccess(true);
      setTimeout(() => setConfigSuccess(false), 3000);
    } catch (err: any) {
      setConfigError(err?.response?.data?.message ?? 'Failed to save configuration');
    } finally {
      setConfigSaving(false);
    }
  };

  // Parent department / division options narrow to the chosen business unit.
  const divisionOptions = useMemo(
    () => byLevel.division.filter(d => !form.businessUnitId || d.businessUnitId === form.businessUnitId),
    [byLevel.division, form.businessUnitId],
  );
  const parentDeptOptions = useMemo(
    () => byLevel.department.filter(d => !form.businessUnitId || d.businessUnitId === form.businessUnitId),
    [byLevel.department, form.businessUnitId],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    const base = { code: form.code.trim(), name: form.name.trim() };
    try {
      switch (form.level) {
        case 'legalEntity':
          await hrApi.createLegalEntity(base);
          break;
        case 'businessUnit':
          await hrApi.createBusinessUnit({ ...base, legalEntityId: form.legalEntityId || undefined });
          break;
        case 'division':
          if (!form.businessUnitId) throw new ValidationError('Business Unit is required for a division');
          await hrApi.createDivision({ ...base, businessUnitId: form.businessUnitId });
          break;
        case 'department':
          if (!form.businessUnitId) throw new ValidationError('Business Unit is required for a department');
          await hrApi.createDepartment({
            ...base,
            businessUnitId: form.businessUnitId,
            divisionId: form.divisionId || undefined,
            parentId: form.parentId || undefined,
          });
          break;
        case 'function':
          if (!form.departmentId) throw new ValidationError('Department is required for a function');
          await hrApi.createFunction({ ...base, departmentId: form.departmentId });
          break;
        case 'subFunction':
          if (!form.functionId) throw new ValidationError('Function is required for a sub function');
          await hrApi.createSubFunction({ ...base, functionId: form.functionId });
          break;
        case 'team':
          if (!form.subFunctionId) throw new ValidationError('Sub Function is required for a team');
          await hrApi.createTeam({ ...base, subFunctionId: form.subFunctionId });
          break;
      }
      setShowModal(false);
      setForm(emptyForm);
      await fetchTree();
    } catch (err: any) {
      if (err instanceof ValidationError) setFormError(err.message);
      else setFormError(err?.response?.data?.message ?? 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  const Select = ({ label, value, onChange, options, placeholder, required }: {
    label: string; value: string; onChange: (v: string) => void;
    options: { id: string; code: string; name: string }[]; placeholder: string; required?: boolean;
  }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}{required && ' *'}</label>
      <select
        required={required}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.code} — {o.name}</option>)}
      </select>
      {required && options.length === 0 && (
        <p className="text-xs text-amber-600 mt-1">Create a parent level first.</p>
      )}
    </div>
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organization Structure</h1>
          <p className="text-sm text-gray-500 mt-1">Legal Entity → Business Unit → Division → Department → Function → Sub Function → Team</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
            <button onClick={() => setView('tree')} title="Tree view"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${view === 'tree' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
              <ListTree className="h-4 w-4" /> Tree
            </button>
            <button onClick={() => setView('list')} title="List view"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium ${view === 'list' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
              <TableIcon className="h-4 w-4" /> List
            </button>
          </div>
          <button onClick={() => { setShowConfig(true); setConfigError(null); setConfigSuccess(false); }}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
            title="Configure org levels">
            <Settings className="h-4 w-4" /> Configure
          </button>
          <button onClick={() => openModal('legalEntity')} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
            <Plus className="h-4 w-4" /> New Org Unit
          </button>
        </div>
      </div>

      {/* Quick-add chips for each level */}
      <div className="flex flex-wrap gap-2 mb-5">
        {LEVEL_ORDER.map(lvl => {
          const meta = LEVEL_META[lvl];
          const Icon = meta.icon;
          return (
            <button key={lvl} onClick={() => openModal(lvl)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300">
              <Icon className={`h-3.5 w-3.5 ${meta.color}`} /> {meta.label}
            </button>
          );
        })}
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : view === 'tree' ? (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-600 uppercase tracking-wider">
            <div className="w-4" />
            <div className="w-4" />
            <span className="w-24">Code</span>
            <span className="flex-1">Name</span>
            <span className="w-28">Level</span>
            <span>Status</span>
          </div>
          {tree.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No organization units yet. Start by adding a Legal Entity or Business Unit.</div>
          ) : (
            tree.map(node => <OrgNodeRow key={node.id} node={node} />)
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search code or name..."
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <select value={levelFilter} onChange={e => setLevelFilter(e.target.value as Level | 'all')}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">All levels</option>
              {LEVEL_ORDER.map(l => <option key={l} value={l}>{LEVEL_META[l].label}</option>)}
            </select>
            <span className="text-sm text-gray-400">{filteredRows.length} unit{filteredRows.length === 1 ? '' : 's'}</span>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Code', 'Name', 'Level', 'Parent', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-100">
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No matching units</td></tr>
                ) : filteredRows.map(r => {
                  const meta = LEVEL_META[r.level];
                  const Icon = meta.icon;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{r.code}</td>
                      <td className="px-4 py-2.5 text-sm font-medium text-gray-900">{r.name}</td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs text-gray-600">
                          <Icon className={`h-3.5 w-3.5 ${meta.color}`} /> {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-gray-600">{r.parentName}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${r.isActive === false ? 'bg-gray-100 text-gray-500' : 'bg-green-100 text-green-700'}`}>
                          {r.isActive === false ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Org Level Configuration Modal */}
      {showConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <div>
                <h2 className="text-lg font-semibold">Configure Org Levels</h2>
                <p className="text-xs text-gray-500 mt-0.5">Toggle which hierarchy levels are active and which are mandatory when creating employees.</p>
              </div>
              <button onClick={() => setShowConfig(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-2">
              {configError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm mb-3">{configError}</div>}
              {configSuccess && <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm mb-3">Configuration saved successfully.</div>}

              {/* Header row */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-4 px-2 pb-1 text-xs font-medium text-gray-500 uppercase tracking-wider">
                <span>Level</span>
                <span className="w-20 text-center">Enabled</span>
                <span className="w-20 text-center">Required</span>
              </div>

              {LEVEL_ORDER.map(lvl => {
                const meta = LEVEL_META[lvl];
                const Icon = meta.icon;
                const cfg = cfgMap[lvl] ?? { enabled: true, required: false };
                return (
                  <div key={lvl} className={`grid grid-cols-[1fr_auto_auto] gap-4 items-center px-3 py-3 rounded-lg border ${cfg.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50'}`}>
                    <div className="flex items-center gap-2.5">
                      <Icon className={`h-4 w-4 ${cfg.enabled ? meta.color : 'text-gray-400'}`} />
                      <span className={`text-sm font-medium ${cfg.enabled ? 'text-gray-900' : 'text-gray-400'}`}>{meta.label}</span>
                    </div>
                    {/* Enabled toggle */}
                    <div className="w-20 flex justify-center">
                      <button
                        type="button"
                        onClick={() => toggleConfig(lvl, 'enabled', !cfg.enabled)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${cfg.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${cfg.enabled ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    {/* Required toggle */}
                    <div className="w-20 flex justify-center">
                      <button
                        type="button"
                        disabled={!cfg.enabled}
                        onClick={() => toggleConfig(lvl, 'required', !cfg.required)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${cfg.required ? 'bg-rose-500' : 'bg-gray-300'}`}
                      >
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${cfg.required ? 'translate-x-4' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>
                );
              })}

              <p className="text-xs text-gray-400 pt-1">
                <span className="inline-block w-3 h-3 bg-blue-600 rounded-full mr-1.5 align-middle" />Enabled = level is visible.&nbsp;
                <span className="inline-block w-3 h-3 bg-rose-500 rounded-full mr-1.5 align-middle" />Required = employees must be assigned to this level.
              </p>
            </div>
            <div className="flex gap-3 p-5 border-t">
              <button type="button" onClick={() => setShowConfig(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button type="button" onClick={saveConfig} disabled={configSaving} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {configSaving ? 'Saving...' : 'Save Configuration'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">New {LEVEL_META[form.level].label}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{formError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
                <select value={form.level} onChange={e => setForm({ ...emptyForm, level: e.target.value as Level })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {LEVEL_ORDER.map(l => <option key={l} value={l}>{LEVEL_META[l].label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                <input required value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. ENG" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Engineering" />
              </div>

              {form.level === 'businessUnit' && (
                <Select label="Legal Entity" placeholder="Select legal entity (optional)..."
                  value={form.legalEntityId} onChange={v => setForm(f => ({ ...f, legalEntityId: v }))} options={byLevel.legalEntity} />
              )}

              {form.level === 'division' && (
                <Select label="Business Unit" required placeholder="Select business unit..."
                  value={form.businessUnitId} onChange={v => setForm(f => ({ ...f, businessUnitId: v }))} options={byLevel.businessUnit} />
              )}

              {form.level === 'department' && (
                <>
                  <Select label="Business Unit" required placeholder="Select business unit..."
                    value={form.businessUnitId} onChange={v => setForm(f => ({ ...f, businessUnitId: v, divisionId: '', parentId: '' }))} options={byLevel.businessUnit} />
                  <Select label="Division" placeholder="Select division (optional)..."
                    value={form.divisionId} onChange={v => setForm(f => ({ ...f, divisionId: v }))} options={divisionOptions} />
                  <Select label="Parent Department" placeholder="Select parent department (optional)..."
                    value={form.parentId} onChange={v => setForm(f => ({ ...f, parentId: v }))} options={parentDeptOptions} />
                </>
              )}

              {form.level === 'function' && (
                <Select label="Department" required placeholder="Select department..."
                  value={form.departmentId} onChange={v => setForm(f => ({ ...f, departmentId: v }))} options={byLevel.department} />
              )}

              {form.level === 'subFunction' && (
                <Select label="Function" required placeholder="Select function..."
                  value={form.functionId} onChange={v => setForm(f => ({ ...f, functionId: v }))} options={byLevel.function} />
              )}

              {form.level === 'team' && (
                <Select label="Sub Function" required placeholder="Select sub function..."
                  value={form.subFunctionId} onChange={v => setForm(f => ({ ...f, subFunctionId: v }))} options={byLevel.subFunction} />
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Creating...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// Lightweight client-side validation error so missing-parent messages surface
// in the modal without hitting the API.
class ValidationError extends Error {}
