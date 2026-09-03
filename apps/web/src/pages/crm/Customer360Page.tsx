import { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Banknote,
  ShoppingCart,
  Target,
  Phone,
  FileSignature,
  Ticket,
  User,
  CreditCard,
  AlertTriangle,
  Search,
  DollarSign,
  Receipt,
  TrendingUp,
} from 'lucide-react';
import { customer360Api } from '../../api/customer360';
import { financeApi } from '../../api/finance';

const unwrap = (res: any) => res.data?.data ?? res.data;

const fmtMoney = (n: number | undefined | null, currency = 'USD') => {
  if (n == null) return '—';
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return Number(n).toFixed(2);
  }
};

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString() : '—';

const TYPE_META: Record<
  string,
  { icon: any; color: string; label: string }
> = {
  INVOICE: { icon: FileText, color: 'bg-blue-100 text-blue-700', label: 'Invoice' },
  RECEIPT: { icon: Banknote, color: 'bg-green-100 text-green-700', label: 'Receipt' },
  SALES_ORDER: { icon: ShoppingCart, color: 'bg-indigo-100 text-indigo-700', label: 'Sales Order' },
  OPPORTUNITY: { icon: Target, color: 'bg-purple-100 text-purple-700', label: 'Opportunity' },
  ACTIVITY: { icon: Phone, color: 'bg-amber-100 text-amber-700', label: 'Activity' },
  QUOTE: { icon: FileSignature, color: 'bg-cyan-100 text-cyan-700', label: 'Quote' },
  TICKET: { icon: Ticket, color: 'bg-rose-100 text-rose-700', label: 'Ticket' },
};

const utilizationColor = (pct: number) => {
  if (pct > 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-amber-500';
  return 'bg-green-500';
};

export default function Customer360Page() {
  const [customers, setCustomers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    financeApi
      .getCustomers({ limit: 500 })
      .then((res) => {
        const list = unwrap(res);
        const rows = Array.isArray(list) ? list : list?.items ?? list?.data ?? [];
        setCustomers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setData(null);
      return;
    }
    setLoading(true);
    customer360Api
      .get(selectedId)
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [selectedId]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return customers;
    return customers.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(s) ||
        (c.code || '').toLowerCase().includes(s) ||
        (c.email || '').toLowerCase().includes(s),
    );
  }, [customers, search]);

  const customer = data?.customer;
  const fin = data?.financialSummary;
  const counts = data?.counts;
  const currency = customer?.currency || 'USD';
  const util = fin?.creditUtilization ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
          <User className="h-6 w-6" /> Customer 360
        </h1>
        <p className="text-sm text-gray-500">
          Unified financial summary and activity timeline for a customer.
        </p>
      </div>

      {/* Picker */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers by name, code, email…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">— Select a customer —</option>
          {filtered.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code ? `${c.code} — ${c.name}` : c.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="text-sm text-gray-500">Loading…</div>}

      {!loading && !selectedId && (
        <div className="text-sm text-gray-500">
          Select a customer above to see their 360 view.
        </div>
      )}

      {!loading && data && customer && (
        <>
          {/* Header card */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">
                  {customer.name}
                </h2>
                <div className="text-sm text-gray-500 mt-1 space-y-0.5">
                  {customer.code && <div>Code: {customer.code}</div>}
                  {customer.email && <div>{customer.email}</div>}
                  {customer.phone && <div>{customer.phone}</div>}
                  {customer.creditRating && (
                    <div>Rating: {customer.creditRating}</div>
                  )}
                </div>
              </div>
              <div className="w-full sm:w-72">
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-600 flex items-center gap-1">
                    <CreditCard className="h-4 w-4" /> Credit Utilization
                  </span>
                  <span className="font-medium text-gray-900">{util}%</span>
                </div>
                <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${utilizationColor(util)}`}
                    style={{ width: `${Math.min(util, 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>
                    Used {fmtMoney(customer.creditExposure, currency)}
                  </span>
                  <span>
                    Limit {fmtMoney(customer.creditLimit, currency)}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Available {fmtMoney(customer.creditAvailable, currency)}
                </div>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <SummaryCard
              icon={DollarSign}
              label="Outstanding"
              value={fmtMoney(fin?.outstandingBalance, currency)}
              tone="text-gray-900"
            />
            <SummaryCard
              icon={FileText}
              label="Total Invoiced"
              value={fmtMoney(fin?.totalInvoiced, currency)}
              tone="text-gray-900"
            />
            <SummaryCard
              icon={Receipt}
              label="Total Received"
              value={fmtMoney(fin?.totalReceived, currency)}
              tone="text-green-700"
            />
            <SummaryCard
              icon={AlertTriangle}
              label="Overdue"
              value={fmtMoney(fin?.overdueAmount, currency)}
              tone={fin?.overdueAmount > 0 ? 'text-red-600' : 'text-gray-900'}
            />
            <SummaryCard
              icon={Ticket}
              label="Open Tickets"
              value={String(counts?.openTickets ?? 0)}
              tone="text-gray-900"
            />
            <SummaryCard
              icon={Target}
              label="Open Opportunities"
              value={String(counts?.openOpportunities ?? 0)}
              tone="text-gray-900"
            />
          </div>

          {fin?.avgDaysToPay > 0 && (
            <div className="text-sm text-gray-500 flex items-center gap-1">
              <TrendingUp className="h-4 w-4" /> Avg days to pay:{' '}
              <span className="font-medium text-gray-700">{fin.avgDaysToPay}</span>
            </div>
          )}

          {/* Timeline */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h3>
            {(data.timeline?.length ?? 0) === 0 ? (
              <div className="text-sm text-gray-500">No activity recorded.</div>
            ) : (
              <ol className="relative border-l border-gray-200 ml-3 space-y-6">
                {data.timeline.map((e: any, idx: number) => {
                  const meta = TYPE_META[e.type] ?? {
                    icon: FileText,
                    color: 'bg-gray-100 text-gray-700',
                    label: e.type,
                  };
                  const Icon = meta.icon;
                  return (
                    <li key={`${e.type}-${e.refId}-${idx}`} className="ml-6">
                      <span
                        className={`absolute -left-3 flex items-center justify-center w-6 h-6 rounded-full ${meta.color}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {e.title}
                          </div>
                          {e.subtitle && (
                            <div className="text-xs text-gray-500">{e.subtitle}</div>
                          )}
                        </div>
                        <div className="text-right">
                          {e.amount != null && (
                            <div className="text-sm font-medium text-gray-900">
                              {fmtMoney(e.amount, currency)}
                            </div>
                          )}
                          <div className="text-xs text-gray-400">{fmtDate(e.date)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] uppercase tracking-wide text-gray-400">
                          {meta.label}
                        </span>
                        {e.status && (
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[10px] font-medium">
                            {e.status}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
        <Icon className="h-4 w-4" /> {label}
      </div>
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
