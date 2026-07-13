import { useState, useEffect } from 'react';
import { X, FileBarChart, Download, Play, ChevronDown, ChevronRight, ArrowUpDown, Bookmark } from 'lucide-react';
import { reportsApi } from '../../api/reports';
import { useAuthStore } from '../../store/authStore';

const unwrap = (res: any) => res.data?.data ?? res.data;

interface ColumnMeta {
  field: string;
  kind: string;
  enumValues?: string[];
  operators: string[];
}

interface FilterRow {
  field: string;
  op: string;
  value: string;   // primary value (or comma list for `in`)
  value2: string;  // second bound for `between`
}

const OP_LABELS: Record<string, string> = {
  eq: 'equals', neq: 'not equal', in: 'is one of', contains: 'contains',
  gte: '≥', lte: '≤', between: 'between', isNull: 'is empty', notNull: 'is not empty',
};

const labelize = (field: string) =>
  field.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());

// Saved-view filters ({field, op, value}) back into editable filter rows.
function toFilterRows(filters: Array<{ field: string; op: string; value?: any }>): FilterRow[] {
  return (filters ?? []).map(f => {
    if (f.op === 'between' && Array.isArray(f.value)) return { field: f.field, op: f.op, value: String(f.value[0] ?? ''), value2: String(f.value[1] ?? '') };
    if (f.op === 'in' && Array.isArray(f.value)) return { field: f.field, op: f.op, value: f.value.join(', '), value2: '' };
    return { field: f.field, op: f.op, value: f.value != null ? String(f.value) : '', value2: '' };
  });
}

function buildFilterPayload(rows: FilterRow[], columns: ColumnMeta[]) {
  const byField = Object.fromEntries(columns.map(c => [c.field, c]));
  return rows
    .filter(r => r.field && r.op)
    .map(r => {
      const col = byField[r.field];
      const numeric = col?.kind === 'number';
      const coerce = (v: string) => (numeric ? Number(v) : v);
      if (r.op === 'isNull' || r.op === 'notNull') return { field: r.field, op: r.op };
      if (r.op === 'between') return { field: r.field, op: r.op, value: [coerce(r.value), coerce(r.value2)] };
      if (r.op === 'in') return { field: r.field, op: r.op, value: r.value.split(',').map(s => s.trim()).filter(Boolean) };
      if (col?.kind === 'boolean') return { field: r.field, op: r.op, value: r.value === 'true' };
      return { field: r.field, op: r.op, value: coerce(r.value) };
    });
}

function ValueInput({ row, col, onChange }: { row: FilterRow; col?: ColumnMeta; onChange: (patch: Partial<FilterRow>) => void }) {
  if (!col || row.op === 'isNull' || row.op === 'notNull') return null;
  const inputType = col.kind === 'number' ? 'number' : col.kind === 'date' ? 'date' : 'text';

  if (col.kind === 'boolean') {
    return (
      <select className="border rounded px-2 py-1.5 text-sm" value={row.value} onChange={e => onChange({ value: e.target.value })}>
        <option value="">—</option><option value="true">true</option><option value="false">false</option>
      </select>
    );
  }
  if (col.kind === 'enum' && row.op !== 'in') {
    return (
      <select className="border rounded px-2 py-1.5 text-sm" value={row.value} onChange={e => onChange({ value: e.target.value })}>
        <option value="">—</option>
        {(col.enumValues ?? []).map(v => <option key={v} value={v}>{v}</option>)}
      </select>
    );
  }
  if (row.op === 'between') {
    return (
      <span className="flex items-center gap-1">
        <input type={inputType} className="border rounded px-2 py-1.5 text-sm w-32" value={row.value} onChange={e => onChange({ value: e.target.value })} />
        <span className="text-xs text-gray-400">and</span>
        <input type={inputType} className="border rounded px-2 py-1.5 text-sm w-32" value={row.value2} onChange={e => onChange({ value2: e.target.value })} />
      </span>
    );
  }
  return (
    <input type={row.op === 'in' ? 'text' : inputType}
      placeholder={row.op === 'in' ? 'comma, separated, values' : 'value'}
      className="border rounded px-2 py-1.5 text-sm w-48"
      value={row.value} onChange={e => onChange({ value: e.target.value })} />
  );
}

