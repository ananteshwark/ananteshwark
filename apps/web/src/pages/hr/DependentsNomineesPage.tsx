import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { hrApi } from '../../api/hr';

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
}

interface Dependent {
  id: string;
  name: string;
  relationship: string;
  dateOfBirth?: string | null;
  gender?: string | null;
}

interface Nominee {
  id: string;
  name: string;
  relationship: string;
  percentage: number;
  forType: string;
}

const FOR_TYPES = ['GRATUITY', 'PF', 'INSURANCE', 'OTHER'];

export default function DependentsNomineesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [nominees, setNominees] = useState<Nominee[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [depForm, setDepForm] = useState({ name: '', relationship: '', dateOfBirth: '', gender: '' });
  const [nomForm, setNomForm] = useState({ name: '', relationship: '', percentage: 0, forType: 'GRATUITY' });

  useEffect(() => {
    hrApi.getEmployees({ limit: 100 }).then((res) => {
      const data = res.data?.data ?? res.data;
      setEmployees(data?.items ?? data ?? []);
    });
  }, []);

  const loadFamily = async (empId: string) => {
    if (!empId) { setDependents([]); setNominees([]); return; }
    setError(null);
    try {
      const [depRes, nomRes] = await Promise.all([
        hrApi.getDependents(empId),
        hrApi.getNominees(empId),
      ]);
      setDependents(depRes.data?.data ?? depRes.data ?? []);
      setNominees(nomRes.data?.data ?? nomRes.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load family');
    }
  };

  const onSelectEmployee = (empId: string) => {
    setEmployeeId(empId);
    loadFamily(empId);
  };

  const addDependent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await hrApi.addDependent(employeeId, {
        name: depForm.name,
        relationship: depForm.relationship,
        dateOfBirth: depForm.dateOfBirth || undefined,
        gender: depForm.gender || undefined,
      });
      setDepForm({ name: '', relationship: '', dateOfBirth: '', gender: '' });
      loadFamily(employeeId);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to add dependent');
    }
  };

  const addNominee = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await hrApi.addNominee(employeeId, {
        name: nomForm.name,
        relationship: nomForm.relationship,
        percentage: Number(nomForm.percentage),
        forType: nomForm.forType,
      });
      setNomForm({ name: '', relationship: '', percentage: 0, forType: 'GRATUITY' });
      loadFamily(employeeId);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to add nominee');
    }
  };

  const removeDependent = async (id: string) => {
    await hrApi.deleteDependent(employeeId, id);
    loadFamily(employeeId);
  };

  const removeNominee = async (id: string) => {
    await hrApi.deleteNominee(employeeId, id);
    loadFamily(employeeId);
  };

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Dependents &amp; Nominees</h1>

      <div className="mb-6 max-w-md">
        <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
        <select value={employeeId} onChange={(e) => onSelectEmployee(e.target.value)} className={inputCls}>
          <option value="">Select employee</option>
          {employees.map((emp) => (<option key={emp.id} value={emp.id}>{emp.employeeCode} - {emp.firstName} {emp.lastName}</option>))}
        </select>
      </div>

      {error && <p className="text-red-600 mb-3">{error}</p>}

      {employeeId && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Dependents */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Dependents</h2>
            <div className="space-y-2 mb-4">
              {dependents.length === 0 && <p className="text-sm text-gray-400">No dependents</p>}
              {dependents.map((d) => (
                <div key={d.id} className="flex items-center justify-between p-2 border border-gray-100 rounded-lg">
                  <div className="text-sm">
                    <span className="font-medium text-gray-900">{d.name}</span>
                    <span className="text-gray-500"> · {d.relationship}{d.dateOfBirth ? ` · DOB ${d.dateOfBirth}` : ''}</span>
                  </div>
                  <button onClick={() => removeDependent(d.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <form onSubmit={addDependent} className="space-y-2">
              <input required placeholder="Name" value={depForm.name} onChange={(e) => setDepForm({ ...depForm, name: e.target.value })} className={inputCls} />
              <input required placeholder="Relationship" value={depForm.relationship} onChange={(e) => setDepForm({ ...depForm, relationship: e.target.value })} className={inputCls} />
              <div className="grid grid-cols-2 gap-2">
                <input type="date" value={depForm.dateOfBirth} onChange={(e) => setDepForm({ ...depForm, dateOfBirth: e.target.value })} className={inputCls} />
                <input placeholder="Gender" value={depForm.gender} onChange={(e) => setDepForm({ ...depForm, gender: e.target.value })} className={inputCls} />
              </div>
              <button type="submit" className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 text-sm"><Plus className="w-4 h-4" /> Add Dependent</button>
            </form>
          </div>

          {/* Nominees */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Nominees</h2>
            <div className="space-y-2 mb-4">
              {nominees.length === 0 && <p className="text-sm text-gray-400">No nominees</p>}
              {nominees.map((n) => (
                <div key={n.id} className="flex items-center justify-between p-2 border border-gray-100 rounded-lg">
                  <div className="text-sm">
                    <span className="font-medium text-gray-900">{n.name}</span>
                    <span className="text-gray-500"> · {n.relationship} · {n.percentage}% · {n.forType}</span>
                  </div>
                  <button onClick={() => removeNominee(n.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <form onSubmit={addNominee} className="space-y-2">
              <input required placeholder="Name" value={nomForm.name} onChange={(e) => setNomForm({ ...nomForm, name: e.target.value })} className={inputCls} />
              <input required placeholder="Relationship" value={nomForm.relationship} onChange={(e) => setNomForm({ ...nomForm, relationship: e.target.value })} className={inputCls} />
              <div className="grid grid-cols-2 gap-2">
                <input required type="number" min="0" max="100" step="0.01" placeholder="Percentage" value={nomForm.percentage} onChange={(e) => setNomForm({ ...nomForm, percentage: Number(e.target.value) })} className={inputCls} />
                <select value={nomForm.forType} onChange={(e) => setNomForm({ ...nomForm, forType: e.target.value })} className={inputCls}>
                  {FOR_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
              <button type="submit" className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-2 rounded-lg hover:bg-indigo-700 text-sm"><Plus className="w-4 h-4" /> Add Nominee</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
