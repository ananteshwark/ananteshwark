import { useState, useEffect } from 'react';
import { Plus, X, ChevronRight, Building2, Boxes, Network, GitBranch } from 'lucide-react';
import { hrApi } from '../../api/hr';

type Level = 'businessUnit' | 'department' | 'function' | 'subFunction';

interface OrgNode {
  id: string;
  code: string;
  name: string;
  level: Level;
  isActive?: boolean;
  children?: OrgNode[];
}

const LEVEL_META: Record<Level, { label: string; icon: any; color: string }> = {
  businessUnit: { label: 'Business Unit', icon: Building2, color: 'text-indigo-600' },
  department: { label: 'Department', icon: Boxes, color: 'text-blue-600' },
  function: { label: 'Function', icon: Network, color: 'text-teal-600' },
  subFunction: { label: 'Sub Function', icon: GitBranch, color: 'text-amber-600' },
};

function OrgNodeRow({ node, level = 0 }: { node: OrgNode; level?: number }) {
  const [expanded, setExpanded] = useState(true);
  const meta = LEVEL_META[node.level] ?? LEVEL_META.department;
  const Icon = meta.icon;
  const hasChildren = node.children && node.children.length > 0;
  return (
    <div>
      <div
        className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100"
        style={{ paddingLeft: `${16 + level * 24}px` }}
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
        <OrgNodeRow key={child.id} node={child} level={level + 1} />
      ))}
    </div>
  );
}

const emptyForm = { level: 'businessUnit' as Level, code: '', name: '', businessUnitId: '', departmentId: '', functionId: '' };

export default function DepartmentsPage() {
  const [tree, setTree] = useState<OrgNode[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [functions, setFunctions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [treeRes, buRes, deptRes, fnRes] = await Promise.all([
        hrApi.getOrgTree(),
        hrApi.getBusinessUnits({ limit: 200 }),
        hrApi.getDepartments({ limit: 200 }),
        hrApi.getFunctions({ limit: 200 }),
      ]);
      setTree(treeRes.data?.data ?? treeRes.data ?? []);
      setBusinessUnits(buRes.data?.items ?? buRes.data?.data?.items ?? []);
      setDepartments(deptRes.data?.items ?? deptRes.data?.data?.items ?? []);
      setFunctions(fnRes.data?.items ?? fnRes.data?.data?.items ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load organization structure');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const openModal = (level: Level) => {
    setForm({ ...emptyForm, level });
    setFormError(null);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const base = { code: form.code, name: form.name };
      if (form.level === 'businessUnit') {
        await hrApi.createBusinessUnit(base);
      } else if (form.level === 'department') {
        await hrApi.createDepartment({ ...base, businessUnitId: form.businessUnitId || undefined });
      } else if (form.level === 'function') {
        await hrApi.createFunction({ ...base, departmentId: form.departmentId || undefined });
      } else {
        if (!form.functionId) { setFormError('Function is required for a sub function'); setSubmitting(false); return; }
        await hrApi.createSubFunction({ ...base, functionId: form.functionId });
      }
      setShowModal(false);
      setForm(emptyForm);
      await fetchAll();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organization Structure</h1>
          <p className="text-sm text-gray-500 mt-1">Business Unit → Department → Function → Sub Function</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openModal('businessUnit')} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"><Plus className="h-4 w-4" /> Business Unit</button>
          <button onClick={() => openModal('department')} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"><Plus className="h-4 w-4" /> Department</button>
          <button onClick={() => openModal('function')} className="flex items-center gap-1.5 px-3 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium"><Plus className="h-4 w-4" /> Function</button>
          <button onClick={() => openModal('subFunction')} className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm font-medium"><Plus className="h-4 w-4" /> Sub Function</button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
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
            <div className="text-center py-8 text-gray-400">No organization units yet. Start by adding a Business Unit.</div>
          ) : (
            tree.map(node => <OrgNodeRow key={node.id} node={node} />)
          )}
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
                <select value={form.level} onChange={e => setForm(f => ({ ...f, level: e.target.value as Level }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="businessUnit">Business Unit</option>
                  <option value="department">Department</option>
                  <option value="function">Function</option>
                  <option value="subFunction">Sub Function</option>
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

              {form.level === 'department' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Business Unit</label>
                  <select value={form.businessUnitId} onChange={e => setForm(f => ({ ...f, businessUnitId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">None (Unassigned)</option>
                    {businessUnits.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}

              {form.level === 'function' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select value={form.departmentId} onChange={e => setForm(f => ({ ...f, departmentId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">None (Unassigned)</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}

              {form.level === 'subFunction' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Function *</label>
                  <select required value={form.functionId} onChange={e => setForm(f => ({ ...f, functionId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option value="">Select function...</option>
                    {functions.map(fn => <option key={fn.id} value={fn.id}>{fn.name}</option>)}
                  </select>
                </div>
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
