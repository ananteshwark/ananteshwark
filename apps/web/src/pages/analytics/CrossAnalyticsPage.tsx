import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { crossAnalyticsApi } from '../../api/crossAnalytics';
import { clsx } from 'clsx';
import { Users, ShoppingCart, DollarSign, Scale } from 'lucide-react';

const fmtNum = (v: any, dp = 0) => {
  const n = Number(v);
  if (!isFinite(n) || isNaN(n)) return '0';
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
};
const fmtCur = (v: any) => {
  const n = Number(v);
  if (!isFinite(n) || isNaN(n)) return '0';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
};
const fmtPct = (v: any) => `${fmtNum(v, 1)}%`;

const KpiCard = ({
  label,
  value,
  subtitle,
  accent = 'text-gray-900',
}: {
  label: string;
  value: React.ReactNode;
  subtitle?: string;
  accent?: string;
}) => (
  <div className="bg-white rounded-xl border p-4">
    <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
    <div className={clsx('mt-2 text-2xl font-bold', accent)}>{value}</div>
    {subtitle && <div className="text-xs text-gray-400 mt-1">{subtitle}</div>}
  </div>
);

// Simple horizontal CSS bar (0-100 ratio of value/max).
const Bar = ({ value, max, color = 'bg-blue-500' }: { value: number; max: number; color?: string }) => {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mt-2">
      <div className={clsx('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
    </div>
  );
};

const Section = ({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) => (
  <section className="mb-8">
    <div className="flex items-center gap-2 mb-3">
      <div className="text-gray-700">{icon}</div>
      <h2 className="text-lg font-semibold">{title}</h2>
    </div>
    {children}
  </section>
);

export default function CrossAnalyticsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['cross-analytics-summary'],
    queryFn: () => crossAnalyticsApi.getSummary(),
  });

  const summary = (data as any)?.data?.data ?? (data as any)?.data ?? null;
  const h2r = summary?.hireToRetire ?? {};
  const p2p = summary?.procureToPay ?? {};
  const o2c = summary?.orderToCash ?? {};
  const fin = summary?.financeRatios ?? {};

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Cross-Module KPIs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Read-only KPI metrics computed across HR, Talent, Procurement, Sales and Finance.
        </p>
      </div>

      {isLoading && <div className="text-gray-500">Loading metrics…</div>}
      {isError && <div className="text-red-600">Failed to load analytics.</div>}

      {!isLoading && !isError && (
        <>
          {/* Hire-to-Retire */}
          <Section title="Hire-to-Retire" icon={<Users className="h-5 w-5" />}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Headcount" value={fmtNum(h2r.headcount)} subtitle={`${fmtNum(h2r.activeCount)} active`} />
              <KpiCard
                label="Attrition (12mo)"
                value={fmtPct(h2r.attritionRatePct)}
                subtitle="leavers / avg headcount"
                accent={Number(h2r.attritionRatePct) > 15 ? 'text-red-600' : 'text-gray-900'}
              />
              <KpiCard label="Avg Tenure" value={`${fmtNum(h2r.avgTenureMonths, 1)} mo`} subtitle="active employees" />
              <KpiCard label="New Hires (12mo)" value={fmtNum(h2r.newHires12mo)} />
              <KpiCard label="Open Requisitions" value={fmtNum(h2r.openRequisitions)} subtitle="published postings" />
              <KpiCard
                label="Offer Acceptance"
                value={fmtPct(h2r.offerAcceptanceRatePct)}
                subtitle="accepted / total offers"
                accent="text-green-600"
              />
            </div>
          </Section>

          {/* Procure-to-Pay */}
          <Section title="Procure-to-Pay" icon={<ShoppingCart className="h-5 w-5" />}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Open POs" value={fmtNum(p2p.openPoCount)} subtitle={`Value ${fmtCur(p2p.openPoValue)}`} />
              <KpiCard label="Spend (12mo)" value={fmtCur(p2p.totalSpend12mo)} />
              <KpiCard label="Avg PO Value" value={fmtCur(p2p.avgPoValue)} />
              <KpiCard label="Payables Outstanding" value={fmtCur(p2p.payablesOutstanding)} />
              <div className="bg-white rounded-xl border p-4 col-span-2">
                <div className="text-xs uppercase tracking-wide text-gray-500">Overdue Payables</div>
                <div className="mt-2 text-2xl font-bold text-red-600">{fmtCur(p2p.overduePayables)}</div>
                <div className="text-xs text-gray-400 mt-1">
                  of {fmtCur(p2p.payablesOutstanding)} outstanding
                </div>
                <Bar value={Number(p2p.overduePayables) || 0} max={Number(p2p.payablesOutstanding) || 0} color="bg-red-500" />
              </div>
            </div>
          </Section>

          {/* Order-to-Cash */}
          <Section title="Order-to-Cash" icon={<DollarSign className="h-5 w-5" />}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Open Orders" value={fmtNum(o2c.openOrders)} subtitle={`Value ${fmtCur(o2c.openOrderValue)}`} />
              <KpiCard label="Revenue (12mo)" value={fmtCur(o2c.revenue12mo)} />
              <KpiCard label="Receivables Outstanding" value={fmtCur(o2c.receivablesOutstanding)} />
              <KpiCard
                label="DSO"
                value={`${fmtNum(o2c.dso, 1)} days`}
                subtitle="days sales outstanding"
                accent={Number(o2c.dso) > 60 ? 'text-red-600' : 'text-gray-900'}
              />
              <KpiCard
                label="Collections Effectiveness"
                value={fmtPct(o2c.collectionsEffectivenessPct)}
                subtitle="collected / (collected + AR)"
                accent="text-green-600"
              />
              <div className="bg-white rounded-xl border p-4 col-span-2">
                <div className="text-xs uppercase tracking-wide text-gray-500">Overdue Receivables</div>
                <div className="mt-2 text-2xl font-bold text-red-600">{fmtCur(o2c.overdueReceivables)}</div>
                <div className="text-xs text-gray-400 mt-1">
                  of {fmtCur(o2c.receivablesOutstanding)} outstanding
                </div>
                <Bar value={Number(o2c.overdueReceivables) || 0} max={Number(o2c.receivablesOutstanding) || 0} color="bg-red-500" />
              </div>
            </div>
          </Section>

          {/* Finance Health */}
          <Section title="Finance Health" icon={<Scale className="h-5 w-5" />}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard label="Current Assets (proxy)" value={fmtCur(fin.currentAssetsProxy)} />
              <KpiCard label="Current Liabilities (proxy)" value={fmtCur(fin.currentLiabilitiesProxy)} />
              <KpiCard
                label="Working Capital"
                value={fmtCur(fin.workingCapital)}
                accent={Number(fin.workingCapital) < 0 ? 'text-red-600' : 'text-green-600'}
              />
              <KpiCard
                label="Current Ratio"
                value={fmtNum(fin.currentRatio, 2)}
                subtitle="assets / liabilities"
                accent={Number(fin.currentRatio) < 1 ? 'text-red-600' : 'text-green-600'}
              />
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Approximate figures{fin.source ? ` (source: ${fin.source === 'gl' ? 'GL account balances' : 'AR/AP outstanding'})` : ''}.
            </p>
          </Section>

          {summary?.generatedAt && (
            <div className="text-xs text-gray-400">
              Generated {new Date(summary.generatedAt).toLocaleString()}
            </div>
          )}
        </>
      )}
    </div>
  );
}
