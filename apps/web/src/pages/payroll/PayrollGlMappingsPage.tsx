import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { payrollGlApi } from '../../api/payrollGl';
import { financeApi } from '../../api/finance';

interface Account {
  id: string;
  code: string;
  name: string;
}

interface MappingRow {
  componentType: string;
  componentCode: string | null;
  debitAccountId: string | null;
  creditAccountId: string | null;
}

const COMPONENT_TYPES: { type: string; label: string; hint: string }[] = [
  { type: 'EARNING', label: 'Earnings', hint: 'DR salary expense / CR payroll payable' },
  { type: 'DEDUCTION', label: 'Deductions', hint: 'DR payroll payable / CR liability' },
  { type: 'EMPLOYER_CONTRIBUTION', label: 'Employer Contributions', hint: 'DR employer expense / CR liability' },
  { type: 'NET_PAY', label: 'Net Pay', hint: 'DR payroll payable / CR bank' },
];

export default function PayrollGlMappingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rows, setRows] = useState<Record<string, MappingRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [accRes, mapRes] = await Promise.all([
          financeApi.getAccounts({ limit: 500, isActive: true }),
          payrollGlApi.getGlMappings(),
        ]);
        const accData = accRes.data?.data ?? accRes.data;
        setAccounts(accData?.items ?? accData ?? []);

        const maps: MappingRow[] = mapRes.data?.data ?? mapRes.data ?? [];
        const next: Record<string, MappingRow> = {};
        for (const t of COMPONENT_TYPES) {
          next[t.type] = {
            componentType: t.type,
            componentCode: null,
            debitAccountId: null,
            creditAccountId: null,
          };
        }
        for (const m of maps) {
          // only the catch-all (componentCode == null) row is editable here
          if (m.componentCode == null && next[m.componentType]) {
            next[m.componentType] = {
              componentType: m.componentType,
              componentCode: null,
              debitAccountId: m.debitAccountId ?? null,
              creditAccountId: m.creditAccountId ?? null,
            };
          }
        }
        setRows(next);
      } catch (err: any) {
        setError(err?.response?.data?.message ?? 'Failed to load GL mappings');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const update = (type: string, field: 'debitAccountId' | 'creditAccountId', value: string) => {
    setRows((prev) => ({
      ...prev,
      [type]: { ...prev[type], [field]: value || null },
    }));
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const items = COMPONENT_TYPES.map((t) => rows[t.type]).filter(Boolean);
      await payrollGlApi.saveGlMappings(items);
      setMessage('GL mappings saved');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to save mappings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Payroll GL Mappings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Map each payroll component type to the General Ledger accounts used when posting an approved run.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {message && <div className="mb-4 px-4 py-2 rounded-lg bg-green-50 text-green-700 text-sm">{message}</div>}
      {error && <div className="mb-4 px-4 py-2 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Component Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Debit Account</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Credit Account</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {COMPONENT_TYPES.map((t) => {
              const row = rows[t.type];
              return (
                <tr key={t.type}>
                  <td className="px-4 py-3 text-sm">
                    <div className="font-medium text-gray-900">{t.label}</div>
                    <div className="text-xs text-gray-400">{t.hint}</div>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={row?.debitAccountId ?? ''}
                      onChange={(e) => update(t.type, 'debitAccountId', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                    >
                      <option value="">-- none --</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={row?.creditAccountId ?? ''}
                      onChange={(e) => update(t.type, 'creditAccountId', e.target.value)}
                      className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm"
                    >
                      <option value="">-- none --</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
