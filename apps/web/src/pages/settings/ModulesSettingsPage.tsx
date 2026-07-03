import React, { useState, useEffect } from 'react';
import { ShieldCheck, Lock, Info } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useTenantSettings, useUpdateTenantSettings } from '../../api/hooks';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

// Catalog of every module label/description. What a tenant can actually run is
// constrained by the license the platform (super admin) allocated.
const MODULE_CATALOG: Record<string, { label: string; description: string; icon: string }> = {
  hr: { label: 'Human Resources', description: 'Employees, attendance, leave management', icon: '👥' },
  finance: { label: 'Finance', description: 'GL, AR, AP, invoicing', icon: '💰' },
  payroll: { label: 'Payroll', description: 'Payroll processing and payslips', icon: '💳' },
  procurement: { label: 'Procurement', description: 'Purchase orders and vendor management', icon: '🛒' },
  inventory: { label: 'Inventory', description: 'Stock management and tracking', icon: '📦' },
  crm: { label: 'CRM', description: 'Customer relationship management', icon: '🤝' },
  sales: { label: 'Sales', description: 'Orders, pricing, fulfillment', icon: '📈' },
  contracts: { label: 'Contracts', description: 'Contract lifecycle management', icon: '📄' },
  projects: { label: 'Projects', description: 'Project tracking and timesheets', icon: '📋' },
  expenses: { label: 'Expenses', description: 'Expense claims and reimbursements', icon: '🧾' },
  talent: { label: 'Talent', description: 'Hiring, learning, performance', icon: '🎯' },
  manufacturing: { label: 'Manufacturing', description: 'Production, MRP, routings', icon: '🏭' },
  quality: { label: 'Quality', description: 'Inspection and results recording', icon: '✅' },
  maintenance: { label: 'Maintenance', description: 'Assets and work orders', icon: '🔧' },
  benefits: { label: 'Benefits', description: 'Enrollment and compensation', icon: '🎁' },
  analytics: { label: 'Analytics', description: 'KPIs and report builder', icon: '📊' },
  platform: { label: 'Platform', description: 'Platform administration', icon: '🛡️' },
  licensing: { label: 'Licensing', description: 'License management', icon: '🔑' },
};

const describe = (id: string) =>
  MODULE_CATALOG[id] ?? { label: id, description: '', icon: '🧩' };

export default function ModulesSettingsPage() {
  const { data: tenant, isLoading } = useTenantSettings();
  const { tenant: authTenant, user } = useAuthStore();
  const updateSettings = useUpdateTenantSettings();
  const isSuperAdmin = !!user?.isSuperAdmin;

  // Modules the super admin assigned on the license = the ceiling. Fall back to
  // the auth store (populated at login) so the page works without the
  // super-admin-only tenant fetch.
  const licensedModules: string[] =
    tenant?.licensedModules ?? authTenant?.licensedModules ?? [];
  const provisionedEnabled: string[] =
    tenant?.settings?.enabledModules ?? authTenant?.settings?.enabledModules ?? [];

  const [enabledModules, setEnabledModules] = useState<string[]>([]);

  useEffect(() => {
    setEnabledModules(provisionedEnabled);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant, authTenant]);

  const toggleModule = (id: string) => {
    if (!licensedModules.includes(id)) return; // never enable beyond the license
    setEnabledModules((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id],
    );
  };

  const handleSave = async () => {
    try {
      // Only ever send modules within the licensed set.
      const clamped = enabledModules.filter((m) => licensedModules.includes(m));
      await updateSettings.mutateAsync({ enabledModules: clamped });
      toast.success('Module settings saved');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to save settings');
    }
  };

  if (isLoading) {
    return <div className="p-6 text-gray-500">Loading…</div>;
  }

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Modules"
        description="Modules provisioned for your organization by the platform administrator"
      />

      <div className="mb-4 flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-sm text-indigo-800">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>
          These modules are allocated to your tenant by the platform (super)
          administrator through your license.{' '}
          {isSuperAdmin
            ? 'You can enable or disable any licensed module below; to add modules beyond the license, update the license in Tenant Management.'
            : 'To add or remove modules, contact your platform administrator.'}
        </p>
      </div>

      {licensedModules.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-gray-500">
            No modules have been assigned to your organization yet. Please contact
            your platform administrator.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-4 space-y-3">
            {licensedModules.map((id) => {
              const mod = describe(id);
              const isEnabled = enabledModules.includes(id);
              return (
                <div
                  key={id}
                  className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{mod.icon}</span>
                    <div>
                      <p className="font-medium text-gray-900 flex items-center gap-1.5">
                        {mod.label}
                        <ShieldCheck className="h-3.5 w-3.5 text-indigo-500" aria-label="Licensed" />
                      </p>
                      <p className="text-sm text-gray-500">{mod.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={isEnabled ? 'success' : 'default'}>
                      {isEnabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                    {isSuperAdmin ? (
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={isEnabled}
                          onChange={() => toggleModule(id)}
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                      </label>
                    ) : (
                      <Lock className="h-4 w-4 text-gray-300" aria-label="Managed by administrator" />
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {isSuperAdmin && licensedModules.length > 0 && (
        <div className="mt-4">
          <Button onClick={handleSave} loading={updateSettings.isPending}>
            Save Changes
          </Button>
        </div>
      )}
    </div>
  );
}
