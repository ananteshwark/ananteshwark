import { useState, useEffect } from 'react';
import { Plus, X, Building2, KeyRound, Ban, CheckCircle, Users, Mail, ShieldCheck, Eye, EyeOff, UserPlus, Pencil } from 'lucide-react';
import { adminApi } from '../../api/admin';

const TIERS = ['TRIAL', 'FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE'];
const ALL_MODULES = [
  'hr', 'finance', 'payroll', 'procurement', 'inventory',
  'crm', 'sales', 'contracts', 'projects', 'expenses',
  'talent', 'manufacturing', 'quality', 'maintenance',
  'benefits', 'analytics', 'platform', 'licensing',
];

const MODULE_LABELS: Record<string, string> = {
  hr: 'HR', finance: 'Finance', payroll: 'Payroll', procurement: 'Procurement',
  inventory: 'Inventory', crm: 'CRM', sales: 'Sales', contracts: 'Contracts',
  projects: 'Projects', expenses: 'Expenses', talent: 'Talent',
  manufacturing: 'Manufacturing', quality: 'Quality', maintenance: 'Maintenance',
  benefits: 'Benefits', analytics: 'Analytics', platform: 'Platform', licensing: 'Licensing',
};

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
const USER_STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  invited: 'bg-blue-100 text-blue-700',
  inactive: 'bg-gray-100 text-gray-500',
  locked: 'bg-red-100 text-red-700',
};

