import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X, Search, Upload, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { hrApi } from '../../api/hr';
import { settingsApi } from '../../api/settings';

interface Employee {
  id: string;
  employeeCode: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  phone?: string | null;
  status: string;
  designationId: string | null;
  departmentId: string | null;
  businessUnitId?: string | null;
  employmentType: string;
  dateOfJoining?: string;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  ON_LEAVE: 'bg-yellow-100 text-yellow-800',
  TERMINATED: 'bg-red-100 text-red-800',
  RESIGNED: 'bg-gray-100 text-gray-800',
};

const TABS = ['Work Info', 'Personal', 'Address', 'Emergency', 'Banking', 'Login Account'] as const;
type Tab = typeof TABS[number];

const makeDefaultForm = () => ({
  // Work Info
  employeeCode: '', dateOfJoining: '', probationEndDate: '', confirmationDate: '',
  firstName: '', middleName: '', lastName: '',
  email: '', phone: '',
  legalEntityId: '', businessUnitId: '', divisionId: '', departmentId: '', functionId: '', subFunctionId: '', teamId: '',
  designationId: '', managerId: '', locationId: '',
  employmentType: 'FULL_TIME', status: 'ACTIVE',
  // Personal
  dateOfBirth: '', gender: '', maritalStatus: '', nationality: '',
  bloodGroup: '', personalEmail: '', homePhone: '', pan: '', aadhar: '',
  passportNumber: '', passportExpiry: '',
  // Current Address
  currentAddressLine1: '', currentAddressLine2: '', currentCity: '',
  currentState: '', currentCountry: '', currentPincode: '',
  // Permanent Address
  permanentAddressLine1: '', permanentAddressLine2: '', permanentCity: '',
  permanentState: '', permanentCountry: '', permanentPincode: '',
  // Emergency
  emergencyContactName: '', emergencyContactRelation: '', emergencyContactPhone: '',
  // Banking
  bankName: '', bankAccountNumber: '', bankIfsc: '', bankBranch: '',
  // Login
  createLoginAccount: false, loginPassword: '',
});

// CSV columns for bulk upload template
const CSV_COLUMNS = [
  'employeeCode', 'firstName', 'lastName', 'email', 'dateOfJoining',
  'businessUnitId', 'departmentId', 'functionId', 'phone', 'gender',
  'dateOfBirth', 'employmentType', 'designationId', 'locationId',
  'legalEntityId', 'divisionId', 'subFunctionId', 'teamId',
];

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    return Object.fromEntries(headers.map((h, i) => [h, values[i] ?? '']));
  });
}

