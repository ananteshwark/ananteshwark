import React, { useState, useEffect, useCallback } from 'react';
import { licensingApi } from '../../api/licensing';
import {
  Key, FileText, Users, Package, BarChart2, Receipt, ShieldCheck,
  Plus, Trash2, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';

type Tab = 'dashboard' | 'contracts' | 'modules' | 'assignments' | 'invoices' | 'consumption' | 'validate';

const STATUS_COLORS: Record<string, string> = {
  TRIAL: 'bg-blue-100 text-blue-800',
  ACTIVE: 'bg-green-100 text-green-800',
  SUSPENDED: 'bg-yellow-100 text-yellow-800',
  EXPIRED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-700',
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-800',
  PAID: 'bg-green-100 text-green-800',
  OVERDUE: 'bg-red-100 text-red-800',
  VOID: 'bg-gray-100 text-gray-500 line-through',
};

const LICENSE_TYPE_LABELS: Record<string, string> = {
  EMPLOYEE_BASED: 'Employee-Based',
  EMPLOYEE_PER_MODULE: 'Per-Module',
  ENTERPRISE_CONSUMPTION: 'Enterprise Pool',
};

const COMMON_MODULES = ['hr', 'payroll', 'recruitment', 'attendance', 'learning', 'performance', 'analytics', 'api'];

function StatCard({ label, value, sub, color = 'blue' }: { label: string; value: string | number; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    blue: 'text-blue-600', green: 'text-green-600', purple: 'text-purple-600',
    red: 'text-red-600', yellow: 'text-yellow-600', gray: 'text-gray-600',
  };
  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colors[color] || colors.blue}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

export const LicensingPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [dashboard, setDashboard] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [moduleLicenses, setModuleLicenses] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [consumption, setConsumption] = useState<any[]>([]);
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Modals
  const [showContractModal, setShowContractModal] = useState(false);
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showConsumptionModal, setShowConsumptionModal] = useState(false);

  // Validation
  const [validateForm, setValidateForm] = useState({ employeeId: '', moduleKey: '' });
  const [validateResult, setValidateResult] = useState<any>(null);

  // Filters
  const [consumptionPeriod, setConsumptionPeriod] = useState('');
  const [assignmentModule, setAssignmentModule] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, plns, conts, mods, asns, invs, cons] = await Promise.all([
        licensingApi.getDashboard(),
        licensingApi.getPlans(),
        licensingApi.getContracts(),
        licensingApi.getModuleLicenses(),
        licensingApi.getAssignments(),
        licensingApi.getInvoices(),
        licensingApi.getConsumption(),
      ]);
      setDashboard(dash.data);
      setPlans(plns.data?.data || plns.data || []);
      setContracts(conts.data?.data || conts.data || []);
      setModuleLicenses(mods.data?.data || mods.data || []);
      setAssignments(asns.data?.data || asns.data || []);
      setInvoices(invs.data?.data || invs.data || []);
      setConsumption(cons.data?.data || cons.data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const fetchAssignments = async (moduleKey?: string) => {
    const res = await licensingApi.getAssignments(moduleKey);
    setAssignments(res.data?.data || res.data || []);
  };

  const fetchConsumption = async (period?: string) => {
    const res = await licensingApi.getConsumption(period ? { periodMonth: period } : {});
    setConsumption(res.data?.data || res.data || []);
  };

  const handleContractStatusUpdate = async (id: string, status: string) => {
    await licensingApi.updateContractStatus(id, status);
    fetchAll();
  };

  const handleRevokeModule = async (id: string) => {
    await licensingApi.revokeModuleLicense(id);
    fetchAll();
  };

  const handleRevokeAssignment = async (id: string) => {
    await licensingApi.revokeAssignment(id);
    fetchAll();
  };

  const handleInvoiceStatus = async (id: string, status: string) => {
    await licensingApi.updateInvoiceStatus(id, status);
    fetchAll();
  };

  const handleViewInvoice = async (id: string) => {
    if (expandedInvoice === id) { setExpandedInvoice(null); setInvoiceDetail(null); return; }
    const res = await licensingApi.getInvoice(id);
    setInvoiceDetail(res.data);
    setExpandedInvoice(id);
  };

  const handleValidate = async () => {
    if (!validateForm.employeeId) return;
    try {
      const res = await licensingApi.validateAccess(validateForm);
      setValidateResult(res.data);
    } catch (e: any) {
      setValidateResult({ allowed: false, reason: e.response?.data?.message || 'Error', action: 'HARD_BLOCK' });
    }
  };

  const handleContractSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const licenseType = f.get('licenseType') as string;
    const data: any = {
      planId: f.get('planId'),
      licenseType,
      billingCycle: f.get('billingCycle'),
      contractStartDate: f.get('contractStartDate'),
      contractEndDate: f.get('contractEndDate'),
      billingContactEmail: f.get('billingContactEmail'),
      currency: f.get('currency') || 'USD',
      minCommitmentEmployees: parseInt(f.get('minCommitmentEmployees') as string) || 0,
    };
    if (licenseType === 'ENTERPRISE_CONSUMPTION') {
      data.committedAmount = parseFloat(f.get('committedAmount') as string);
      data.consumptionPoolUnits = parseFloat(f.get('consumptionPoolUnits') as string);
    }
    await licensingApi.createContract(data);
    setShowContractModal(false);
    fetchAll();
  };

  const handleModuleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const key = f.get('moduleKey') as string;
    await licensingApi.assignModuleLicense({
      contractId: f.get('contractId'),
      moduleKey: key,
      moduleName: key.charAt(0).toUpperCase() + key.slice(1),
      maxEmployees: f.get('maxEmployees') ? parseInt(f.get('maxEmployees') as string) : null,
      unitPrice: parseFloat(f.get('unitPrice') as string),
      effectiveFrom: f.get('effectiveFrom'),
    });
    setShowModuleModal(false);
    fetchAll();
  };

  const handleAssignSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await licensingApi.assignEmployee({
      employeeId: f.get('employeeId'),
      employeeName: f.get('employeeName'),
      moduleKey: f.get('moduleKey'),
    });
    setShowAssignModal(false);
    fetchAll();
  };

  const handleBulkSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const moduleKey = f.get('moduleKey') as string;
    const raw = (f.get('employees') as string).split('\n').map(l => l.trim()).filter(Boolean);
    const employeeIds = raw.map(line => {
      const [id, ...nameParts] = line.split(':');
      return { employeeId: id.trim(), employeeName: nameParts.join(':').trim() || id.trim() };
    });
    await licensingApi.bulkAssignEmployees({ moduleKey, employeeIds });
    setShowBulkModal(false);
    fetchAll();
  };

  const handleInvoiceSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await licensingApi.generateInvoice({
      contractId: f.get('contractId'),
      periodStart: f.get('periodStart'),
      periodEnd: f.get('periodEnd'),
      taxRate: parseFloat(f.get('taxRate') as string) || 0,
    });
    setShowInvoiceModal(false);
    fetchAll();
  };

  const handleConsumptionSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await licensingApi.recordConsumption({
      periodMonth: f.get('periodMonth'),
      consumptionType: f.get('consumptionType'),
      moduleKey: f.get('moduleKey') || undefined,
      activeEmployees: parseInt(f.get('activeEmployees') as string),
      unitsConsumed: parseFloat(f.get('unitsConsumed') as string),
      unitRate: parseFloat(f.get('unitRate') as string),
    });
    setShowConsumptionModal(false);
    fetchAll();
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: <BarChart2 className="h-4 w-4" /> },
    { key: 'contracts', label: 'Contracts', icon: <FileText className="h-4 w-4" /> },
    { key: 'modules', label: 'Modules', icon: <Package className="h-4 w-4" /> },
    { key: 'assignments', label: 'Assignments', icon: <Users className="h-4 w-4" /> },
    { key: 'invoices', label: 'Invoices', icon: <Receipt className="h-4 w-4" /> },
    { key: 'consumption', label: 'Consumption', icon: <TrendingUp className="h-4 w-4" /> },
    { key: 'validate', label: 'Validate Access', icon: <ShieldCheck className="h-4 w-4" /> },
  ];

  const activeContract = contracts.find((c: any) => c.status === 'ACTIVE');

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Licensing & Subscriptions</h1>
          <p className="text-sm text-gray-500 mt-1">Manage license contracts, entitlements, billing, and consumption</p>
        </div>
        <button onClick={fetchAll} className="flex items-center gap-1 px-3 py-1.5 border rounded text-sm text-gray-600 hover:bg-gray-50">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-1 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              activeTab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-12 text-gray-400">Loading...</div>}

      {/* ── DASHBOARD ─────────────────────────────────────────────────────────── */}
      {activeTab === 'dashboard' && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard label="Active Employees" value={dashboard?.activeEmployees ?? '—'} color="blue" />
            <StatCard label="Licensed Employees" value={dashboard?.licensedEmployees ?? '—'} color="purple" />
            <StatCard label="Modules Enabled" value={dashboard?.modulesEnabled ?? '—'} color="green" />
            <StatCard label="Monthly Cost" value={dashboard?.monthlyCost != null ? `$${Number(dashboard.monthlyCost).toLocaleString()}` : '—'} color="yellow" />
            <StatCard label="Remaining Balance" value={dashboard?.remainingUnits != null ? Number(dashboard.remainingUnits).toLocaleString() : '—'} sub="units" color="gray" />
            <StatCard label="Days to Expiry" value={dashboard?.daysToExpiry ?? '—'} color={dashboard?.daysToExpiry < 30 ? 'red' : 'green'} />
          </div>

          {/* Utilization Bar */}
          {dashboard?.utilizationPct != null && (
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">License Utilization</span>
                <span className={`text-sm font-bold ${dashboard.utilizationPct >= 90 ? 'text-red-600' : dashboard.utilizationPct >= 75 ? 'text-yellow-600' : 'text-green-600'}`}>
                  {dashboard.utilizationPct.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all ${dashboard.utilizationPct >= 90 ? 'bg-red-500' : dashboard.utilizationPct >= 75 ? 'bg-yellow-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(dashboard.utilizationPct, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Active Contract Summary */}
          {activeContract && (
            <div className="bg-white rounded-lg border p-4">
              <h3 className="font-semibold text-sm text-gray-700 mb-3">Active Contract</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><span className="text-gray-500">Number:</span><div className="font-mono font-medium">{activeContract.contractNumber}</div></div>
                <div><span className="text-gray-500">Type:</span><div className="font-medium">{LICENSE_TYPE_LABELS[activeContract.licenseType]}</div></div>
                <div><span className="text-gray-500">Billing:</span><div className="font-medium">{activeContract.billingCycle}</div></div>
                <div><span className="text-gray-500">Expires:</span><div className={`font-medium ${activeContract.contractEndDate && new Date(activeContract.contractEndDate) < new Date(Date.now() + 30 * 86400000) ? 'text-red-600' : ''}`}>{activeContract.contractEndDate ? new Date(activeContract.contractEndDate).toLocaleDateString() : '—'}</div></div>
              </div>
            </div>
          )}

          {/* Snapshots Table */}
          {dashboard?.snapshots?.length > 0 && (
            <div className="bg-white rounded-lg border">
              <div className="p-4 border-b"><h3 className="font-semibold text-sm">Monthly Usage (Last 6 Months)</h3></div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs">
                  <tr>
                    <th className="px-4 py-2 text-left">Month</th>
                    <th className="px-4 py-2 text-right">Active Employees</th>
                    <th className="px-4 py-2 text-right">Total Units</th>
                    <th className="px-4 py-2 text-right">Total Cost</th>
                    <th className="px-4 py-2 text-right">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {dashboard.snapshots.map((s: any) => (
                    <tr key={s.snapshotMonth} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono">{s.snapshotMonth}</td>
                      <td className="px-4 py-2 text-right">{s.activeEmployees?.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right">{Number(s.totalUnits).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right font-medium">${Number(s.totalCost).toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{s.remainingUnits != null ? Number(s.remainingUnits).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── CONTRACTS ─────────────────────────────────────────────────────────── */}
      {activeTab === 'contracts' && !loading && (
        <div className="bg-white rounded-lg border">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold">License Contracts</h2>
            <button onClick={() => setShowContractModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              <Plus className="h-3.5 w-3.5" /> New Contract
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-left">Contract #</th>
                <th className="px-4 py-2 text-left">License Type</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Billing</th>
                <th className="px-4 py-2 text-left">Start</th>
                <th className="px-4 py-2 text-left">Expiry</th>
                <th className="px-4 py-2 text-left">Currency</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {contracts.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-medium">{c.contractNumber}</td>
                  <td className="px-4 py-3"><span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-xs">{LICENSE_TYPE_LABELS[c.licenseType] || c.licenseType}</span></td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[c.status] || 'bg-gray-100 text-gray-700'}`}>{c.status}</span></td>
                  <td className="px-4 py-3 text-gray-600">{c.billingCycle}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{c.contractStartDate ? new Date(c.contractStartDate).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3 text-xs">{c.contractEndDate ? new Date(c.contractEndDate).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{c.currency}</td>
                  <td className="px-4 py-3 flex gap-2 text-xs">
                    {c.status === 'TRIAL' && <button onClick={() => handleContractStatusUpdate(c.id, 'ACTIVE')} className="text-green-600 hover:underline">Activate</button>}
                    {c.status === 'ACTIVE' && <button onClick={() => handleContractStatusUpdate(c.id, 'SUSPENDED')} className="text-yellow-600 hover:underline">Suspend</button>}
                    {c.status === 'SUSPENDED' && <button onClick={() => handleContractStatusUpdate(c.id, 'ACTIVE')} className="text-blue-600 hover:underline">Reactivate</button>}
                    {['TRIAL', 'ACTIVE', 'SUSPENDED'].includes(c.status) && <button onClick={() => handleContractStatusUpdate(c.id, 'CANCELLED')} className="text-red-500 hover:underline">Cancel</button>}
                  </td>
                </tr>
              ))}
              {contracts.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No contracts found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MODULES ───────────────────────────────────────────────────────────── */}
      {activeTab === 'modules' && !loading && (
        <div className="bg-white rounded-lg border">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold">Module Licenses</h2>
            <button onClick={() => setShowModuleModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              <Plus className="h-3.5 w-3.5" /> Assign Module
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-left">Module</th>
                <th className="px-4 py-2 text-left">Contract</th>
                <th className="px-4 py-2 text-right">Max Employees</th>
                <th className="px-4 py-2 text-right">Unit Price</th>
                <th className="px-4 py-2 text-left">Effective From</th>
                <th className="px-4 py-2 text-left">Effective To</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {moduleLicenses.map((m: any) => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3"><span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs font-mono">{m.moduleKey}</span> <span className="text-gray-600 ml-1">{m.moduleName}</span></td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{m.contractId?.slice(0, 8)}…</td>
                  <td className="px-4 py-3 text-right">{m.maxEmployees ?? 'Unlimited'}</td>
                  <td className="px-4 py-3 text-right font-medium">${Number(m.unitPrice).toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{m.effectiveFrom ? new Date(m.effectiveFrom).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{m.effectiveTo ? new Date(m.effectiveTo).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">{m.isActive ? <span className="text-green-600 text-xs font-medium">Active</span> : <span className="text-gray-400 text-xs">Revoked</span>}</td>
                  <td className="px-4 py-3">
                    {m.isActive && <button onClick={() => handleRevokeModule(m.id)} className="flex items-center gap-1 text-red-500 hover:underline text-xs"><Trash2 className="h-3 w-3" /> Revoke</button>}
                  </td>
                </tr>
              ))}
              {moduleLicenses.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No module licenses assigned</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ASSIGNMENTS ───────────────────────────────────────────────────────── */}
      {activeTab === 'assignments' && !loading && (
        <div className="bg-white rounded-lg border">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold">Employee Module Assignments</h2>
              <select
                value={assignmentModule}
                onChange={e => { setAssignmentModule(e.target.value); fetchAssignments(e.target.value || undefined); }}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="">All Modules</option>
                {COMMON_MODULES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowBulkModal(true)} className="flex items-center gap-1 px-3 py-1.5 border rounded text-sm hover:bg-gray-50">
                <Users className="h-3.5 w-3.5" /> Bulk Assign
              </button>
              <button onClick={() => setShowAssignModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                <Plus className="h-3.5 w-3.5" /> Assign Employee
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-left">Employee</th>
                <th className="px-4 py-2 text-left">Employee ID</th>
                <th className="px-4 py-2 text-left">Module</th>
                <th className="px-4 py-2 text-left">Assigned At</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {assignments.map((a: any) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{a.employeeName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{a.employeeId}</td>
                  <td className="px-4 py-3"><span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-xs">{a.moduleKey}</span></td>
                  <td className="px-4 py-3 text-xs text-gray-500">{a.assignedAt ? new Date(a.assignedAt).toLocaleDateString() : '—'}</td>
                  <td className="px-4 py-3">{a.isActive ? <span className="text-green-600 text-xs font-medium">Active</span> : <span className="text-gray-400 text-xs">Revoked</span>}</td>
                  <td className="px-4 py-3">
                    {a.isActive && <button onClick={() => handleRevokeAssignment(a.id)} className="flex items-center gap-1 text-red-500 hover:underline text-xs"><Trash2 className="h-3 w-3" /> Revoke</button>}
                  </td>
                </tr>
              ))}
              {assignments.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No assignments found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── INVOICES ──────────────────────────────────────────────────────────── */}
      {activeTab === 'invoices' && !loading && (
        <div className="bg-white rounded-lg border">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold">Invoices</h2>
            <button onClick={() => setShowInvoiceModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              <Plus className="h-3.5 w-3.5" /> Generate Invoice
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-left">Invoice #</th>
                <th className="px-4 py-2 text-left">Period</th>
                <th className="px-4 py-2 text-right">Subtotal</th>
                <th className="px-4 py-2 text-right">Tax</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Due Date</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv: any) => (
                <React.Fragment key={inv.id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-medium">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{inv.periodStart ? new Date(inv.periodStart).toLocaleDateString() : ''} – {inv.periodEnd ? new Date(inv.periodEnd).toLocaleDateString() : ''}</td>
                    <td className="px-4 py-3 text-right">${Number(inv.subtotal).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">${Number(inv.taxAmount).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-bold">${Number(inv.totalAmount).toFixed(2)}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[inv.status] || 'bg-gray-100 text-gray-700'}`}>{inv.status}</span></td>
                    <td className="px-4 py-3 text-xs text-gray-500">{inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3 flex gap-2 text-xs flex-wrap">
                      <button onClick={() => handleViewInvoice(inv.id)} className="text-blue-600 hover:underline">{expandedInvoice === inv.id ? 'Hide' : 'View'}</button>
                      {inv.status === 'DRAFT' && <button onClick={() => handleInvoiceStatus(inv.id, 'SENT')} className="text-blue-600 hover:underline">Send</button>}
                      {inv.status === 'SENT' && <button onClick={() => handleInvoiceStatus(inv.id, 'PAID')} className="text-green-600 hover:underline">Mark Paid</button>}
                      {['DRAFT', 'SENT'].includes(inv.status) && <button onClick={() => handleInvoiceStatus(inv.id, 'VOID')} className="text-red-500 hover:underline">Void</button>}
                    </td>
                  </tr>
                  {expandedInvoice === inv.id && invoiceDetail && (
                    <tr>
                      <td colSpan={8} className="px-4 pb-4 bg-gray-50">
                        <div className="text-xs font-semibold text-gray-500 mb-2 mt-1">Line Items</div>
                        <table className="w-full text-xs border rounded">
                          <thead className="bg-white text-gray-500">
                            <tr>
                              <th className="px-3 py-1.5 text-left">Description</th>
                              <th className="px-3 py-1.5 text-left">Type</th>
                              <th className="px-3 py-1.5 text-right">Qty</th>
                              <th className="px-3 py-1.5 text-right">Unit Price</th>
                              <th className="px-3 py-1.5 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {(invoiceDetail.lineItems || []).map((li: any) => (
                              <tr key={li.id}>
                                <td className="px-3 py-1.5">{li.description}</td>
                                <td className="px-3 py-1.5"><span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded">{li.lineType}</span></td>
                                <td className="px-3 py-1.5 text-right">{Number(li.quantity).toLocaleString()}</td>
                                <td className="px-3 py-1.5 text-right">${Number(li.unitPrice).toFixed(4)}</td>
                                <td className="px-3 py-1.5 text-right font-medium">${Number(li.amount).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {invoices.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No invoices found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CONSUMPTION ───────────────────────────────────────────────────────── */}
      {activeTab === 'consumption' && !loading && (
        <div className="bg-white rounded-lg border">
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center gap-3">
              <h2 className="font-semibold">Consumption Records</h2>
              <input
                type="month"
                value={consumptionPeriod}
                onChange={e => { setConsumptionPeriod(e.target.value); fetchConsumption(e.target.value || undefined); }}
                className="border rounded px-2 py-1 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={async () => {
                const m = prompt('Snapshot month (YYYY-MM):');
                if (m) { await licensingApi.takeSnapshot(m); fetchAll(); }
              }} className="flex items-center gap-1 px-3 py-1.5 border rounded text-sm hover:bg-gray-50">
                <RefreshCw className="h-3.5 w-3.5" /> Take Snapshot
              </button>
              <button onClick={() => setShowConsumptionModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                <Plus className="h-3.5 w-3.5" /> Record Consumption
              </button>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-left">Period</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Module</th>
                <th className="px-4 py-2 text-right">Employees</th>
                <th className="px-4 py-2 text-right">Units Consumed</th>
                <th className="px-4 py-2 text-right">Unit Rate</th>
                <th className="px-4 py-2 text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {consumption.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono">{c.periodMonth}</td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded text-xs ${c.consumptionType === 'EMPLOYEE' ? 'bg-blue-100 text-blue-800' : c.consumptionType === 'MODULE' ? 'bg-purple-100 text-purple-800' : 'bg-red-100 text-red-800'}`}>{c.consumptionType}</span></td>
                  <td className="px-4 py-3 text-gray-500">{c.moduleKey || '—'}</td>
                  <td className="px-4 py-3 text-right">{c.activeEmployees?.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-medium">{Number(c.unitsConsumed).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-500">${Number(c.unitRate).toFixed(4)}</td>
                  <td className="px-4 py-3 text-right font-bold">${Number(c.totalCost).toFixed(2)}</td>
                </tr>
              ))}
              {consumption.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No consumption records found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ── VALIDATE ACCESS ───────────────────────────────────────────────────── */}
      {activeTab === 'validate' && !loading && (
        <div className="max-w-lg space-y-4">
          <div className="bg-white rounded-lg border p-6">
            <h2 className="font-semibold mb-4">Real-Time License Validation</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Employee ID</label>
                <input
                  value={validateForm.employeeId}
                  onChange={e => setValidateForm(p => ({ ...p, employeeId: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="e.g. emp-uuid-here"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Module Key (optional)</label>
                <select
                  value={validateForm.moduleKey}
                  onChange={e => setValidateForm(p => ({ ...p, moduleKey: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="">— Employee-level check only —</option>
                  {COMMON_MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <button onClick={handleValidate} className="w-full py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 flex items-center justify-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Validate Access
              </button>
            </div>
          </div>

          {validateResult && (
            <div className={`rounded-lg border p-4 ${validateResult.allowed ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'}`}>
              <div className="flex items-center gap-2 mb-2">
                {validateResult.allowed
                  ? <CheckCircle className="h-5 w-5 text-green-600" />
                  : <XCircle className="h-5 w-5 text-red-600" />
                }
                <span className={`font-bold text-lg ${validateResult.allowed ? 'text-green-700' : 'text-red-700'}`}>
                  {validateResult.allowed ? 'ACCESS ALLOWED' : 'ACCESS BLOCKED'}
                </span>
              </div>
              <div className="text-sm space-y-1">
                <div><span className="text-gray-500">Action:</span> <span className={`font-medium px-2 py-0.5 rounded text-xs ${validateResult.action === 'ALLOW' ? 'bg-green-200 text-green-800' : validateResult.action === 'WARN' ? 'bg-yellow-200 text-yellow-800' : 'bg-red-200 text-red-800'}`}>{validateResult.action}</span></div>
                {validateResult.reason && <div><span className="text-gray-500">Reason:</span> <span className="text-gray-700">{validateResult.reason}</span></div>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MODALS ────────────────────────────────────────────────────────────── */}

      {/* Contract Modal */}
      {showContractModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">New License Contract</h3>
            <form onSubmit={handleContractSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">License Plan</label>
                <select name="planId" required className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">Select plan...</option>
                  {plans.map((p: any) => <option key={p.id} value={p.id}>{p.name} ({LICENSE_TYPE_LABELS[p.licenseType]})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">License Type</label>
                <select name="licenseType" required className="w-full border rounded px-3 py-2 text-sm">
                  <option value="EMPLOYEE_BASED">Employee-Based</option>
                  <option value="EMPLOYEE_PER_MODULE">Employee Per Module</option>
                  <option value="ENTERPRISE_CONSUMPTION">Enterprise Consumption</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                  <input name="contractStartDate" type="date" required className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">End Date</label>
                  <input name="contractEndDate" type="date" required className="w-full border rounded px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Billing Cycle</label>
                  <select name="billingCycle" required className="w-full border rounded px-3 py-2 text-sm">
                    <option value="MONTHLY">Monthly</option>
                    <option value="QUARTERLY">Quarterly</option>
                    <option value="ANNUAL">Annual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Currency</label>
                  <select name="currency" className="w-full border rounded px-3 py-2 text-sm">
                    <option value="USD">USD</option>
                    <option value="INR">INR</option>
                    <option value="EUR">EUR</option>
                    <option value="GBP">GBP</option>
                    <option value="AED">AED</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Min. Commitment (Employees)</label>
                <input name="minCommitmentEmployees" type="number" min="0" className="w-full border rounded px-3 py-2 text-sm" defaultValue="0" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Enterprise: Committed Amount</label>
                <input name="committedAmount" type="number" step="0.01" className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. 100000" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Enterprise: Consumption Pool (Units)</label>
                <input name="consumptionPoolUnits" type="number" className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. 1000000" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Billing Contact Email</label>
                <input name="billingContactEmail" type="email" className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowContractModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Create Contract</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Module License Modal */}
      {showModuleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Assign Module License</h3>
            <form onSubmit={handleModuleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Contract</label>
                <select name="contractId" required className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">Select contract...</option>
                  {contracts.map((c: any) => <option key={c.id} value={c.id}>{c.contractNumber} ({c.status})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Module</label>
                <select name="moduleKey" required className="w-full border rounded px-3 py-2 text-sm">
                  {COMMON_MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Max Employees (blank=unlimited)</label>
                  <input name="maxEmployees" type="number" min="1" className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Unit Price ($/employee)</label>
                  <input name="unitPrice" type="number" step="0.0001" required className="w-full border rounded px-3 py-2 text-sm" defaultValue="1.00" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Effective From</label>
                <input name="effectiveFrom" type="date" required className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModuleModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Assign</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Employee Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Assign Employee to Module</h3>
            <form onSubmit={handleAssignSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Employee ID</label>
                <input name="employeeId" required className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Employee Name</label>
                <input name="employeeName" required className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Module</label>
                <select name="moduleKey" required className="w-full border rounded px-3 py-2 text-sm">
                  {COMMON_MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAssignModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Assign</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Assign Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Bulk Assign Employees</h3>
            <form onSubmit={handleBulkSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Module</label>
                <select name="moduleKey" required className="w-full border rounded px-3 py-2 text-sm">
                  {COMMON_MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Employees (one per line: id:name)</label>
                <textarea name="employees" required rows={6} className="w-full border rounded px-3 py-2 text-sm font-mono" placeholder={"emp-001:Alice Smith\nemp-002:Bob Jones"} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowBulkModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Bulk Assign</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generate Invoice Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Generate Invoice</h3>
            <form onSubmit={handleInvoiceSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Contract</label>
                <select name="contractId" required className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">Select contract...</option>
                  {contracts.map((c: any) => <option key={c.id} value={c.id}>{c.contractNumber} ({LICENSE_TYPE_LABELS[c.licenseType]})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Period Start</label>
                  <input name="periodStart" type="date" required className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Period End</label>
                  <input name="periodEnd" type="date" required className="w-full border rounded px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tax Rate (%)</label>
                <input name="taxRate" type="number" step="0.01" min="0" max="100" className="w-full border rounded px-3 py-2 text-sm" defaultValue="0" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowInvoiceModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Generate</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Consumption Modal */}
      {showConsumptionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Record Consumption</h3>
            <form onSubmit={handleConsumptionSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Period Month</label>
                  <input name="periodMonth" type="month" required className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Type</label>
                  <select name="consumptionType" required className="w-full border rounded px-3 py-2 text-sm">
                    <option value="EMPLOYEE">Employee</option>
                    <option value="MODULE">Module</option>
                    <option value="OVERAGE">Overage</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Module (for MODULE type)</label>
                <select name="moduleKey" className="w-full border rounded px-3 py-2 text-sm">
                  <option value="">— N/A —</option>
                  {COMMON_MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Active Employees</label>
                  <input name="activeEmployees" type="number" required className="w-full border rounded px-3 py-2 text-sm" defaultValue="0" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Units Consumed</label>
                  <input name="unitsConsumed" type="number" step="0.0001" required className="w-full border rounded px-3 py-2 text-sm" defaultValue="0" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Unit Rate</label>
                  <input name="unitRate" type="number" step="0.0001" required className="w-full border rounded px-3 py-2 text-sm" defaultValue="0" />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowConsumptionModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Record</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