export default function ReportsPage() {
  const [catalog, setCatalog] = useState<Array<{ module: string; reports: any[] }>>([]);
  const [openModules, setOpenModules] = useState<string[]>([]);
  const [report, setReport] = useState<any>(null);
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [filters, setFilters] = useState<FilterRow[]>([]);
  const [result, setResult] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<string | undefined>();
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [running, setRunning] = useState(false);
  const [views, setViews] = useState<any[]>([]);
  const { user } = useAuthStore();

  const loadViews = (code: string) =>
    reportsApi.listViews(code).then(res => setViews(unwrap(res) ?? [])).catch(() => setViews([]));

  useEffect(() => {
    reportsApi.catalog().then(res => {
      const groups = unwrap(res)?.data ?? [];
      setCatalog(groups);
      if (groups.length) setOpenModules([groups[0].module]);
    }).catch(() => setCatalog([]));
  }, []);

  const openReport = async (r: any) => {
    setReport(r);
    setResult(null);
    setFilters([]);
    setPage(1);
    setSortBy(undefined);
    try {
      const res = await reportsApi.describe(r.code);
      setColumns(unwrap(res)?.columns ?? []);
      loadViews(r.code);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not load report definition');
      setColumns([]);
      setViews([]);
    }
  };

  const applyView = (v: any) => {
    setFilters(toFilterRows(v.filters ?? []));
    if (v.sortBy) { setSortBy(v.sortBy); setSortDir(v.sortDir === 'ASC' ? 'ASC' : 'DESC'); }
  };

  const saveCurrentView = async () => {
    if (!report) return;
    const name = prompt('View name (e.g. "Overdue > 30d")');
    if (!name?.trim()) return;
    const shared = confirm('Share this view with everyone in your tenant?\nOK = shared, Cancel = private');
    try {
      await reportsApi.saveView({
        reportCode: report.code, name, shared,
        filters: buildFilterPayload(filters, columns), sortBy, sortDir,
      });
      await loadViews(report.code);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not save view');
    }
  };

  const removeView = async (v: any) => {
    try {
      await reportsApi.deleteView(v.id);
      await loadViews(report.code);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not delete view');
    }
  };

  const run = async (toPage = 1, sb = sortBy, sd = sortDir) => {
    if (!report) return;
    setRunning(true);
    try {
      const res = await reportsApi.run(report.code, {
        filters: buildFilterPayload(filters, columns),
        page: toPage, limit: 50, sortBy: sb, sortDir: sd,
      });
      setResult(unwrap(res));
      setPage(toPage);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Report run failed');
    } finally {
      setRunning(false);
    }
  };

  const toggleSort = (field: string) => {
    const dir = sortBy === field && sortDir === 'DESC' ? 'ASC' : 'DESC';
    setSortBy(field);
    setSortDir(dir);
    run(1, field, dir);
  };

  const exportCsv = async () => {
    if (!report) return;
    try {
      const res = await reportsApi.exportCsv(report.code, {
        filters: buildFilterPayload(filters, columns), sortBy, sortDir,
      });
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${report.code}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Export failed');
    }
  };

  const setFilter = (i: number, patch: Partial<FilterRow>) =>
    setFilters(prev => prev.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const cell = (v: any) => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.limit)) : 1;
  const filterableColumns = columns.filter(c => c.operators.length > 0 && c.field !== 'tenantId');
  const visibleColumns = columns.filter(c => c.field !== 'tenantId');

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><FileBarChart className="h-5 w-5" />Reports</h1>
        <p className="text-sm text-gray-500">Every module's operational reports. Any column of a report can be filtered with type-aware operators, sorted, and exported to CSV.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border max-h-[75vh] overflow-y-auto">
          {catalog.length === 0 && <p className="p-4 text-sm text-gray-400">No reports available for your role.</p>}
          {catalog.map(group => (
            <div key={group.module} className="border-b last:border-b-0">
              <button onClick={() => setOpenModules(prev => prev.includes(group.module) ? prev.filter(m => m !== group.module) : [...prev, group.module])}
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                <span className="uppercase text-xs tracking-wide">{group.module}</span>
                {openModules.includes(group.module) ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {openModules.includes(group.module) && group.reports.map((r: any) => (
                <button key={r.code} onClick={() => openReport(r)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${report?.code === r.code ? 'bg-blue-50 text-blue-700' : 'text-gray-600'}`}>
                  {r.name}
                </button>
              ))}
            </div>
          ))}
        </div>

        <div className="lg:col-span-3 space-y-4">
          {!report && <div className="bg-white rounded-xl border p-10 text-center text-sm text-gray-400">Pick a report to configure its filters and run it.</div>}
          {report && (
            <>
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{report.name}</h2>
                    <p className="text-xs text-gray-500">{report.description}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => run(1)} disabled={running}
                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 disabled:opacity-50">
                      <Play className="h-3.5 w-3.5" />{running ? 'Running…' : 'Run'}
                    </button>
                    <button onClick={saveCurrentView}
                      className="px-3 py-1.5 border rounded-lg text-sm flex items-center gap-1">
                      <Bookmark className="h-3.5 w-3.5" />Save View
                    </button>
                    <button onClick={exportCsv} disabled={!result}
                      className="px-3 py-1.5 border rounded-lg text-sm flex items-center gap-1 disabled:opacity-40">
                      <Download className="h-3.5 w-3.5" />CSV
                    </button>
                  </div>
                </div>

                {views.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {views.map(v => (
                      <span key={v.id} className="inline-flex items-center gap-1 bg-gray-100 rounded-full pl-3 pr-1.5 py-1 text-xs">
                        <button onClick={() => applyView(v)} className="hover:text-blue-600" title="Apply this view's filters">
                          {v.name}{v.shared ? ' · shared' : ''}
                        </button>
                        {v.createdByUserId === user?.id && (
                          <button onClick={() => removeView(v)} className="text-gray-400 hover:text-red-500" title="Delete view">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-3 space-y-2">
                  {filters.map((f, i) => {
                    const col = columns.find(c => c.field === f.field);
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-2">
                        <select className="border rounded px-2 py-1.5 text-sm" value={f.field}
                          onChange={e => {
                            const next = columns.find(c => c.field === e.target.value);
                            setFilter(i, { field: e.target.value, op: next?.operators[0] ?? 'eq', value: '', value2: '' });
                          }}>
                          <option value="">field…</option>
                          {filterableColumns.map(c => <option key={c.field} value={c.field}>{labelize(c.field)}</option>)}
                        </select>
                        <select className="border rounded px-2 py-1.5 text-sm" value={f.op}
                          onChange={e => setFilter(i, { op: e.target.value, value: '', value2: '' })}>
                          {(col?.operators ?? []).map(op => <option key={op} value={op}>{OP_LABELS[op] ?? op}</option>)}
                        </select>
                        <ValueInput row={f} col={col} onChange={patch => setFilter(i, patch)} />
                        <button onClick={() => setFilters(prev => prev.filter((_, j) => j !== i))} className="text-red-400"><X className="h-4 w-4" /></button>
                      </div>
                    );
                  })}
                  <button onClick={() => setFilters(prev => [...prev, { field: '', op: 'eq', value: '', value2: '' }])}
                    className="text-sm text-blue-600">+ Add filter</button>
                </div>
              </div>

              {result && (
                <div className="bg-white rounded-xl border">
                  <div className="flex items-center justify-between px-4 py-2 border-b text-sm text-gray-500">
                    <span>{result.total} row(s)</span>
                    <span className="flex items-center gap-2">
                      <button onClick={() => run(page - 1)} disabled={page <= 1} className="px-2 py-1 border rounded disabled:opacity-40">‹</button>
                      page {page} / {totalPages}
                      <button onClick={() => run(page + 1)} disabled={page >= totalPages} className="px-2 py-1 border rounded disabled:opacity-40">›</button>
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-[60vh]">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          {visibleColumns.map(c => (
                            <th key={c.field} className="px-3 py-2 text-left whitespace-nowrap">
                              <button onClick={() => toggleSort(c.field)} className="flex items-center gap-1 font-semibold text-gray-600">
                                {labelize(c.field)}
                                {sortBy === c.field && <ArrowUpDown className="h-3 w-3" />}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {result.data.length === 0 && (
                          <tr><td colSpan={visibleColumns.length} className="px-3 py-6 text-center text-gray-400">No rows match these filters.</td></tr>
                        )}
                        {result.data.map((row: any, i: number) => (
                          <tr key={row.id ?? i} className="hover:bg-gray-50">
                            {visibleColumns.map(c => (
                              <td key={c.field} className="px-3 py-1.5 whitespace-nowrap max-w-56 truncate" title={cell(row[c.field])}>
                                {cell(row[c.field])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
