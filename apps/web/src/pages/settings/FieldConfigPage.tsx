import { useState, useEffect } from 'react';
import { SlidersHorizontal, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { settingsApi } from '../../api/settings';

interface FieldRow {
  field: string;
  label: string;
  group: string;
  enabled: boolean;
  required: boolean;
  customLabel: string | null;
}

const MODULE_DISPLAY: Record<string, { title: string; subtitle: string }> = {
  'hr.employee':             { title: 'HR',          subtitle: 'Employee' },
  'finance.bill':            { title: 'Finance',     subtitle: 'Bill' },
  'finance.invoice':         { title: 'Finance',     subtitle: 'Invoice' },
  'procurement.po':          { title: 'Procurement', subtitle: 'Purchase Order' },
  'procurement.requisition': { title: 'Procurement', subtitle: 'Requisition' },
  'talent.applicant':        { title: 'Talent',      subtitle: 'Applicant' },
  'payroll.component':       { title: 'Payroll',     subtitle: 'Component' },
  'expenses.claim':          { title: 'Expenses',    subtitle: 'Claim' },
  'crm.lead':                { title: 'CRM',         subtitle: 'Lead' },
};

const GROUP_BY_DOMAIN: Record<string, string[]> = {
  HR:          ['hr.employee'],
  Finance:     ['finance.bill', 'finance.invoice'],
  Procurement: ['procurement.po', 'procurement.requisition'],
  Talent:      ['talent.applicant'],
  Payroll:     ['payroll.component'],
  Expenses:    ['expenses.claim'],
  CRM:         ['crm.lead'],
};

function Toggle({ checked, onChange, color }: { checked: boolean; onChange: (v: boolean) => void; color: 'blue' | 'rose' }) {
  const track = checked
    ? color === 'blue' ? 'bg-blue-600' : 'bg-rose-500'
    : 'bg-gray-200';
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${track}`}
      role="switch"
      aria-checked={checked}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-1'}`}
      />
    </button>
  );
}

export default function FieldConfigPage() {
  const [allConfig, setAllConfig] = useState<Record<string, FieldRow[]>>({});
  const [selectedModule, setSelectedModule] = useState('hr.employee');
  const [localRows, setLocalRows] = useState<FieldRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    settingsApi.getAllFieldConfigs()
      .then(res => {
        const data: Record<string, FieldRow[]> = res.data?.data ?? res.data ?? {};
        setAllConfig(data);
        setLocalRows(data[selectedModule] ?? []);
      })
      .catch(() => {
        setToast({ type: 'error', message: 'Failed to load field configurations' });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSelectModule = (mod: string) => {
    setSelectedModule(mod);
    setLocalRows(allConfig[mod] ?? []);
    setToast(null);
  };

  const updateRow = (field: string, patch: Partial<FieldRow>) => {
    setLocalRows(rows =>
      rows.map(r => {
        if (r.field !== field) return r;
        const updated = { ...r, ...patch };
        if (patch.required && !updated.enabled) updated.enabled = true;
        if (patch.enabled === false) updated.required = false;
        return updated;
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setToast(null);
    try {
      const res = await settingsApi.updateModuleFieldConfig(
        selectedModule,
        localRows.map(r => ({
          field: r.field,
          enabled: r.enabled,
          required: r.required,
          customLabel: r.customLabel || undefined,
        }))
      );
      const updated: FieldRow[] = res.data?.data ?? res.data ?? localRows;
      setAllConfig(prev => ({ ...prev, [selectedModule]: updated }));
      setLocalRows(updated);
      setToast({ type: 'success', message: 'Saved successfully' });
    } catch {
      setToast({ type: 'error', message: 'Failed to save changes' });
    } finally {
      setSaving(false);
    }
  };

  const groups = Array.from(new Set(localRows.map(r => r.group)));

  return (
    <div className="flex h-full gap-0">
      {/* Left sidebar */}
      <div className="w-56 flex-shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-blue-600" />
            <span className="font-semibold text-sm text-gray-800">Field Configuration</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Configure per-module fields</p>
        </div>
        <nav className="py-2">
          {Object.entries(GROUP_BY_DOMAIN).map(([domain, mods]) => (
            <div key={domain} className="mb-1">
              <div className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">{domain}</div>
              {mods.map(mod => {
                const disp = MODULE_DISPLAY[mod];
                const isSelected = selectedModule === mod;
                return (
                  <button
                    key={mod}
                    onClick={() => handleSelectModule(mod)}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      isSelected
                        ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-600 font-medium'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    {disp?.subtitle ?? mod}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xs font-medium text-blue-600 uppercase tracking-wider mb-0.5">
                {MODULE_DISPLAY[selectedModule]?.title}
              </div>
              <h1 className="text-xl font-bold text-gray-900">
                {MODULE_DISPLAY[selectedModule]?.subtitle ?? selectedModule}
              </h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Control which fields are visible and required in this module's forms.
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>

          {/* Toast */}
          {toast && (
            <div className={`mb-4 flex items-center gap-2 p-3 rounded-lg text-sm border ${
              toast.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-800'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {toast.type === 'success'
                ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                : <AlertCircle className="h-4 w-4 flex-shrink-0" />}
              {toast.message}
            </div>
          )}

          {loading ? (
            <div className="text-center py-12 text-gray-400">Loading...</div>
          ) : (
            <div className="space-y-6">
              {groups.map(group => {
                const groupRows = localRows.filter(r => r.group === group);
                return (
                  <div key={group} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                      <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">{group}</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs w-40">Field</th>
                          <th className="text-left px-4 py-2.5 font-medium text-gray-500 text-xs">Label</th>
                          <th className="text-center px-4 py-2.5 font-medium text-gray-500 text-xs w-24">Enabled</th>
                          <th className="text-center px-4 py-2.5 font-medium text-gray-500 text-xs w-24">Required</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {groupRows.map(row => (
                          <tr key={row.field} className={`transition-colors ${!row.enabled ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'}`}>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                                {row.field}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={row.customLabel ?? row.label}
                                onChange={e => updateRow(row.field, { customLabel: e.target.value || null })}
                                placeholder={row.label}
                                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex justify-center">
                                <Toggle
                                  checked={row.enabled}
                                  onChange={v => updateRow(row.field, { enabled: v })}
                                  color="blue"
                                />
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="flex justify-center">
                                <Toggle
                                  checked={row.required}
                                  onChange={v => updateRow(row.field, { required: v })}
                                  color="rose"
                                />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
