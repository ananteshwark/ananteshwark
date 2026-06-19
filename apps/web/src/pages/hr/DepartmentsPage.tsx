import { useState, useEffect } from 'react';
import { Plus, X, ChevronRight } from 'lucide-react';
import { hrApi } from '../../api/hr';

interface Department {
  id: string;
  code: string;
  name: string;
  parentId: string | null;
  isActive: boolean;
  children?: Department[];
}

const defaultForm = { code: '', name: '', parentId: '' };

function DeptNode({ dept, level = 0 }: { dept: Department; level?: number }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <div>
      <div
        className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 border-b border-gray-100"
        style={{ paddingLeft: `${16 + level * 24}px` }}
      >
        {dept.children && dept.children.length > 0 ? (
          <button onClick={() => setExpanded(e => !e)} className="text-gray-400">
            <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <div className="w-4" />
        )}
        <span className="font-mono text-xs text-gray-500 w-20">{dept.code}</span>
        <span className="text-sm font-medium text-gray-900 flex-1">{dept.name}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${dept.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {dept.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>
      {expanded && dept.children?.map(child => (
        <DeptNode key={child.id} dept={child} level={level + 1} />
      ))}
    </div>
  );
}

export default function DepartmentsPage() {
  const [deptTree, setDeptTree] = useState<Department[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchDepts = async () => {
    setLoading(true);
    setError(null);
    try {
      const [treeRes, listRes] = await Promise.all([
        hrApi.getDepartmentTree(),
        hrApi.getDepartments({ limit: 100 }),
      ]);
      setDeptTree(treeRes.data?.data ?? treeRes.data ?? []);
      const listData = listRes.data?.data ?? listRes.data ?? {};
      setDepartments(listData.items ?? listData ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDepts(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload: any = { ...form };
      if (!payload.parentId) delete payload.parentId;
      await hrApi.createDepartment(payload);
      setShowModal(false);
      setForm(defaultForm);
      await fetchDepts();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Failed to create department');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-sm text-gray-500 mt-1">Organizational structure</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          New Department
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-600 uppercase tracking-wider">
            <div className="w-4" />
            <span className="w-20">Code</span>
            <span className="flex-1">Name</span>
            <span>Status</span>
          </div>
          {deptTree.length === 0 ? (
            <div className="text-center py-8 text-gray-400">No departments found</div>
          ) : (
            deptTree.map(dept => <DeptNode key={dept.id} dept={dept} />)
          )}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">New Department</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{formError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
                <input required value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="ENG" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Engineering" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Parent Department</label>
                <select value={form.parentId} onChange={e => setForm(f => ({ ...f, parentId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">None (Top Level)</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
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
