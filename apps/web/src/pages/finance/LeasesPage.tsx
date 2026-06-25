import { useState, useEffect } from 'react';
import {
  Building,
  Plus,
  Play,
  CalendarClock,
  Landmark,
} from 'lucide-react';
import { leaseApi } from '../../api/lease';

const unwrapList = (res: any) => {
  const d = res.data?.data ?? res.data;
  return Array.isArray(d) ? d : d?.items ?? [];
};
const unwrap = (res: any) => res.data?.data ?? res.data;
const num = (v: any) => Number(v) || 0;
const fmt = (v: any) =>
  num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  ACTIVE: 'bg-blue-100 text-blue-700',
  CLOSED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

type Tab = 'leases' | 'post' | 'maturity';

export default function LeasesPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [tab, setTab] = useState<Tab>('leases');
  const [leases, setLeases] = useState<any[]>([]);
  const [portfolio, setPortfolio] = useState<any>(null);
  const [maturity, setMaturity] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    lessorName: '',
    assetDescription: '',
    currency: 'USD',
    startDate: today,
    termMonths: '12',
    paymentAmount: '',
    paymentTiming: 'ARREARS',
    annualDiscountRate: '',
    initialDirectCosts: '',
  });

  const [postForm, setPostForm] = useState({ periodEnd: today, leaseId: '' });
  const [postResult, setPostResult] = useState<any>(null);

  const loadLeases = () =>
    leaseApi.list().then((res) => setLeases(unwrapList(res))).catch(() => setLeases([]));
  const loadPortfolio = () =>
    leaseApi.portfolio().then((res) => setPortfolio(unwrap(res))).catch(() => setPortfolio(null));
  const loadMaturity = () =>
    leaseApi.maturity().then((res) => setMaturity(unwrap(res))).catch(() => setMaturity(null));

  useEffect(() => {
    loadLeases();
    loadPortfolio();
    loadMaturity();
  }, []);

  // PV preview (mirrors the backend ordinary/annuity-due formula).
  const pvPreview = () => {
    const pmt = num(form.paymentAmount);
    const n = parseInt(form.termMonths, 10) || 0;
    const r = num(form.annualDiscountRate) / 100 / 12;
    if (pmt <= 0 || n <= 0) return 0;
    if (r === 0) return pmt * n;
    const ordinary = (pmt * (1 - Math.pow(1 + r, -n))) / r;
    return form.paymentTiming === 'ADVANCE' ? ordinary * (1 + r) : ordinary;
  };
  const rouPreview = pvPreview() + num(form.initialDirectCosts);

  const createLease = async () => {
    if (!form.paymentAmount || num(form.paymentAmount) <= 0) {
      setMsg('Payment amount must be greater than zero');
      return;
    }
    if (!form.termMonths || parseInt(form.termMonths, 10) <= 0) {
      setMsg('Term (months) must be at least 1');
      return;
    }
    setMsg(null);
    try {
      await leaseApi.create({
        lessorName: form.lessorName || undefined,
        assetDescription: form.assetDescription || undefined,
        currency: form.currency || 'USD',
        startDate: form.startDate,
        termMonths: parseInt(form.termMonths, 10),
        paymentAmount: num(form.paymentAmount),
        paymentTiming: form.paymentTiming,
        annualDiscountRate: num(form.annualDiscountRate),
        initialDirectCosts: form.initialDirectCosts ? num(form.initialDirectCosts) : undefined,
      });
      setForm({
        lessorName: '', assetDescription: '', currency: 'USD', startDate: today,
        termMonths: '12', paymentAmount: '', paymentTiming: 'ARREARS',
        annualDiscountRate: '', initialDirectCosts: '',
      });
      setShowForm(false);
      loadLeases();
      loadPortfolio();
      loadMaturity();
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? 'Failed to create lease');
    }
  };

  const openLease = async (id: string) => {
    try {
      const res = await leaseApi.get(id);
      setSelected(unwrap(res));
    } catch {
      setMsg('Failed to load lease');
    }
  };

  const runPosting = async () => {
    if (!postForm.periodEnd) {
      setMsg('Period end is required');
      return;
    }
    setMsg(null);
    try {
      const res = await leaseApi.postPeriods({
        periodEnd: postForm.periodEnd,
        leaseId: postForm.leaseId || undefined,
      });
      setPostResult(unwrap(res));
      loadLeases();
      loadPortfolio();
      loadMaturity();
      if (selected) openLease(selected.lease.id);
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? 'Failed to post periods');
    }
  };

  const Chip = ({ status }: { status: string }) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );

  const TABS: { key: Tab; label: string }[] = [
    { key: 'leases', label: 'Leases' },
    { key: 'post', label: 'Post Periods' },
    { key: 'maturity', label: 'Maturity Analysis' },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <Building className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Lease Accounting</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            IFRS 16 — right-of-use assets, lease liabilities, interest unwinding and straight-line amortisation
          </p>
        </div>
        {tab === 'leases' && (
          <button onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            <Plus className="h-4 w-4" /> New Lease
          </button>
        )}
      </div>

      {msg && <div className="mb-4 p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">{msg}</div>}

      {/* Portfolio cards */}
      {portfolio && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Active/Closed Leases</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{portfolio.leaseCount}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Net ROU Asset</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{fmt(portfolio.netRouAsset)}</div>
            <div className="text-xs text-gray-400 mt-0.5">gross {fmt(portfolio.grossRouAsset)}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Accum. Amortisation</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{fmt(portfolio.accumulatedAmortization)}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-xs text-gray-500">Lease Liability</div>
            <div className="text-2xl font-bold text-gray-900 mt-1">{fmt(portfolio.liabilityBalance)}</div>
          </div>
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Leases ─── */}
      {tab === 'leases' && (
        <>
          {showForm && (
            <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[160px]">
                  <label className="block text-xs text-gray-500 mb-1">Lessor</label>
                  <input value={form.lessorName} onChange={(e) => setForm({ ...form, lessorName: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full" />
                </div>
                <div className="flex-1 min-w-[180px]">
                  <label className="block text-xs text-gray-500 mb-1">Asset Description</label>
                  <input value={form.assetDescription} onChange={(e) => setForm({ ...form, assetDescription: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                  <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Term (months)</label>
                  <input type="number" value={form.termMonths} onChange={(e) => setForm({ ...form, termMonths: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Payment / period</label>
                  <input type="number" value={form.paymentAmount} onChange={(e) => setForm({ ...form, paymentAmount: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Timing</label>
                  <select value={form.paymentTiming} onChange={(e) => setForm({ ...form, paymentTiming: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="ARREARS">Arrears (end)</option>
                    <option value="ADVANCE">Advance (start)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Disc. rate % (annual)</label>
                  <input type="number" value={form.annualDiscountRate} onChange={(e) => setForm({ ...form, annualDiscountRate: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Initial Direct Costs</label>
                  <input type="number" value={form.initialDirectCosts} onChange={(e) => setForm({ ...form, initialDirectCosts: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Currency</label>
                  <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-20" />
                </div>
                <button onClick={createLease}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                  <Plus className="h-4 w-4" /> Create
                </button>
              </div>
              <div className="mt-3 flex gap-6 text-sm text-gray-600">
                <span className="flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5 text-gray-400" /> Lease liability (PV): <strong className="text-gray-900">{fmt(pvPreview())}</strong></span>
                <span>ROU asset: <strong className="text-gray-900">{fmt(rouPreview)}</strong></span>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Lease #</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Asset / Lessor</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Start</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Term</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">ROU Asset</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Liability</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leases.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">No leases</td></tr>
                ) : leases.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openLease(l.id)}>
                    <td className="px-4 py-3 font-medium text-blue-600">{l.leaseNumber}</td>
                    <td className="px-4 py-3 text-gray-700">{l.assetDescription || l.lessorName || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{l.startDate}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{l.termMonths}m</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">{fmt(l.rouAsset)} {l.currency}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(l.liabilityBalance)}</td>
                    <td className="px-4 py-3"><Chip status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Lease detail */}
          {selected && (
            <div className="mt-6 bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-900">{selected.lease.leaseNumber}</h3>
                  <p className="text-xs text-gray-500">
                    {selected.lease.assetDescription || selected.lease.lessorName} · ROU {fmt(selected.lease.rouAsset)} · Net ROU {fmt(selected.netRouAsset)} · Liability {fmt(selected.lease.liabilityBalance)}
                  </p>
                </div>
                <button onClick={() => setSelected(null)} className="text-sm text-gray-400 hover:text-gray-600">Close</button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-y border-gray-200">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">#</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Period End</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Opening</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Payment</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Interest</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Principal</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Closing</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600">Amort.</th>
                      <th className="text-center px-3 py-2 font-medium text-gray-600">Posted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selected.schedule.map((s: any) => (
                      <tr key={s.id} className={s.posted ? 'bg-green-50/40' : ''}>
                        <td className="px-3 py-2 text-gray-500">{s.periodNumber}</td>
                        <td className="px-3 py-2 text-gray-700">{s.periodEnd}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{fmt(s.openingLiability)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{fmt(s.payment)}</td>
                        <td className="px-3 py-2 text-right text-amber-700">{fmt(s.interest)}</td>
                        <td className="px-3 py-2 text-right text-gray-700">{fmt(s.principal)}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{fmt(s.closingLiability)}</td>
                        <td className="px-3 py-2 text-right text-blue-700">{fmt(s.amortization)}</td>
                        <td className="px-3 py-2 text-center">{s.posted ? '✓' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Post Periods ─── */}
      {tab === 'post' && (
        <div className="bg-white rounded-lg border border-gray-200 p-5 max-w-xl">
          <div className="flex items-center gap-2 mb-4">
            <Play className="h-4 w-4 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Post Lease Periods</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Posts the journal entries for every unposted schedule period dated on or before the period
            end: Dr lease liability (principal) + interest expense, Cr bank (payment); Dr amortisation
            expense, Cr accumulated amortisation.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Period End</label>
              <input type="date" value={postForm.periodEnd} onChange={(e) => setPostForm({ ...postForm, periodEnd: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Lease (optional — blank = all)</label>
              <select value={postForm.leaseId} onChange={(e) => setPostForm({ ...postForm, leaseId: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full">
                <option value="">All leases</option>
                {leases.map((l) => <option key={l.id} value={l.id}>{l.leaseNumber}</option>)}
              </select>
            </div>
            <button onClick={runPosting}
              className="w-full px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
              Post Due Periods
            </button>
            {postResult && (
              <div className={`mt-2 p-3 rounded-lg text-sm ${postResult.postedCount > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-600'}`}>
                {postResult.postedCount === 0 ? (
                  <div>No periods due as of this date.</div>
                ) : (
                  <>
                    <div>Posted: <strong>{postResult.postedCount} period{postResult.postedCount === 1 ? '' : 's'}</strong></div>
                    <div>Interest: <strong>{fmt(postResult.totalInterest)}</strong> · Principal: <strong>{fmt(postResult.totalPrincipal)}</strong> · Amortisation: <strong>{fmt(postResult.totalAmortization)}</strong></div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Maturity ─── */}
      {tab === 'maturity' && (
        <>
          {maturity && (
            <div className="mb-4 flex gap-4">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="flex items-center gap-2 text-xs text-gray-500"><CalendarClock className="h-3.5 w-3.5" /> Remaining Principal</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{fmt(maturity.totalPrincipal)}</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-500">Remaining Interest</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{fmt(maturity.totalInterest)}</div>
              </div>
            </div>
          )}
          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Year</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Principal</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Interest</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total Payments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!maturity || (maturity.rows ?? []).length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-gray-400">No outstanding lease liabilities</td></tr>
                ) : maturity.rows.map((r: any) => (
                  <tr key={r.year} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{r.year}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(r.principal)}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{fmt(r.interest)}</td>
                    <td className="px-4 py-3 text-right text-gray-900 font-medium">{fmt(r.payment)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
