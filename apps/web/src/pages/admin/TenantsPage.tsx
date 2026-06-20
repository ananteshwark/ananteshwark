import { useState, useEffect } from 'react';
import { Plus, X, Building2, KeyRound, Ban, CheckCircle, Users } from 'lucide-react';
import { adminApi } from '../../api/admin';

const TIERS = ['TRIAL', 'FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
const ALL_MODULES = ['hr', 'finance', 'payroll', 'procurement', 'inventory', 'crm', 'projects', 'expenses', 'talent'];

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  trial: 'bg-blue-100 text-blue-700',
  suspended: 'bg-red-100 text-red-700',
};
const LIC_STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  SUSPENDED: 'bg-amber-100 text-amber-700',
  EXPIRED: 'bg-gray-100 text-gray-500',
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showTenantModal, setShowTenantModal] = useState(false);
  const [tenantForm, setTenantForm] = useState({ name: '', slug: '', plan: 'TRIAL' });

  const [licenseFor, setLicenseFor] = useState<any | null>(null);
  const [licForm, setLicForm] = useState<any>({ tier: 'TRIAL', maxUsers: 10, maxEmployees: 50, enabledModules: [] as string[], validFrom: '', validTo: '', notes: '' });

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchTenants = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getTenants();
      setTenants(res.data?.data ?? res.data?.items ?? res.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTenants(); }, []);

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await adminApi.createTenant(tenantForm);
      setShowTenantModal(false);
      setTenantForm({ name: '', slug: '', plan: 'TRIAL' });
      await fetchTenants();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Failed to create tenant');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (t: any) => {
    if (t.status === 'suspended') await adminApi.activateTenant(t.id);
    else await adminApi.suspendTenant(t.id);
    fetchTenants();
  };

  const openLicense = (t: any) => {
    const lic = t.license;
    setLicForm({
      tier: lic?.tier ?? 'TRIAL',
      maxUsers: lic?.maxUsers ?? 10,
      maxEmployees: lic?.maxEmployees ?? 50,
      enabledModules: lic?.enabledModules ?? [],
      validFrom: lic?.validFrom ?? '',
      validTo: lic?.validTo ?? '',
      notes: lic?.notes ?? '',
    });
    setFormError(null);
    setLicenseFor(t);
  };

  const handleAllocate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      const payload: any = { ...licForm };
      if (!payload.validFrom) delete payload.validFrom;
      if (!payload.validTo) delete payload.validTo;
      await adminApi.allocateLicense(licenseFor.id, payload);
      setLicenseFor(null);
      await fetchTenants();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Failed to allocate license');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleModule = (m: string) => {
    setLicForm((f: any) => ({
      ...f,
      enabledModules: f.enabledModules.includes(m) ? f.enabledModules.filter((x: string) => x !== m) : [...f.enabledModules, m],
    }));
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Building2 className="h-6 w-6 text-indigo-600" /> Tenant Management</h1>
          <p className="text-sm text-gray-500 mt-1">Super-admin: manage tenants and the licenses allocated to them</p>
        </div>
        <button onClick={() => setShowTenantModal(true)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
          <Plus className="h-4 w-4" /> New Tenant
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs font-medium text-gray-600 uppercase tracking-wider">
              <tr>
                <th className="text-left px-4 py-3">Tenant</th>
                <th className="text-left px-4 py-3">Slug</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">License Tier</th>
                <th className="text-left px-4 py-3">Seats (Users / Emp)</th>
                <th className="text-left px-4 py-3">Modules</th>
                <th className="text-left px-4 py-3">Validity</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tenants.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">No tenants found</td></tr>
              ) : tenants.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{t.name}</div>
                    <div className="text-xs text-gray-400 flex items-center gap-1"><Users className="h-3 w-3" /> {t.userCount} users</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{t.slug}</td>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[t.status] ?? 'bg-gray-100 text-gray-600'}`}>{t.status}</span></td>
                  <td className="px-4 py-3">
                    {t.license ? (
                      <span className="flex items-center gap-1.5">
                        <span className="font-medium text-gray-800">{t.license.tier}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${LIC_STATUS_COLORS[t.license.status] ?? ''}`}>{t.license.status}</span>
                      </span>
                    ) : <span className="text-xs text-gray-400">Not allocated</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{t.license ? `${t.license.maxUsers} / ${t.license.maxEmployees}` : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{t.license?.enabledModules?.length ? `${t.license.enabledModules.length} enabled` : '—'}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{t.license?.validTo ? `until ${t.license.validTo}` : '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openLicense(t)} className="flex items-center gap-1 px-2.5 py-1.5 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50 text-xs font-medium">
                        <KeyRound className="h-3.5 w-3.5" /> {t.license ? 'Edit License' : 'Allocate License'}
                      </button>
                      <button onClick={() => toggleStatus(t)} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium ${t.status === 'suspended' ? 'border border-green-200 text-green-700 hover:bg-green-50' : 'border border-red-200 text-red-700 hover:bg-red-50'}`}>
                        {t.status === 'suspended' ? <><CheckCircle className="h-3.5 w-3.5" /> Activate</> : <><Ban className="h-3.5 w-3.5" /> Suspend</>}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New Tenant modal */}
      {showTenantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">New Tenant</h2>
              <button onClick={() => setShowTenantModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreateTenant} className="p-5 space-y-4">
              {formError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{formError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input required value={tenantForm.name} onChange={e => setTenantForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Acme Corporation" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug *</label>
                <input required value={tenantForm.slug} onChange={e => setTenantForm(f => ({ ...f, slug: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="acme" />
                <p className="text-xs text-gray-400 mt-1">Lowercase letters, numbers and hyphens</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                <select value={tenantForm.plan} onChange={e => setTenantForm(f => ({ ...f, plan: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                  {['trial', 'free', 'starter', 'professional', 'enterprise'].map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowTenantModal(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{submitting ? 'Creating...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* License allocation modal */}
      {licenseFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold flex items-center gap-2"><KeyRound className="h-5 w-5 text-indigo-600" /> License — {licenseFor.name}</h2>
              <button onClick={() => setLicenseFor(null)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleAllocate} className="p-5 space-y-4">
              {formError && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{formError}</div>}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tier</label>
                  <select value={licForm.tier} onChange={e => setLicForm((f: any) => ({ ...f, tier: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Users</label>
                  <input type="number" min={0} value={licForm.maxUsers} onChange={e => setLicForm((f: any) => ({ ...f, maxUsers: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Employees</label>
                  <input type="number" min={0} value={licForm.maxEmployees} onChange={e => setLicForm((f: any) => ({ ...f, maxEmployees: Number(e.target.value) }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid From</label>
                  <input type="date" value={licForm.validFrom} onChange={e => setLicForm((f: any) => ({ ...f, validFrom: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valid To</label>
                  <input type="date" value={licForm.validTo} onChange={e => setLicForm((f: any) => ({ ...f, validTo: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Enabled Modules</label>
                <div className="grid grid-cols-3 gap-2">
                  {ALL_MODULES.map(m => (
                    <label key={m} className="flex items-center gap-2 text-sm capitalize cursor-pointer">
                      <input type="checkbox" checked={licForm.enabledModules.includes(m)} onChange={() => toggleModule(m)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      {m}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={licForm.notes} onChange={e => setLicForm((f: any) => ({ ...f, notes: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setLicenseFor(null)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{submitting ? 'Saving...' : 'Save License'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
