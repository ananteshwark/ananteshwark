import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useTenantSettings, useUpdateTenantSettings } from '../../api/hooks';
import toast from 'react-hot-toast';

export default function GeneralSettingsPage() {
  const { data: tenant, isLoading } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();

  const [branding, setBranding] = useState({
    primaryColor: '#2563EB',
    logoUrl: '',
  });

  useEffect(() => {
    if (tenant?.settings?.branding) {
      setBranding({
        primaryColor: tenant.settings.branding.primaryColor || '#2563EB',
        logoUrl: tenant.settings.branding.logoUrl || '',
      });
    }
  }, [tenant]);

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({ branding });
      // Apply theme change
      document.documentElement.style.setProperty('--color-primary', branding.primaryColor);
      toast.success('Settings saved');
    } catch {
      toast.error('Failed to save settings');
    }
  };

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="General Settings"
        description="Manage your organization's branding and preferences"
      />

      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <label className="block text-sm font-medium text-gray-700">Primary Color</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={branding.primaryColor}
                onChange={e => setBranding({ ...branding, primaryColor: e.target.value })}
                className="h-10 w-16 rounded border border-gray-300 cursor-pointer p-1"
              />
              <Input
                type="text"
                value={branding.primaryColor}
                onChange={e => setBranding({ ...branding, primaryColor: e.target.value })}
                placeholder="#2563EB"
                className="flex-1"
              />
            </div>
          </div>
          <Input
            label="Logo URL"
            type="url"
            placeholder="https://yourcompany.com/logo.png"
            value={branding.logoUrl}
            onChange={e => setBranding({ ...branding, logoUrl: e.target.value })}
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Company Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Tenant Name</p>
              <p className="font-medium mt-1">{tenant?.name || '-'}</p>
            </div>
            <div>
              <p className="text-gray-500">Slug</p>
              <p className="font-medium mt-1">{tenant?.slug || '-'}</p>
            </div>
            <div>
              <p className="text-gray-500">Plan</p>
              <p className="font-medium mt-1 capitalize">{tenant?.plan || '-'}</p>
            </div>
            <div>
              <p className="text-gray-500">Status</p>
              <p className="font-medium mt-1 capitalize">{tenant?.status || '-'}</p>
            </div>
            <div>
              <p className="text-gray-500">Locale</p>
              <p className="font-medium mt-1">{tenant?.settings?.locale || 'en'}</p>
            </div>
            <div>
              <p className="text-gray-500">Currency</p>
              <p className="font-medium mt-1">{tenant?.settings?.baseCurrency || 'USD'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4">
        <Button onClick={handleSave} loading={updateSettings.isPending}>
          Save Settings
        </Button>
      </div>
    </div>
  );
}