function downloadTemplate(bus: any[], depts: any[], fns: any[], desigs: any[], locs: any[]) {
  const header = CSV_COLUMNS.join(',');
  const example = [
    'EMP-100', 'John', 'Doe', 'john.doe@company.com', '2024-01-15',
    bus[0]?.id ?? '', depts[0]?.id ?? '', fns[0]?.id ?? '',
    '+91-9999999999', 'MALE', '1990-05-20', 'FULL_TIME',
    desigs[0]?.id ?? '', locs[0]?.id ?? '',
    '', '', '', '', // legalEntityId, divisionId, subFunctionId, teamId (optional)
  ].join(',');
  const blob = new Blob([header + '\n' + example], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'employee_bulk_upload_template.csv'; a.click();
  URL.revokeObjectURL(url);
}

export default function EmployeesPage() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [legalEntities, setLegalEntities] = useState<any[]>([]);
  const [businessUnits, setBusinessUnits] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [functions, setFunctions] = useState<any[]>([]);
  const [subFunctions, setSubFunctions] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [designations, setDesignations] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [allEmployees, setAllEmployees] = useState<any[]>([]); // for manager dropdown
  const [orgConfig, setOrgConfig] = useState<Record<string, { enabled: boolean; required: boolean }>>({
    legalEntity:  { enabled: true, required: false },
    businessUnit: { enabled: true, required: true  },
    division:     { enabled: true, required: false },
    department:   { enabled: true, required: true  },
    function:     { enabled: true, required: true  },
    subFunction:  { enabled: true, required: false },
    team:         { enabled: true, required: false },
  });
  const [fieldConfig, setFieldConfig] = useState<Record<string, { enabled: boolean; required: boolean; label: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Create / Edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('Work Info');
  const [form, setForm] = useState(makeDefaultForm());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Bulk upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkResult, setBulkResult] = useState<{ created: number; errors: { row: number; error: string }[] } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const unwrap = (res: any) => {
        const d = res.data?.data ?? res.data ?? {};
        return d.items ?? d ?? [];
      };
      const [empRes, leRes, buRes, divRes, deptRes, fnRes, subFnRes, teamRes, desigRes, locRes, allEmpRes, cfgRes, fCfgRes] = await Promise.all([
        hrApi.getEmployees(params),
        hrApi.getLegalEntities({ limit: 500 }),
        hrApi.getBusinessUnits({ limit: 500 }),
        hrApi.getDivisions({ limit: 1000 }),
        hrApi.getDepartments({ limit: 1000 }),
        hrApi.getFunctions({ limit: 1000 }),
        hrApi.getSubFunctions({ limit: 1000 }),
        hrApi.getTeams({ limit: 1000 }),
        hrApi.getDesignations({ limit: 500 }),
        hrApi.getLocations({ limit: 500 }),
        hrApi.getEmployees({ limit: 1000 }),
        hrApi.getOrgLevelConfig(),
        settingsApi.getModuleFieldConfig('hr.employee'),
      ]);
      setEmployees(unwrap(empRes));
      setLegalEntities(unwrap(leRes));
      setBusinessUnits(unwrap(buRes));
      setDivisions(unwrap(divRes));
      setDepartments(unwrap(deptRes));
      setFunctions(unwrap(fnRes));
      setSubFunctions(unwrap(subFnRes));
      setTeams(unwrap(teamRes));
      setDesignations(unwrap(desigRes));
      setLocations(unwrap(locRes));
      setAllEmployees(unwrap(allEmpRes));
      const cfgArr: any[] = unwrap(cfgRes);
      if (cfgArr.length > 0) {
        setOrgConfig(Object.fromEntries(cfgArr.map((c: any) => [c.level, { enabled: c.enabled, required: c.required }])));
      }
      const fCfgArr: any[] = fCfgRes.data?.data ?? fCfgRes.data ?? [];
      const fCfgMap: Record<string, { enabled: boolean; required: boolean; label: string }> = {};
      for (const c of fCfgArr) {
        fCfgMap[c.field] = { enabled: c.enabled, required: c.required, label: c.customLabel ?? c.label };
      }
      setFieldConfig(fCfgMap);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load employees');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [search, statusFilter]);

  const setF = (patch: Partial<typeof form>) => setForm(f => ({ ...f, ...patch }));

  const fc = (field: string, defaultLabel: string) => ({
    enabled: fieldConfig[field]?.enabled ?? true,
    required: fieldConfig[field]?.required ?? false,
    label: fieldConfig[field]?.label ?? defaultLabel,
  });

  const DATE_FIELDS = ['dateOfJoining', 'probationEndDate', 'confirmationDate', 'dateOfBirth', 'passportExpiry'];

  const startEdit = (emp: any) => {
    const base = makeDefaultForm();
    const filled: any = { ...base };
    (Object.keys(base) as string[]).forEach(k => {
      const v = emp[k];
      if (v !== undefined && v !== null) {
        filled[k] = DATE_FIELDS.includes(k) && typeof v === 'string' ? v.slice(0, 10) : v;
      }
    });
    filled.createLoginAccount = false;
    filled.loginPassword = '';
    setForm(filled);
    setEditingId(emp.id);
    setActiveTab('Work Info');
    setFormError(null);
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingId(null); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload: any = { ...form };
      // Strip empty optional fields
      const optional = [
        'middleName', 'phone', 'homePhone', 'personalEmail',
        'legalEntityId', 'divisionId', 'subFunctionId', 'teamId', 'designationId',
        'managerId', 'locationId', 'dateOfBirth', 'gender', 'maritalStatus', 'nationality',
        'bloodGroup', 'pan', 'aadhar', 'passportNumber', 'passportExpiry',
        'probationEndDate', 'confirmationDate',
        'currentAddressLine1', 'currentAddressLine2', 'currentCity', 'currentState', 'currentCountry', 'currentPincode',
        'permanentAddressLine1', 'permanentAddressLine2', 'permanentCity', 'permanentState', 'permanentCountry', 'permanentPincode',
        'emergencyContactName', 'emergencyContactRelation', 'emergencyContactPhone',
        'bankName', 'bankAccountNumber', 'bankIfsc', 'bankBranch',
        'loginPassword',
      ];
      optional.forEach(k => { if (!payload[k]) delete payload[k]; });
      if (!payload.createLoginAccount) delete payload.loginPassword;
      if (editingId) await hrApi.updateEmployee(editingId, payload);
      else await hrApi.createEmployee(payload);
      setShowModal(false);
      setEditingId(null);
      setForm(makeDefaultForm());
      setActiveTab('Work Info');
      await fetchData();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? `Failed to ${editingId ? 'update' : 'create'} employee`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) { alert('No data rows found in CSV'); return; }
    try {
      const res = await hrApi.bulkCreateEmployees(rows);
      const result = res.data?.data ?? res.data;
      setBulkResult(result);
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Bulk upload failed');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getDeptName = (id: string | null) => departments.find(d => d.id === id)?.name ?? '-';
  const getDesigName = (id: string | null) => designations.find(d => d.id === id)?.name ?? '-';
  const getBuName = (id: string | null | undefined) => businessUnits.find(b => b.id === id)?.name ?? '-';

  const INPUT = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const LABEL = 'block text-sm font-medium text-gray-700 mb-1';

  const filteredBus = businessUnits.filter(b => !form.legalEntityId || b.legalEntityId === form.legalEntityId);
  const filteredDivs = divisions.filter(v => !form.businessUnitId || v.businessUnitId === form.businessUnitId);
  const filteredDepts = departments.filter(d =>
    (!form.businessUnitId || d.businessUnitId === form.businessUnitId) &&
    (!form.divisionId || d.divisionId === form.divisionId));
  const filteredFns = functions.filter(fn => !form.departmentId || fn.departmentId === form.departmentId);
  const filteredSubFns = subFunctions.filter(sf => !form.functionId || sf.functionId === form.functionId);
  const filteredTeams = teams.filter(t => !form.subFunctionId || t.subFunctionId === form.subFunctionId);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your workforce</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => downloadTemplate(businessUnits, departments, functions, designations, locations)}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
          >
            <Download className="h-4 w-4" /> CSV Template
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 border border-blue-200 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 text-sm font-medium"
          >
            <Upload className="h-4 w-4" /> Bulk Upload
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleBulkUpload} />
          <button
            onClick={() => { setShowModal(true); setEditingId(null); setActiveTab('Work Info'); setForm(makeDefaultForm()); setFormError(null); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> New Employee
          </button>
        </div>
      </div>

      {/* Bulk result banner */}
      {bulkResult && (
        <div className={`mb-4 p-4 rounded-lg border ${bulkResult.errors.length === 0 ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 font-medium text-sm mb-1">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                {bulkResult.created} employee{bulkResult.created !== 1 ? 's' : ''} created successfully
                {bulkResult.errors.length > 0 && <span className="text-amber-700">, {bulkResult.errors.length} failed</span>}
              </div>
              {bulkResult.errors.map(e => (
                <div key={e.row} className="text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" /> Row {e.row}: {e.error}
                </div>
              ))}
            </div>
            <button onClick={() => setBulkResult(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text" placeholder="Search employees..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="ON_LEAVE">On Leave</option>
          <option value="TERMINATED">Terminated</option>
          <option value="RESIGNED">Resigned</option>
        </select>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Code</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Name</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Designation</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Business Unit</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Department</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Joining Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Type</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600 whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-8 text-gray-400">No employees found</td></tr>
              ) : (
                employees.map(emp => (
                  <tr key={emp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-gray-700 whitespace-nowrap">{emp.employeeCode}</td>
                    <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                      {emp.firstName} {emp.middleName ? emp.middleName[0] + '. ' : ''}{emp.lastName}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{emp.email}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{getDesigName(emp.designationId)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{getBuName(emp.businessUnitId)}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{getDeptName(emp.departmentId)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{emp.dateOfJoining ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{emp.employmentType?.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[emp.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {emp.status?.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button onClick={() => startEdit(emp)} className="text-xs px-2.5 py-1 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium">Edit</button>
                      <button onClick={() => navigate('/engagement/letters', {
                        state: { prefill: { employeeId: emp.id, employeeName: `${emp.firstName} ${emp.lastName}`.trim() } },
                      })} className="text-xs px-2.5 py-1 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium ml-1">Letter</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* New Employee Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[92vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold">{editingId ? 'Edit Employee' : 'New Employee'}</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>

            {/* Tabs */}
            <div className="flex border-b flex-shrink-0 overflow-x-auto">
              {TABS.map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2.5 text-xs font-medium whitespace-nowrap transition-colors ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-800'}`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {formError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{formError}</div>}

                {/* ── Work Info ── */}
                {activeTab === 'Work Info' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={LABEL}>Employee Code *</label>
                        <input required value={form.employeeCode} onChange={e => setF({ employeeCode: e.target.value })} className={INPUT} placeholder="EMP-001" />
                      </div>
                      <div>
                        <label className={LABEL}>Date of Joining *</label>
                        <input required type="date" value={form.dateOfJoining} onChange={e => setF({ dateOfJoining: e.target.value })} className={INPUT} />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className={LABEL}>First Name *</label>
                        <input required value={form.firstName} onChange={e => setF({ firstName: e.target.value })} className={INPUT} />
                      </div>
                      {fc('middleName', 'Middle Name').enabled && (
                        <div>
                          <label className={LABEL}>{fc('middleName', 'Middle Name').label}{fc('middleName', 'Middle Name').required && ' *'}</label>
                          <input required={fc('middleName', 'Middle Name').required} value={form.middleName} onChange={e => setF({ middleName: e.target.value })} className={INPUT} />
                        </div>
                      )}
                      <div>
                        <label className={LABEL}>Last Name *</label>
                        <input required value={form.lastName} onChange={e => setF({ lastName: e.target.value })} className={INPUT} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={LABEL}>Work Email *</label>
                        <input required type="email" value={form.email} onChange={e => setF({ email: e.target.value })} className={INPUT} />
                      </div>
                      {fc('phone', 'Mobile Phone').enabled && (
                        <div>
                          <label className={LABEL}>{fc('phone', 'Mobile Phone').label}{fc('phone', 'Mobile Phone').required && ' *'}</label>
                          <input required={fc('phone', 'Mobile Phone').required} value={form.phone} onChange={e => setF({ phone: e.target.value })} className={INPUT} placeholder="+91-9999999999" />
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className={LABEL}>Employment Type</label>
                        <select value={form.employmentType} onChange={e => setF({ employmentType: e.target.value })} className={INPUT}>
                          <option value="FULL_TIME">Full Time</option>
                          <option value="PART_TIME">Part Time</option>
                          <option value="CONTRACT">Contract</option>
                          <option value="INTERN">Intern</option>
                        </select>
                      </div>
                      <div>
                        <label className={LABEL}>Status</label>
                        <select value={form.status} onChange={e => setF({ status: e.target.value })} className={INPUT}>
                          <option value="ACTIVE">Active</option>
                          <option value="ON_LEAVE">On Leave</option>
                        </select>
                      </div>
                    </div>
                    {(fc('probationEndDate', 'Probation End Date').enabled || fc('confirmationDate', 'Confirmation Date').enabled) && (
                      <div className="grid grid-cols-2 gap-4">
                        {fc('probationEndDate', 'Probation End Date').enabled && (
                          <div>
                            <label className={LABEL}>{fc('probationEndDate', 'Probation End Date').label}{fc('probationEndDate', 'Probation End Date').required && ' *'}</label>
                            <input required={fc('probationEndDate', 'Probation End Date').required} type="date" value={form.probationEndDate} onChange={e => setF({ probationEndDate: e.target.value })} className={INPUT} />
                          </div>
                        )}
                        {fc('confirmationDate', 'Confirmation Date').enabled && (
                          <div>
                            <label className={LABEL}>{fc('confirmationDate', 'Confirmation Date').label}{fc('confirmationDate', 'Confirmation Date').required && ' *'}</label>
                            <input required={fc('confirmationDate', 'Confirmation Date').required} type="date" value={form.confirmationDate} onChange={e => setF({ confirmationDate: e.target.value })} className={INPUT} />
                          </div>
                        )}
                      </div>
                    )}
                    {/* Org hierarchy — visibility and required state driven by tenant config */}
                    {(() => {
                      const le  = orgConfig['legalEntity']  ?? { enabled: true,  required: false };
                      const bu  = orgConfig['businessUnit'] ?? { enabled: true,  required: true  };
                      const div = orgConfig['division']     ?? { enabled: true,  required: false };
                      const dep = orgConfig['department']   ?? { enabled: true,  required: true  };
                      const fn  = orgConfig['function']     ?? { enabled: true,  required: true  };
                      const sf  = orgConfig['subFunction']  ?? { enabled: true,  required: false };
                      const tm  = orgConfig['team']         ?? { enabled: true,  required: false };
                      const orgLabel = (name: string, required: boolean) =>
                        required ? <>{name} <span className="text-red-500">*</span></> : <>{name} <span className="text-gray-400 font-normal text-xs">(optional)</span></>;
                      return (
                        <>
                          {(le.enabled || bu.enabled) && (
                            <div className="grid grid-cols-2 gap-4">
                              {le.enabled && (
                                <div>
                                  <label className={LABEL}>{orgLabel('Legal Entity', le.required)}</label>
                                  <select required={le.required} value={form.legalEntityId} onChange={e => setF({ legalEntityId: e.target.value, businessUnitId: '', divisionId: '', departmentId: '', functionId: '', subFunctionId: '', teamId: '' })} className={INPUT}>
                                    <option value="">Select Legal Entity...</option>
                                    {legalEntities.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                  </select>
                                </div>
                              )}
                              {bu.enabled && (
                                <div>
                                  <label className={LABEL}>{orgLabel('Business Unit', bu.required)}</label>
                                  <select required={bu.required} value={form.businessUnitId} onChange={e => setF({ businessUnitId: e.target.value, divisionId: '', departmentId: '', functionId: '', subFunctionId: '', teamId: '' })} className={INPUT}>
                                    <option value="">Select Business Unit...</option>
                                    {filteredBus.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          )}
                          {(div.enabled || dep.enabled) && (
                            <div className="grid grid-cols-2 gap-4">
                              {div.enabled && (
                                <div>
                                  <label className={LABEL}>{orgLabel('Division', div.required)}</label>
                                  <select required={div.required} value={form.divisionId} onChange={e => setF({ divisionId: e.target.value, departmentId: '', functionId: '', subFunctionId: '', teamId: '' })} className={INPUT}>
                                    <option value="">Select Division...</option>
                                    {filteredDivs.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                  </select>
                                </div>
                              )}
                              {dep.enabled && (
                                <div>
                                  <label className={LABEL}>{orgLabel('Department', dep.required)}</label>
                                  <select required={dep.required} value={form.departmentId} onChange={e => setF({ departmentId: e.target.value, functionId: '', subFunctionId: '', teamId: '' })} className={INPUT}>
                                    <option value="">Select Department...</option>
                                    {filteredDepts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          )}
                          {(fn.enabled || sf.enabled) && (
                            <div className="grid grid-cols-2 gap-4">
                              {fn.enabled && (
                                <div>
                                  <label className={LABEL}>{orgLabel('Function', fn.required)}</label>
                                  <select required={fn.required} value={form.functionId} onChange={e => setF({ functionId: e.target.value, subFunctionId: '', teamId: '' })} className={INPUT}>
                                    <option value="">Select Function...</option>
                                    {filteredFns.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                  </select>
                                </div>
                              )}
                              {sf.enabled && (
                                <div>
                                  <label className={LABEL}>{orgLabel('Sub Function', sf.required)}</label>
                                  <select required={sf.required} value={form.subFunctionId} onChange={e => setF({ subFunctionId: e.target.value, teamId: '' })} className={INPUT}>
                                    <option value="">None</option>
                                    {filteredSubFns.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          )}
                          {tm.enabled && (
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className={LABEL}>{orgLabel('Team', tm.required)}</label>
                                <select required={tm.required} value={form.teamId} onChange={e => setF({ teamId: e.target.value })} className={INPUT}>
                                  <option value="">None</option>
                                  {filteredTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                </select>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                    {(fc('designationId', 'Designation').enabled || fc('locationId', 'Location').enabled) && (
                      <div className="grid grid-cols-2 gap-4">
                        {fc('designationId', 'Designation').enabled && (
                          <div>
                            <label className={LABEL}>{fc('designationId', 'Designation').label}{fc('designationId', 'Designation').required && ' *'}</label>
                            <select required={fc('designationId', 'Designation').required} value={form.designationId} onChange={e => setF({ designationId: e.target.value })} className={INPUT}>
                              <option value="">Select Designation</option>
                              {designations.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                          </div>
                        )}
                        {fc('locationId', 'Location').enabled && (
                          <div>
                            <label className={LABEL}>{fc('locationId', 'Location').label}{fc('locationId', 'Location').required && ' *'}</label>
                            <select required={fc('locationId', 'Location').required} value={form.locationId} onChange={e => setF({ locationId: e.target.value })} className={INPUT}>
                              <option value="">Select Location</option>
                              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                    {fc('managerId', 'Reporting Manager').enabled && (
                      <div>
                        <label className={LABEL}>{fc('managerId', 'Reporting Manager').label}{fc('managerId', 'Reporting Manager').required && ' *'}</label>
                        <select required={fc('managerId', 'Reporting Manager').required} value={form.managerId} onChange={e => setF({ managerId: e.target.value })} className={INPUT}>
                          <option value="">None</option>
                          {allEmployees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</option>)}
                        </select>
                      </div>
                    )}
                  </>
                )}

                {/* ── Personal ── */}
                {activeTab === 'Personal' && (
                  <>
                    {(fc('dateOfBirth', 'Date of Birth').enabled || fc('gender', 'Gender').enabled) && (
                      <div className="grid grid-cols-2 gap-4">
                        {fc('dateOfBirth', 'Date of Birth').enabled && (
                          <div>
                            <label className={LABEL}>{fc('dateOfBirth', 'Date of Birth').label}{fc('dateOfBirth', 'Date of Birth').required && ' *'}</label>
                            <input required={fc('dateOfBirth', 'Date of Birth').required} type="date" value={form.dateOfBirth} onChange={e => setF({ dateOfBirth: e.target.value })} className={INPUT} />
                          </div>
                        )}
                        {fc('gender', 'Gender').enabled && (
                          <div>
                            <label className={LABEL}>{fc('gender', 'Gender').label}{fc('gender', 'Gender').required && ' *'}</label>
                            <select required={fc('gender', 'Gender').required} value={form.gender} onChange={e => setF({ gender: e.target.value })} className={INPUT}>
                              <option value="">Select</option>
                              <option value="MALE">Male</option>
                              <option value="FEMALE">Female</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                    {(fc('maritalStatus', 'Marital Status').enabled || fc('bloodGroup', 'Blood Group').enabled) && (
                      <div className="grid grid-cols-2 gap-4">
                        {fc('maritalStatus', 'Marital Status').enabled && (
                          <div>
                            <label className={LABEL}>{fc('maritalStatus', 'Marital Status').label}{fc('maritalStatus', 'Marital Status').required && ' *'}</label>
                            <select required={fc('maritalStatus', 'Marital Status').required} value={form.maritalStatus} onChange={e => setF({ maritalStatus: e.target.value })} className={INPUT}>
                              <option value="">Select</option>
                              <option value="SINGLE">Single</option>
                              <option value="MARRIED">Married</option>
                              <option value="DIVORCED">Divorced</option>
                              <option value="WIDOWED">Widowed</option>
                            </select>
                          </div>
                        )}
                        {fc('bloodGroup', 'Blood Group').enabled && (
                          <div>
                            <label className={LABEL}>{fc('bloodGroup', 'Blood Group').label}{fc('bloodGroup', 'Blood Group').required && ' *'}</label>
                            <select required={fc('bloodGroup', 'Blood Group').required} value={form.bloodGroup} onChange={e => setF({ bloodGroup: e.target.value })} className={INPUT}>
                              <option value="">Select</option>
                              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                    )}
                    {(fc('nationality', 'Nationality').enabled || fc('personalEmail', 'Personal Email').enabled) && (
                      <div className="grid grid-cols-2 gap-4">
                        {fc('nationality', 'Nationality').enabled && (
                          <div>
                            <label className={LABEL}>{fc('nationality', 'Nationality').label}{fc('nationality', 'Nationality').required && ' *'}</label>
                            <input required={fc('nationality', 'Nationality').required} value={form.nationality} onChange={e => setF({ nationality: e.target.value })} className={INPUT} placeholder="Indian" />
                          </div>
                        )}
                        {fc('personalEmail', 'Personal Email').enabled && (
                          <div>
                            <label className={LABEL}>{fc('personalEmail', 'Personal Email').label}{fc('personalEmail', 'Personal Email').required && ' *'}</label>
                            <input required={fc('personalEmail', 'Personal Email').required} type="email" value={form.personalEmail} onChange={e => setF({ personalEmail: e.target.value })} className={INPUT} />
                          </div>
                        )}
                      </div>
                    )}
                    {(fc('homePhone', 'Home Phone').enabled || fc('pan', 'PAN').enabled) && (
                      <div className="grid grid-cols-2 gap-4">
                        {fc('homePhone', 'Home Phone').enabled && (
                          <div>
                            <label className={LABEL}>{fc('homePhone', 'Home Phone').label}{fc('homePhone', 'Home Phone').required && ' *'}</label>
                            <input required={fc('homePhone', 'Home Phone').required} value={form.homePhone} onChange={e => setF({ homePhone: e.target.value })} className={INPUT} />
                          </div>
                        )}
                        {fc('pan', 'PAN').enabled && (
                          <div>
                            <label className={LABEL}>{fc('pan', 'PAN').label}{fc('pan', 'PAN').required && ' *'}</label>
                            <input required={fc('pan', 'PAN').required} value={form.pan} onChange={e => setF({ pan: e.target.value })} className={INPUT} placeholder="ABCDE1234F" />
                          </div>
                        )}
                      </div>
                    )}
                    {(fc('aadhar', 'Aadhar').enabled || fc('passportNumber', 'Passport Number').enabled) && (
                      <div className="grid grid-cols-2 gap-4">
                        {fc('aadhar', 'Aadhar').enabled && (
                          <div>
                            <label className={LABEL}>{fc('aadhar', 'Aadhar').label}{fc('aadhar', 'Aadhar').required && ' *'}</label>
                            <input required={fc('aadhar', 'Aadhar').required} value={form.aadhar} onChange={e => setF({ aadhar: e.target.value })} className={INPUT} placeholder="XXXX XXXX XXXX" />
                          </div>
                        )}
                        {fc('passportNumber', 'Passport Number').enabled && (
                          <div>
                            <label className={LABEL}>{fc('passportNumber', 'Passport Number').label}{fc('passportNumber', 'Passport Number').required && ' *'}</label>
                            <input required={fc('passportNumber', 'Passport Number').required} value={form.passportNumber} onChange={e => setF({ passportNumber: e.target.value })} className={INPUT} />
                          </div>
                        )}
                      </div>
                    )}
                    {fc('passportExpiry', 'Passport Expiry').enabled && (
                      <div>
                        <label className={LABEL}>{fc('passportExpiry', 'Passport Expiry').label}{fc('passportExpiry', 'Passport Expiry').required && ' *'}</label>
                        <input required={fc('passportExpiry', 'Passport Expiry').required} type="date" value={form.passportExpiry} onChange={e => setF({ passportExpiry: e.target.value })} className={INPUT} />
                      </div>
                    )}
                  </>
                )}

                {/* ── Address ── */}
                {activeTab === 'Address' && (
                  <>
                    {fc('currentAddress', 'Current Address').enabled && (
                      <>
                        <p className="text-sm font-semibold text-gray-700">{fc('currentAddress', 'Current Address').label}{fc('currentAddress', 'Current Address').required && ' *'}</p>
                        <div>
                          <label className={LABEL}>Address Line 1</label>
                          <input value={form.currentAddressLine1} onChange={e => setF({ currentAddressLine1: e.target.value })} className={INPUT} />
                        </div>
                        <div>
                          <label className={LABEL}>Address Line 2</label>
                          <input value={form.currentAddressLine2} onChange={e => setF({ currentAddressLine2: e.target.value })} className={INPUT} />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className={LABEL}>City</label>
                            <input value={form.currentCity} onChange={e => setF({ currentCity: e.target.value })} className={INPUT} />
                          </div>
                          <div>
                            <label className={LABEL}>State</label>
                            <input value={form.currentState} onChange={e => setF({ currentState: e.target.value })} className={INPUT} />
                          </div>
                          <div>
                            <label className={LABEL}>Country</label>
                            <input value={form.currentCountry} onChange={e => setF({ currentCountry: e.target.value })} className={INPUT} />
                          </div>
                        </div>
                        <div>
                          <label className={LABEL}>Pincode</label>
                          <input value={form.currentPincode} onChange={e => setF({ currentPincode: e.target.value })} className={INPUT} />
                        </div>
                      </>
                    )}

                    {fc('permanentAddress', 'Permanent Address').enabled && (
                      <>
                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                          <p className="text-sm font-semibold text-gray-700">{fc('permanentAddress', 'Permanent Address').label}{fc('permanentAddress', 'Permanent Address').required && ' *'}</p>
                          {fc('currentAddress', 'Current Address').enabled && (
                            <button type="button" className="text-xs text-blue-600 hover:underline"
                              onClick={() => setF({
                                permanentAddressLine1: form.currentAddressLine1,
                                permanentAddressLine2: form.currentAddressLine2,
                                permanentCity: form.currentCity,
                                permanentState: form.currentState,
                                permanentCountry: form.currentCountry,
                                permanentPincode: form.currentPincode,
                              })}>
                              Same as current
                            </button>
                          )}
                        </div>
                        <div>
                          <label className={LABEL}>Address Line 1</label>
                          <input value={form.permanentAddressLine1} onChange={e => setF({ permanentAddressLine1: e.target.value })} className={INPUT} />
                        </div>
                        <div>
                          <label className={LABEL}>Address Line 2</label>
                          <input value={form.permanentAddressLine2} onChange={e => setF({ permanentAddressLine2: e.target.value })} className={INPUT} />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className={LABEL}>City</label>
                            <input value={form.permanentCity} onChange={e => setF({ permanentCity: e.target.value })} className={INPUT} />
                          </div>
                          <div>
                            <label className={LABEL}>State</label>
                            <input value={form.permanentState} onChange={e => setF({ permanentState: e.target.value })} className={INPUT} />
                          </div>
                          <div>
                            <label className={LABEL}>Country</label>
                            <input value={form.permanentCountry} onChange={e => setF({ permanentCountry: e.target.value })} className={INPUT} />
                          </div>
                        </div>
                        <div>
                          <label className={LABEL}>Pincode</label>
                          <input value={form.permanentPincode} onChange={e => setF({ permanentPincode: e.target.value })} className={INPUT} />
                        </div>
                      </>
                    )}
                  </>
                )}

                {/* ── Emergency Contact ── */}
                {activeTab === 'Emergency' && (
                  <>
                    {fc('emergencyContact', 'Emergency Contact').enabled ? (
                      <>
                        <div>
                          <label className={LABEL}>Contact Name{fc('emergencyContact', 'Emergency Contact').required && ' *'}</label>
                          <input required={fc('emergencyContact', 'Emergency Contact').required} value={form.emergencyContactName} onChange={e => setF({ emergencyContactName: e.target.value })} className={INPUT} placeholder="Jane Doe" />
                        </div>
                        <div>
                          <label className={LABEL}>Relationship</label>
                          <input value={form.emergencyContactRelation} onChange={e => setF({ emergencyContactRelation: e.target.value })} className={INPUT} placeholder="Spouse, Parent, Sibling..." />
                        </div>
                        <div>
                          <label className={LABEL}>Phone Number</label>
                          <input value={form.emergencyContactPhone} onChange={e => setF({ emergencyContactPhone: e.target.value })} className={INPUT} placeholder="+91-9999999999" />
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 py-4 text-center">Emergency contact is disabled for this organisation.</p>
                    )}
                  </>
                )}

                {/* ── Banking ── */}
                {activeTab === 'Banking' && (
                  <>
                    {fc('bankDetails', 'Bank Details').enabled ? (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className={LABEL}>Bank Name{fc('bankDetails', 'Bank Details').required && ' *'}</label>
                            <input required={fc('bankDetails', 'Bank Details').required} value={form.bankName} onChange={e => setF({ bankName: e.target.value })} className={INPUT} placeholder="HDFC Bank" />
                          </div>
                          <div>
                            <label className={LABEL}>Branch</label>
                            <input value={form.bankBranch} onChange={e => setF({ bankBranch: e.target.value })} className={INPUT} />
                          </div>
                        </div>
                        <div>
                          <label className={LABEL}>Account Number</label>
                          <input value={form.bankAccountNumber} onChange={e => setF({ bankAccountNumber: e.target.value })} className={INPUT} />
                        </div>
                        <div>
                          <label className={LABEL}>IFSC Code</label>
                          <input value={form.bankIfsc} onChange={e => setF({ bankIfsc: e.target.value })} className={INPUT} placeholder="HDFC0001234" />
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-gray-400 py-4 text-center">Bank details are disabled for this organisation.</p>
                    )}
                  </>
                )}

                {/* ── Login Account ── */}
                {activeTab === 'Login Account' && (
                  <>
                    <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-800">
                      Creating a login account lets this employee sign in to the ERP. They will be automatically assigned the <strong>Employee</strong> role with access to self-service, leave, attendance, and payslips.
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.createLoginAccount}
                        onChange={e => setF({ createLoginAccount: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Create login account for this employee</span>
                    </label>
                    {form.createLoginAccount && (
                      <div>
                        <label className={LABEL}>Temporary Password *</label>
                        <input
                          type="password"
                          minLength={8}
                          required={form.createLoginAccount}
                          value={form.loginPassword}
                          onChange={e => setF({ loginPassword: e.target.value })}
                          className={INPUT}
                          placeholder="At least 8 characters"
                        />
                        <p className="text-xs text-gray-400 mt-1">Login email will be the employee's work email: <strong>{form.email || '(enter work email first)'}</strong></p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="flex gap-3 p-5 border-t flex-shrink-0">
                <button type="button" onClick={closeModal} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{submitting ? (editingId ? 'Saving...' : 'Creating...') : (editingId ? 'Save Changes' : 'Create Employee')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
