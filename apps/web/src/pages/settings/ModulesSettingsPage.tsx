import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { useTenantSettings, useUpdateTenantSettings } from '../../api/hooks';
import toast from 'react-hot-toast';

const ALL_MODULES = [
  { id: 'hr', label: 'Human Resources', description: 'Employees, attendance, leave management', icon: '👥' },
  { id: 'finance', label: 'Finance', description: 'GL, AR, AP, invoicing', icon: '💰' },
  { id: 'payroll', label: 'Payroll', description: 'Payroll processing and payslips', icon: '💳' },
  { id: 'procurement', label: 'Procurement', description: 'Purchase orders and vendor management', icon: '🛒' },
  { id: 'inventory', label: 'Inventory', description: 'Stock management and tracking', icon: '📦' },
  { id: 'crm', label: 'CRM', description: 'Customer relationship management', icon: '🤝' },
  { id: 'projects', label: 'Projects', description: 'Project tracking and timesheets', icon: '📋' },
];

export default function ModulesSettingsPage() {
  const { data: tenant, isLoading } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();
  const [enabledModules, setEnabledModules] = useState<string[]>([]);

  useEffect(() => {
    if (tenant?.settings?.enabledModules) {
      setEnabledModules(tenant.settings.enabledModules);
    }
  }, [tenant]);

  const toggleModule = (id: string) => {
    setEnabledModules(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({ enabledModules });
      toast.success('Module settings saved');
    } catch {
      toast.error('Failed to save settings');
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Module Settings"
        description="Enable or disable modules for your organization"
      />

      <Card>
        <CardContent className="py-4 space-y-3">
          {ALL_MODULES.map(mod => (
            <div
              key={mod.id}
              className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{mod.icon}</span>
                <div>
                  <p className="font-medium text-gray-900">{mod.label}</p>
                  <p className="text-sm text-gray-500">{mod.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={enabledModules.includes(mod.id) ? 'success' : 'default'}>
                  {enabledModules.includes(mod.id) ? 'Enabled' : 'Disabled'}
                </Badge>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={enabledModules.includes(mod.id)}
                    onChange={() => toggleModule(mod.id)}
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                </label>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="mt-4">
        <Button onClick={handleSave} loading={updateSettings.isPending}>
          Save Changes
        </Button>
      </div>
    </div>
  );
}
