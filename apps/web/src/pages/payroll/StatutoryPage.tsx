import { useState, useEffect } from 'react';
import { payrollApi } from '../../api/payroll';

interface StatutoryConfig {
  id: string;
  type: string;
  isEnabled: boolean;
  config: Record<string, any>;
  effectiveFrom: string;
}

interface CalendarItem {
  id: string;
  title: string;
  complianceType: string;
  dueDate: string;
  frequency: string;
  status: string;
}

interface TaxSlab {
  id: string;
  regime: string;
  financialYear: string;
  fromAmount: number;
  toAmount: number | null;
  rate: number;
}

const statusBadge: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  FILED: 'bg-green-100 text-green-800',
  OVERDUE: 'bg-red-100 text-red-800',
};

const fmt = (n: number) => new Intl.NumberFormat('en-IN').format(n ?? 0);

type Tab = 'config' | 'calendar' | 'slabs' | 'form16';

export default function StatutoryPage() {
  const [tab, setTab] = useState<Tab>('config');
  const [configs, setConfigs] = useState<StatutoryConfig[]>([]);
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);
  const [slabs, setSlabs] = useState<TaxSlab[]>([]);
  const [form16List, setForm16List] = useState<any[]>([]);
  const [form16FY, setForm16FY] = useState(`${new Date().getFullYear() - 1}-${String(new Date().getFullYear()).slice(-2)}`);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, calRes, slabRes] = await Promise.all([
        payrollApi.getStatutoryConfigs(),
        payrollApi.getComplianceCalendar(),
        payrollApi.getTaxSlabs(),
      ]);
      setConfigs(cfgRes.data?.data ?? cfgRes.data ?? []);
      setCalendar(calRes.data?.data ?? calRes.data ?? []);
      setSlabs(slabRes.data?.data ?? slabRes.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load statutory data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const markFiled = async (id: string) => {
    setBusy(true);
    try {
      await payrollApi.markFiled(id);
      fetchAll();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to mark filed');
    } finally {
      setBusy(false);
    }
  };

  const fetchForm16 = async (fy?: string) => {
    setBusy(true);
    try {
      const res = await payrollApi.getForm16({ financialYear: fy ?? form16FY });
      setForm16List(res.data?.data ?? res.data?.items ?? res.data ?? []);
    } catch {
      setForm16List([]);
    } finally {
      setBusy(false);
    }
  };

  const generateCalendar = async () => {
    setBusy(true);
    try {
      const now = new Date();
      await payrollApi.generateCalendar({ month: now.getMonth() + 1, year: now.getFullYear() });
      fetchAll();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to generate calendar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Statutory Compliance</h1>

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {([
          { k: 'config', l: 'Statutory Config' },
          { k: 'calendar', l: 'Compliance Calendar' },
          { k: 'slabs', l: 'Tax Slabs' },
          { k: 'form16', l: 'Form 16' },
        ] as { k: Tab; l: string }[]).map((t) => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.k ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600 mb-4">{error}</p>}

      {!loading && tab === 'config' && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Enabled</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Config</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Effective</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {configs.length === 0 && (<tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No configs. Run the seed.</td></tr>)}
              {configs.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.type}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{c.isEnabled ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3 text-xs font-mono text-gray-500">{JSON.stringify(c.config)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{c.effectiveFrom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === 'calendar' && (
        <>
          <div className="flex justify-end mb-3">
            <button disabled={busy} onClick={generateCalendar} className="text-sm text-white bg-indigo-600 rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-50">
              Generate This Month
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {calendar.length === 0 && (<tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No compliance items</td></tr>)}
                {calendar.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{c.title}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{c.complianceType}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{c.dueDate}</td>
                    <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge[c.status] ?? 'bg-gray-100 text-gray-700'}`}>{c.status}</span></td>
                    <td className="px-4 py-3 text-right">
                      {c.status !== 'FILED' && (
                        <button disabled={busy} onClick={() => markFiled(c.id)} className="text-xs text-green-600 hover:underline disabled:opacity-50">Mark Filed</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && tab === 'form16' && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Financial Year</label>
              <input
                type="text"
                value={form16FY}
                onChange={e => setForm16FY(e.target.value)}
                placeholder="e.g. 2024-25"
                className="border rounded-lg px-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              disabled={busy}
              onClick={() => fetchForm16(form16FY)}
              className="mt-4 px-4 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? 'Loading...' : 'Fetch Form 16'}
            </button>
          </div>
          {form16List.length === 0 ? (
            <div className="text-center py-12 text-gray-400 border rounded-lg">
              Click "Fetch Form 16" to load generated certificates for the selected FY.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">FY</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gross Salary</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tax Deducted</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {form16List.map((f: any) => (
                    <tr key={f.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">{f.employeeName || f.employeeId}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{f.financialYear}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-700">₹{fmt(f.grossSalary ?? 0)}</td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">₹{fmt(f.totalTaxDeducted ?? 0)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          f.status === 'GENERATED' ? 'bg-green-100 text-green-800' :
                          f.status === 'ISSUED' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>{f.status || 'PENDING'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!loading && tab === 'slabs' && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Regime</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">FY</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">From</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">To</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate %</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {slabs.length === 0 && (<tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No tax slabs</td></tr>)}
              {slabs.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">{s.regime}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{s.financialYear}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">₹{fmt(s.fromAmount)}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{s.toAmount == null ? '∞' : `₹${fmt(s.toAmount)}`}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{s.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
