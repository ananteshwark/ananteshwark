import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { analyticsApi } from '../../api/analytics';
import { clsx } from 'clsx';
import { Plus, Play, BarChart2, Target, TrendingUp, TrendingDown, Minus, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';

const categoryColor = (c: string) => ({
  FINANCE: 'bg-green-100 text-green-800',
  HR: 'bg-blue-100 text-blue-800',
  SALES: 'bg-purple-100 text-purple-800',
  INVENTORY: 'bg-orange-100 text-orange-800',
  PROCUREMENT: 'bg-yellow-100 text-yellow-800',
  CUSTOM: 'bg-gray-100 text-gray-600',
}[c] ?? 'bg-gray-100 text-gray-600');

const KpiCard = ({ kpi, value, status }: any) => {
  const TrendIcon = status === 'ABOVE' ? TrendingUp : status === 'BELOW' ? TrendingDown : Minus;
  const trendColor = status === 'ABOVE' ? 'text-green-600' : status === 'BELOW' ? 'text-red-600' : 'text-gray-400';
  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="flex justify-between items-start">
        <div className="text-sm text-gray-500">{kpi.name}</div>
        <TrendIcon className={clsx('h-4 w-4', trendColor)} />
      </div>
      <div className="mt-2 text-2xl font-bold">{Number(value).toLocaleString()}{kpi.unit ? ` ${kpi.unit}` : ''}</div>
      {kpi.targetValue != null && <div className="text-xs text-gray-400 mt-1">Target: {Number(kpi.targetValue).toLocaleString()}</div>}
      <div className={clsx('text-xs mt-1 font-medium', trendColor)}>{status}</div>
    </div>
  );
};

