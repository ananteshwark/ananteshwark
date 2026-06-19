import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { payrollApi } from '../../api/payroll';

interface PayComponent {
  id: string;
  code: string;
  name: string;
  type: string;
  calculationType: string;
  isStatutory: boolean;
  isTaxable: boolean;
  glAccountCode?: string;
  isActive: boolean;
}

interface SalaryStructure {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
}

const typeBadge: Record<string, string> = {
  EARNING: 'bg-green-100 text-green-800',
  DEDUCTION: 'bg-red-100 text-red-800',
  EMPLOYER_CONTRIBUTION: 'bg-blue-100 text-blue-800',
  REIMBURSEMENT: 'bg-amber-100 text-amber-800',
};

const defaultForm = {
  code: '',
  name: '',
  type: 'EARNING',
  calculationType: 'FIXED',
  isTaxable: true,
  isStatutory: false,
  glAccountCode: '',
};

export default function PayComponentsPage() {
  const [components, setComponents] = useState<PayComponent[]>([]);
  const [structures, setStructures] = useState<SalaryStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [compRes, structRes] = await Promise.all([
        payrollApi.getComponents(),
        payrollApi.getStructures(),
      ]);
      const compData = compRes.data?.data ?? compRes.data;
      setComponents(compData?.items ?? compData ?? []);
      setStructures(structRes.data?.data ?? structRes.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load pay components');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await payrollApi.createComponent({
        ...form,
        glAccountCode: form.glAccountCode || undefined,
      });
      setShowModal(false);
      setForm(defaultForm);
      fetchData();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Failed to create component');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Pay Components</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Component
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <div className="overflow-x-auto rounded-lg border border-gray-200 mb-8">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Calc</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statutory</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">GL</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {components.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No components found</td></tr>
                )}
                {components.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono text-gray-900">{c.code}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{c.name}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeBadge[c.type] ?? 'bg-gray-100 text-gray-700'}`}>
                        {c.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{c.calculationType}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{c.isStatutory ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3 text-sm font-mono text-gray-500">{c.glAccountCode ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="text-lg font-semibold text-gray-900 mb-3">Salary Structures</h2>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {structures.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No structures found</td></tr>
                )}
                {structures.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{s.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{s.description ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">New Pay Component</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                <input type="text" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. HRA" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="EARNING">Earning</option>
                    <option value="DEDUCTION">Deduction</option>
                    <option value="EMPLOYER_CONTRIBUTION">Employer Contribution</option>
                    <option value="REIMBURSEMENT">Reimbursement</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Calculation</label>
                  <select value={form.calculationType} onChange={(e) => setForm({ ...form, calculationType: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    <option value="FIXED">Fixed</option>
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FORMULA">Formula</option>
                    <option value="SLAB">Slab</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GL Account Code (optional)</label>
                <input type="text" value={form.glAccountCode} onChange={(e) => setForm({ ...form, glAccountCode: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. 6000" />
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.isTaxable} onChange={(e) => setForm({ ...form, isTaxable: e.target.checked })} /> Taxable
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={form.isStatutory} onChange={(e) => setForm({ ...form, isStatutory: e.target.checked })} /> Statutory
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {submitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