export default function TenantsPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showTenantModal, setShowTenantModal] = useState(false);
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [tenantForm, setTenantForm] = useState({ name: '', slug: '', plan: 'trial', adminEmail: '', adminFirstName: '', adminLastName: '', adminPassword: '' });

  const [licenseFor, setLicenseFor] = useState<any | null>(null);
  const [licForm, setLicForm] = useState<any>({ tier: 'TRIAL', maxUsers: 10, maxEmployees: 50, enabledModules: [] as string[], validFrom: '', validTo: '', notes: '' });

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [includeHidden, setIncludeHidden] = useState(false);

  // Tenant-admin add/edit within the license modal.
  const emptyAdminForm = { email: '', firstName: '', lastName: '', phone: '', password: '' };
  const [adminMode, setAdminMode] = useState<null | 'add' | string>(null); // 'add' | userId
  const [adminForm, setAdminForm] = useState(emptyAdminForm);
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const fetchTenants = async (hidden = includeHidden): Promise<any[]> => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminApi.getTenants(hidden);
      const list = res.data?.data ?? res.data?.items ?? res.data ?? [];
      setTenants(list);
      return list;
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load tenants');
      return [];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTenants(); }, []);

  const toggleIncludeHidden = () => {
    const next = !includeHidden;
    setIncludeHidden(next);
    fetchTenants(next);
  };

  const toggleHidden = async (t: any) => {
    if (t.hidden) await adminApi.unhideTenant(t.id);
    else await adminApi.hideTenant(t.id);
    fetchTenants();
  };

  const openNewTenant = () => {
    setEditingTenantId(null);
    setTenantForm({ name: '', slug: '', plan: 'trial', adminEmail: '', adminFirstName: '', adminLastName: '', adminPassword: '' });
    setFormError(null);
    setShowTenantModal(true);
  };

  const openEditTenant = (t: any) => {
    setEditingTenantId(t.id);
    setTenantForm({ name: t.name ?? '', slug: t.slug ?? '', plan: t.plan ?? 'trial', adminEmail: '', adminFirstName: '', adminLastName: '', adminPassword: '' });
    setFormError(null);
    setShowTenantModal(true);
  };

  const handleSubmitTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      if (editingTenantId) {
        await adminApi.updateTenant(editingTenantId, { name: tenantForm.name, plan: tenantForm.plan });
      } else {
        await adminApi.createTenant(tenantForm);
      }
      setShowTenantModal(false);
      setEditingTenantId(null);
      setTenantForm({ name: '', slug: '', plan: 'trial', adminEmail: '', adminFirstName: '', adminLastName: '', adminPassword: '' });
      await fetchTenants();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? (editingTenantId ? 'Failed to update tenant' : 'Failed to create tenant'));
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
    setAdminMode(null);
    setAdminError(null);
    setLicenseFor(t);
  };

  const openAddAdmin = () => {
    setAdminForm(emptyAdminForm);
    setAdminError(null);
    setAdminMode('add');
  };

  const openEditAdmin = (a: any) => {
    setAdminForm({ email: a.email ?? '', firstName: a.firstName ?? '', lastName: a.lastName ?? '', phone: a.phone ?? '', password: '' });
    setAdminError(null);
    setAdminMode(a.id);
  };

  const saveAdmin = async () => {
    if (!licenseFor) return;
    setSavingAdmin(true);
    setAdminError(null);
    try {
      if (adminMode === 'add') {
        await adminApi.addTenantAdmin(licenseFor.id, {
          email: adminForm.email,
          firstName: adminForm.firstName,
          lastName: adminForm.lastName,
          password: adminForm.password,
        });
      } else if (adminMode) {
        const payload: any = { firstName: adminForm.firstName, lastName: adminForm.lastName, phone: adminForm.phone };
        if (adminForm.password) payload.password = adminForm.password;
        await adminApi.updateTenantAdmin(licenseFor.id, adminMode, payload);
      }
      const list = await fetchTenants();
      const fresh = list.find((x: any) => x.id === licenseFor.id);
      if (fresh) setLicenseFor(fresh);
      setAdminMode(null);
    } catch (err: any) {
      setAdminError(err?.response?.data?.message ?? 'Failed to save admin');
    } finally {
      setSavingAdmin(false);
    }
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
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={includeHidden} onChange={toggleIncludeHidden} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
            Show hidden
          </label>
          <button onClick={openNewTenant} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium">
            <Plus className="h-4 w-4" /> New Tenant
          </button>
        </div>
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
                <th className="text-left px-4 py-3">Administrator</th>
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
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">No tenants found</td></tr>
              ) : tenants.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 flex items-center gap-1.5">
                      {t.name}
                      {t.hidden && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 flex items-center gap-1"><EyeOff className="h-3 w-3" /> Hidden</span>}
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-1"><Users className="h-3 w-3" /> {t.userCount} users</div>
                  </td>
                  <td className="px-4 py-3">
                    {t.primaryAdmin ? (
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5 font-medium text-gray-800">
                          <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" />
                          {t.primaryAdmin.fullName || '—'}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${USER_STATUS_COLORS[t.primaryAdmin.status] ?? 'bg-gray-100 text-gray-600'}`}>{t.primaryAdmin.status}</span>
                        </div>
                        <a href={`mailto:${t.primaryAdmin.email}`} className="text-xs text-gray-500 hover:text-indigo-600 flex items-center gap-1">
                          <Mail className="h-3 w-3" /> {t.primaryAdmin.email}
                        </a>
                        {t.admins && t.admins.length > 1 && (
                          <div className="text-[11px] text-gray-400">+{t.admins.length - 1} more admin{t.admins.length - 1 > 1 ? 's' : ''}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No admin assigned</span>
                    )}
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
                      {t.hidden ? (
                        <button onClick={() => toggleHidden(t)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                          <Eye className="h-3.5 w-3.5" /> Unhide
                        </button>
                      ) : t.status === 'suspended' ? (
                        <button onClick={() => toggleHidden(t)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                          <EyeOff className="h-3.5 w-3.5" /> Hide
                        </button>
                      ) : null}
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
            <form onSubmit={handleSubmitTenant} className="p-5 space-y-4">
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

              <div className="pt-2 mt-2 border-t">
                <p className="text-sm font-semibold text-gray-800 mb-1">Default Tenant Admin</p>
                <p className="text-xs text-gray-400 mb-3">This user will be created with the Tenant Admin role and can sign in immediately.</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                    <input required value={tenantForm.adminFirstName} onChange={e => setTenantForm(f => ({ ...f, adminFirstName: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                    <input required value={tenantForm.adminLastName} onChange={e => setTenantForm(f => ({ ...f, adminLastName: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email *</label>
                  <input required type="email" value={tenantForm.adminEmail} onChange={e => setTenantForm(f => ({ ...f, adminEmail: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="admin@acme.com" />
                </div>
                <div className="mt-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password *</label>
                  <input required type="password" minLength={8} value={tenantForm.adminPassword} onChange={e => setTenantForm(f => ({ ...f, adminPassword: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="At least 8 characters" />
                </div>
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

            {/* Tenant admins */}
            <div className="p-5 border-b bg-gray-50/60 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-indigo-500" /> Tenant Admins</h3>
                <button type="button" onClick={openAddAdmin} className="flex items-center gap-1 px-2.5 py-1.5 border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-100 text-xs font-medium">
                  <UserPlus className="h-3.5 w-3.5" /> Add Admin
                </button>
              </div>

              {(licenseFor.admins ?? []).length === 0 && adminMode !== 'add' && (
                <p className="text-xs text-gray-400">No tenant admin assigned yet.</p>
              )}

              <div className="space-y-1.5">
                {(licenseFor.admins ?? []).map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{a.fullName || `${a.firstName} ${a.lastName}`}</div>
                      <div className="text-xs text-gray-500 truncate flex items-center gap-1"><Mail className="h-3 w-3" /> {a.email}</div>
                    </div>
                    <button type="button" onClick={() => openEditAdmin(a)} className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  </div>
                ))}
              </div>

              {adminMode && (
                <div className="rounded-lg border border-indigo-200 bg-white p-3 space-y-3">
                  <p className="text-xs font-semibold text-gray-700">{adminMode === 'add' ? 'New Tenant Admin' : 'Edit Tenant Admin'}</p>
                  {adminError && <div className="p-2 bg-red-50 text-red-700 rounded text-xs">{adminError}</div>}
                  <div className="grid grid-cols-2 gap-2">
                    <input placeholder="First name" value={adminForm.firstName} onChange={e => setAdminForm(f => ({ ...f, firstName: e.target.value }))} className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <input placeholder="Last name" value={adminForm.lastName} onChange={e => setAdminForm(f => ({ ...f, lastName: e.target.value }))} className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  {adminMode === 'add' ? (
                    <input type="email" placeholder="Email" value={adminForm.email} onChange={e => setAdminForm(f => ({ ...f, email: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  ) : (
                    <>
                      <input value={adminForm.email} disabled className="w-full border border-gray-200 bg-gray-50 text-gray-400 rounded-lg px-2.5 py-1.5 text-sm" />
                      <input placeholder="Phone (optional)" value={adminForm.phone} onChange={e => setAdminForm(f => ({ ...f, phone: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    </>
                  )}
                  <input type="password" placeholder={adminMode === 'add' ? 'Temporary password (min 8)' : 'New password (optional, min 8)'} value={adminForm.password} onChange={e => setAdminForm(f => ({ ...f, password: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setAdminMode(null)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-1.5 text-xs font-medium hover:bg-gray-50">Cancel</button>
                    <button type="button" onClick={saveAdmin} disabled={savingAdmin} className="flex-1 bg-indigo-600 text-white rounded-lg py-1.5 text-xs font-medium hover:bg-indigo-700 disabled:opacity-50">{savingAdmin ? 'Saving...' : (adminMode === 'add' ? 'Create Admin' : 'Save Admin')}</button>
                  </div>
                </div>
              )}
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
                <div className="flex gap-2 mb-2">
                  <button type="button" onClick={() => setLicForm((f: any) => ({ ...f, enabledModules: [...ALL_MODULES] }))} className="text-xs text-indigo-600 hover:underline">Select all</button>
                  <span className="text-xs text-gray-300">|</span>
                  <button type="button" onClick={() => setLicForm((f: any) => ({ ...f, enabledModules: [] }))} className="text-xs text-gray-500 hover:underline">Clear all</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {ALL_MODULES.map(m => (
                    <label key={m} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={licForm.enabledModules.includes(m)} onChange={() => toggleModule(m)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                      {MODULE_LABELS[m] ?? m}
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