export default function AnalyticsPage() {
  const [tab, setTab] = useState<'kpis' | 'reports' | 'budgets' | 'schedules'>('kpis');
  const [showReportModal, setShowReportModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [showKpiModal, setShowKpiModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [runResults, setRunResults] = useState<{ reportName: string; columns: any[]; rows: any[] } | null>(null);
  const [expandedBudget, setExpandedBudget] = useState<string | null>(null);
  const [budgetVariance, setBudgetVariance] = useState<any | null>(null);
  const qc = useQueryClient();

  const { data: dashData } = useQuery({ queryKey: ['kpi-dashboard'], queryFn: () => analyticsApi.getKpiDashboard() });
  const { data: reportsData } = useQuery({ queryKey: ['ana-reports'], queryFn: () => analyticsApi.getReports() });
  const { data: budgetsData } = useQuery({ queryKey: ['ana-budgets'], queryFn: () => analyticsApi.getBudgets() });
  const { data: schedulesData } = useQuery({ queryKey: ['ana-schedules'], queryFn: () => analyticsApi.getSchedules() });

  const kpiResults = dashData?.data ?? [];
  const reports = reportsData?.data?.items ?? [];
  const budgets = budgetsData?.data?.items ?? [];
  const schedules = schedulesData?.data ?? [];

  const createReport = useMutation({ mutationFn: (d: any) => analyticsApi.createReport(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ana-reports'] }); setShowReportModal(false); } });
  const createBudget = useMutation({ mutationFn: (d: any) => analyticsApi.createBudget(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ana-budgets'] }); setShowBudgetModal(false); } });
  const approveBudget = useMutation({ mutationFn: (id: string) => analyticsApi.approveBudget(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['ana-budgets'] }) });
  const createKpi = useMutation({ mutationFn: (d: any) => analyticsApi.createKpi(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['kpi-dashboard'] }); setShowKpiModal(false); } });
  const createSchedule = useMutation({ mutationFn: (d: any) => analyticsApi.createSchedule(d), onSuccess: () => { qc.invalidateQueries({ queryKey: ['ana-schedules'] }); setShowScheduleModal(false); } });

  const runReport = async (report: any) => {
    const res = await analyticsApi.runReport(report.id, {});
    setRunResults({ reportName: report.name, columns: res.data?.columns ?? [], rows: res.data?.rows ?? [] });
  };

  const loadVariance = async (budgetId: string) => {
    if (expandedBudget === budgetId) { setExpandedBudget(null); setBudgetVariance(null); return; }
    const res = await analyticsApi.getBudgetVariance(budgetId);
    setExpandedBudget(budgetId);
    setBudgetVariance(res.data?.data ?? res.data);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics & Reporting</h1>
          <p className="text-gray-500 text-sm mt-1">KPIs, custom reports, budgets, and scheduled delivery</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b">
        {(['kpis', 'reports', 'budgets', 'schedules'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={clsx('px-4 py-2 text-sm font-medium capitalize', tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700')}>
            {t === 'kpis' ? 'KPI Dashboard' : t === 'reports' ? 'Report Builder' : t === 'budgets' ? 'Budgets' : 'Scheduled Reports'}
          </button>
        ))}
      </div>

      {tab === 'kpis' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowKpiModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"><Plus className="h-4 w-4" /> Add KPI</button>
          </div>
          {kpiResults.length === 0 && <div className="text-center py-12 text-gray-400"><Target className="h-12 w-12 mx-auto mb-3 opacity-30" /><div>No KPIs defined yet. Add your first KPI to start tracking performance.</div></div>}
          <div className="grid grid-cols-4 gap-4">
            {kpiResults.map((r: any, i: number) => <KpiCard key={i} kpi={r.kpi} value={r.value} status={r.status} />)}
          </div>
        </div>
      )}

      {tab === 'reports' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowReportModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"><Plus className="h-4 w-4" /> New Report</button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            {reports.length === 0 && <div className="col-span-2 text-center py-8 text-gray-400">No reports defined</div>}
            {reports.map((r: any) => (
              <div key={r.id} className="bg-white rounded-xl border p-4 flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2"><span className="font-semibold">{r.name}</span><span className={clsx('text-xs px-2 py-0.5 rounded-full', categoryColor(r.category))}>{r.category}</span></div>
                  <div className="text-xs text-gray-500 mt-0.5">{r.code} · {r.format}</div>
                  {r.description && <div className="text-xs text-gray-600 mt-1">{r.description}</div>}
                </div>
                <button onClick={() => runReport(r)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 ml-4"><Play className="h-3 w-3" />Run</button>
              </div>
            ))}
          </div>
          {runResults && (
            <div className="bg-white rounded-xl border">
              <div className="flex justify-between items-center px-4 py-3 border-b">
                <div className="font-semibold">{runResults.reportName} — Results</div>
                <button onClick={() => setRunResults(null)} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr>{(runResults.columns.length > 0 ? runResults.columns : Object.keys(runResults.rows[0] ?? {}).map(k => ({ key: k, label: k }))).map((c: any) => <th key={c.key} className="px-4 py-2 text-left font-medium text-gray-600">{c.label}</th>)}</tr></thead>
                  <tbody>
                    {runResults.rows.length === 0 && <tr><td colSpan={99} className="px-4 py-6 text-center text-gray-400">No data</td></tr>}
                    {runResults.rows.map((row: any, i: number) => (
                      <tr key={i} className="border-t hover:bg-gray-50">
                        {(runResults.columns.length > 0 ? runResults.columns : Object.keys(row).map(k => ({ key: k }))).map((c: any) => <td key={c.key} className="px-4 py-2">{row[c.key] ?? '—'}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'budgets' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowBudgetModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"><Plus className="h-4 w-4" /> New Budget</button>
          </div>
          <div className="space-y-3">
            {budgets.length === 0 && <div className="text-center py-8 text-gray-400">No budgets</div>}
            {budgets.map((b: any) => (
              <div key={b.id} className="bg-white rounded-xl border">
                <div className="p-4 flex justify-between items-center">
                  <div>
                    <div className="font-semibold">{b.name} <span className="text-gray-400 font-normal">FY{b.fiscalYear}</span></div>
                    <div className="text-xs text-gray-500 mt-0.5">Total Budget: {Number(b.totalBudget).toLocaleString()} · {b.lines?.length ?? 0} lines</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', b.status === 'APPROVED' || b.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600')}>{b.status}</span>
                    {b.status === 'DRAFT' && <button onClick={() => approveBudget.mutate(b.id)} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100">Approve</button>}
                    <button onClick={() => loadVariance(b.id)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                      <DollarSign className="h-3 w-3" />Variance
                      {expandedBudget === b.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
                {expandedBudget === b.id && budgetVariance && (
                  <div className="border-t px-4 py-3">
                    <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                      <div><div className="text-gray-500 text-xs">Total Budget</div><div className="font-bold">{Number(budgetVariance.totalBudget).toLocaleString()}</div></div>
                      <div><div className="text-gray-500 text-xs">Total Actual</div><div className="font-bold">{Number(budgetVariance.totalActual).toLocaleString()}</div></div>
                      <div><div className="text-gray-500 text-xs">Variance</div><div className={clsx('font-bold', budgetVariance.variance < 0 ? 'text-red-600' : 'text-green-600')}>{Number(budgetVariance.variance).toLocaleString()}</div></div>
                    </div>
                    <table className="w-full text-xs">
                      <thead><tr className="text-gray-500"><th className="text-left py-1">Account</th><th className="text-left">Period</th><th className="text-right">Budget</th><th className="text-right">Actual</th><th className="text-right">Variance</th></tr></thead>
                      <tbody>
                        {(budgetVariance.lines ?? []).map((l: any, i: number) => (
                          <tr key={i} className="border-t">
                            <td className="py-1.5">{l.accountName}</td>
                            <td>{l.period}</td>
                            <td className="text-right">{Number(l.budgetAmount).toLocaleString()}</td>
                            <td className="text-right">{Number(l.actual).toLocaleString()}</td>
                            <td className={clsx('text-right font-medium', l.variance < 0 ? 'text-red-600' : 'text-green-600')}>{Number(l.variance).toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'schedules' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowScheduleModal(true)} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700"><Plus className="h-4 w-4" /> Schedule Report</button>
          </div>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50"><tr>{['Report', 'Frequency', 'Recipients', 'Next Run', 'Active'].map(h => <th key={h} className="px-4 py-3 text-left font-medium text-gray-600">{h}</th>)}</tr></thead>
              <tbody>
                {schedules.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No scheduled reports</td></tr>}
                {schedules.map((s: any) => (
                  <tr key={s.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{s.reportId.slice(0, 8)}…</td>
                    <td className="px-4 py-3">{s.frequency}</td>
                    <td className="px-4 py-3 text-xs">{s.sendTo?.join(', ')}</td>
                    <td className="px-4 py-3 text-xs">{s.nextRunAt ? new Date(s.nextRunAt).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3"><span className={clsx('px-2 py-0.5 rounded-full text-xs', s.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600')}>{s.isActive ? 'Yes' : 'No'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[600px] max-h-[90vh] overflow-y-auto" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); createReport.mutate({ code: f.get('code'), name: f.get('name'), description: f.get('description') || undefined, category: f.get('category'), format: f.get('format'), sqlQuery: f.get('sqlQuery'), parameters: [], columns: [] }); }}>
            <h2 className="text-lg font-semibold mb-4">New Report Definition</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Code</label><input name="code" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Name</label><input name="name" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
              <div><label className="text-xs text-gray-500">Description</label><input name="description" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Category</label>
                  <select name="category" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                    {['FINANCE','HR','SALES','INVENTORY','PROCUREMENT','CUSTOM'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div><label className="text-xs text-gray-500">Format</label>
                  <select name="format" className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                    {['TABLE','BAR_CHART','LINE_CHART','PIE_CHART','KPI_CARD'].map(f => <option key={f} value={f}>{f.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="text-xs text-gray-500">SQL Query</label><textarea name="sqlQuery" required rows={5} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 font-mono" placeholder="SELECT ... FROM ... WHERE tenant_id = $1 ..." /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowReportModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
            </div>
          </form>
        </div>
      )}

      {showKpiModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[500px]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); createKpi.mutate({ code: f.get('code'), name: f.get('name'), description: f.get('description') || undefined, sqlQuery: f.get('sqlQuery'), unit: f.get('unit') || undefined, targetValue: f.get('targetValue') ? Number(f.get('targetValue')) : undefined }); }}>
            <h2 className="text-lg font-semibold mb-4">New KPI</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Code</label><input name="code" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Name</label><input name="name" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Unit</label><input name="unit" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="e.g. %, days, $" /></div>
                <div><label className="text-xs text-gray-500">Target Value</label><input name="targetValue" type="number" step="any" className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              </div>
              <div><label className="text-xs text-gray-500">SQL Query (returns single row with column "value")</label><textarea name="sqlQuery" required rows={3} className="w-full border rounded-lg px-3 py-2 text-sm mt-1 font-mono" placeholder="SELECT COUNT(*) AS value FROM ..." /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowKpiModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
            </div>
          </form>
        </div>
      )}

      {showBudgetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[400px]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); createBudget.mutate({ name: f.get('name'), fiscalYear: Number(f.get('fiscalYear')), notes: f.get('notes') || undefined, lines: [] }); }}>
            <h2 className="text-lg font-semibold mb-4">New Budget</h2>
            <div className="space-y-3">
              <div><label className="text-xs text-gray-500">Name</label><input name="name" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="e.g. FY2026 Operating Budget" /></div>
              <div><label className="text-xs text-gray-500">Fiscal Year</label><input name="fiscalYear" type="number" required defaultValue={new Date().getFullYear()} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-xs text-gray-500">Notes</label><textarea name="notes" rows={2} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowBudgetModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Create</button>
            </div>
          </form>
        </div>
      )}

      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[400px]" onSubmit={e => { e.preventDefault(); const f = new FormData(e.currentTarget); createSchedule.mutate({ reportId: f.get('reportId'), frequency: f.get('frequency'), sendTo: (f.get('sendTo') as string).split(',').map(s => s.trim()).filter(Boolean) }); }}>
            <h2 className="text-lg font-semibold mb-4">Schedule Report</h2>
            <div className="space-y-3">
              <div><label className="text-xs text-gray-500">Report ID (UUID)</label><input name="reportId" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-xs text-gray-500">Frequency</label>
                <select name="frequency" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                  <option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option>
                </select>
              </div>
              <div><label className="text-xs text-gray-500">Send To (comma-separated emails)</label><input name="sendTo" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" placeholder="user@example.com, manager@example.com" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowScheduleModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Schedule</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
