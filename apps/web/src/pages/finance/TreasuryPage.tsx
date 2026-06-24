import { useState, useEffect } from 'react';
import { financeApi } from '../../api/finance';

const GUARANTEE_STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  EXPIRED: 'bg-gray-100 text-gray-500',
  CLAIMED: 'bg-red-100 text-red-700',
  RELEASED: 'bg-blue-100 text-blue-700',
};

const INSTRUMENT_STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  MATURED: 'bg-yellow-100 text-yellow-700',
  REDEEMED: 'bg-gray-100 text-gray-500',
};

function CashPositionTab() {
  const [summary, setSummary] = useState<any[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ bankAccountId: '', snapshotDate: '', currency: 'USD', openingBalance: '', inflowForecast: '', outflowForecast: '' });

  useEffect(() => { loadSummary(); }, [date]);
  useEffect(() => { loadPositions(); }, []);

  async function loadSummary() {
    try {
      const res = await financeApi.getCashPositionSummary(date);
      setSummary(res.data?.data ?? res.data ?? []);
    } catch {}
  }

  async function loadPositions() {
    try {
      const res = await financeApi.getCashPositions();
      setPositions(res.data?.data ?? res.data ?? []);
    } catch {}
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await financeApi.createCashPosition({
      ...form,
      openingBalance: Number(form.openingBalance),
      inflowForecast: Number(form.inflowForecast || 0),
      outflowForecast: Number(form.outflowForecast || 0),
    });
    setShowForm(false);
    loadSummary();
    loadPositions();
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Cash Position</h2>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">
          + Add Snapshot
        </button>
      </div>

      {summary.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {summary.map((s: any) => (
            <div key={s.currency} className="border rounded p-4 bg-white">
              <div className="text-xs text-gray-500 mb-1">{s.currency}</div>
              <div className="flex justify-between">
                <div>
                  <div className="text-xs text-gray-400">Opening</div>
                  <div className="font-medium">{Number(s.totalOpening).toLocaleString()}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Closing</div>
                  <div className={`font-medium ${Number(s.totalClosing) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                    {Number(s.totalClosing).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="bg-gray-50 border rounded p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Bank Account ID</label>
              <input className="w-full border rounded px-2 py-1" value={form.bankAccountId} onChange={e => setForm({ ...form, bankAccountId: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Snapshot Date</label>
              <input type="date" className="w-full border rounded px-2 py-1" value={form.snapshotDate} onChange={e => setForm({ ...form, snapshotDate: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Currency</label>
              <input className="w-full border rounded px-2 py-1" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} />
            </div>
            <div>
              <label className="block font-medium mb-1">Opening Balance</label>
              <input type="number" className="w-full border rounded px-2 py-1" value={form.openingBalance} onChange={e => setForm({ ...form, openingBalance: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Inflow Forecast</label>
              <input type="number" className="w-full border rounded px-2 py-1" value={form.inflowForecast} onChange={e => setForm({ ...form, inflowForecast: e.target.value })} />
            </div>
            <div>
              <label className="block font-medium mb-1">Outflow Forecast</label>
              <input type="number" className="w-full border rounded px-2 py-1" value={form.outflowForecast} onChange={e => setForm({ ...form, outflowForecast: e.target.value })} />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 border rounded">Cancel</button>
          </div>
        </form>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2 border">Date</th>
            <th className="p-2 border">Currency</th>
            <th className="p-2 border text-right">Opening</th>
            <th className="p-2 border text-right">Inflow</th>
            <th className="p-2 border text-right">Outflow</th>
            <th className="p-2 border text-right">Closing</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p: any) => (
            <tr key={p.id} className="hover:bg-gray-50">
              <td className="p-2 border">{p.snapshotDate}</td>
              <td className="p-2 border">{p.currency}</td>
              <td className="p-2 border text-right">{Number(p.openingBalance).toLocaleString()}</td>
              <td className="p-2 border text-right text-green-600">{Number(p.inflowForecast).toLocaleString()}</td>
              <td className="p-2 border text-right text-red-600">{Number(p.outflowForecast).toLocaleString()}</td>
              <td className="p-2 border text-right font-medium">{Number(p.closingBalance).toLocaleString()}</td>
            </tr>
          ))}
          {positions.length === 0 && (
            <tr><td colSpan={6} className="p-4 text-center text-gray-400">No snapshots</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function BankGuaranteesTab() {
  const [guarantees, setGuarantees] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ referenceNumber: '', beneficiary: '', amount: '', currency: 'USD', issueDate: '', expiryDate: '', purpose: '' });
  const [statusModal, setStatusModal] = useState<any>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await financeApi.getGuarantees();
      setGuarantees(res.data?.data ?? res.data ?? []);
    } catch {}
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await financeApi.createGuarantee({ ...form, amount: Number(form.amount) });
    setShowForm(false);
    load();
  }

  async function handleStatusUpdate(status: string, claimedAmount?: number) {
    if (!statusModal) return;
    await financeApi.updateGuaranteeStatus(statusModal.id, { status, claimedAmount });
    setStatusModal(null);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Bank Guarantees</h2>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">
          + New Guarantee
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-gray-50 border rounded p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Reference Number', key: 'referenceNumber', type: 'text' },
              { label: 'Beneficiary', key: 'beneficiary', type: 'text' },
              { label: 'Amount', key: 'amount', type: 'number' },
              { label: 'Currency', key: 'currency', type: 'text' },
              { label: 'Issue Date', key: 'issueDate', type: 'date' },
              { label: 'Expiry Date', key: 'expiryDate', type: 'date' },
            ].map(f => (
              <div key={f.key}>
                <label className="block font-medium mb-1">{f.label}</label>
                <input type={f.type} className="w-full border rounded px-2 py-1" value={(form as any)[f.key]} onChange={e => setForm({ ...form, [f.key]: e.target.value })} required={f.key !== 'currency'} />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 border rounded">Cancel</button>
          </div>
        </form>
      )}

      {statusModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-72 space-y-3">
            <h3 className="font-semibold">Update Status: {statusModal.referenceNumber}</h3>
            <div className="flex flex-col gap-2">
              <button onClick={() => handleStatusUpdate('CLAIMED', statusModal.amount)} className="px-3 py-2 bg-red-600 text-white rounded text-sm">Claim (full amount)</button>
              <button onClick={() => handleStatusUpdate('RELEASED')} className="px-3 py-2 bg-blue-600 text-white rounded text-sm">Release</button>
              <button onClick={() => handleStatusUpdate('EXPIRED')} className="px-3 py-2 bg-gray-500 text-white rounded text-sm">Mark Expired</button>
              <button onClick={() => setStatusModal(null)} className="px-3 py-2 border rounded text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2 border">Reference</th>
            <th className="p-2 border">Beneficiary</th>
            <th className="p-2 border text-right">Amount</th>
            <th className="p-2 border">Currency</th>
            <th className="p-2 border">Issue</th>
            <th className="p-2 border">Expiry</th>
            <th className="p-2 border">Status</th>
            <th className="p-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {guarantees.map((g: any) => (
            <tr key={g.id} className="hover:bg-gray-50">
              <td className="p-2 border font-mono text-xs">{g.referenceNumber}</td>
              <td className="p-2 border">{g.beneficiary}</td>
              <td className="p-2 border text-right">{Number(g.amount).toLocaleString()}</td>
              <td className="p-2 border">{g.currency}</td>
              <td className="p-2 border">{g.issueDate}</td>
              <td className="p-2 border">{g.expiryDate}</td>
              <td className="p-2 border">
                <span className={`px-2 py-0.5 rounded text-xs ${GUARANTEE_STATUS_STYLES[g.status] ?? ''}`}>{g.status}</span>
              </td>
              <td className="p-2 border">
                {g.status === 'ACTIVE' && (
                  <button onClick={() => setStatusModal(g)} className="text-xs px-2 py-1 border rounded text-gray-600 hover:bg-gray-50">
                    Update
                  </button>
                )}
              </td>
            </tr>
          ))}
          {guarantees.length === 0 && (
            <tr><td colSpan={8} className="p-4 text-center text-gray-400">No bank guarantees</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MoneyMarketTab() {
  const [instruments, setInstruments] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ referenceNumber: '', type: 'DEPOSIT', counterparty: '', faceValue: '', currency: 'USD', interestRate: '', purchaseDate: '', maturityDate: '' });

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const res = await financeApi.getInstruments();
      setInstruments(res.data?.data ?? res.data ?? []);
    } catch {}
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await financeApi.createInstrument({ ...form, faceValue: Number(form.faceValue), interestRate: Number(form.interestRate) });
    setShowForm(false);
    load();
  }

  async function accrue(id: string) {
    try { await financeApi.accrueInstrumentInterest(id); load(); } catch {}
  }

  async function redeem(id: string) {
    try { await financeApi.redeemInstrument(id); load(); } catch {}
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Money Market Instruments</h2>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">
          + New Instrument
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-gray-50 border rounded p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Reference</label>
              <input className="w-full border rounded px-2 py-1" value={form.referenceNumber} onChange={e => setForm({ ...form, referenceNumber: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Type</label>
              <select className="w-full border rounded px-2 py-1" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {['DEPOSIT', 'T_BILL', 'COMMERCIAL_PAPER', 'OTHER'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Counterparty</label>
              <input className="w-full border rounded px-2 py-1" value={form.counterparty} onChange={e => setForm({ ...form, counterparty: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Face Value</label>
              <input type="number" className="w-full border rounded px-2 py-1" value={form.faceValue} onChange={e => setForm({ ...form, faceValue: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Interest Rate (e.g. 0.045)</label>
              <input type="number" step="0.000001" className="w-full border rounded px-2 py-1" value={form.interestRate} onChange={e => setForm({ ...form, interestRate: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Currency</label>
              <input className="w-full border rounded px-2 py-1" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })} />
            </div>
            <div>
              <label className="block font-medium mb-1">Purchase Date</label>
              <input type="date" className="w-full border rounded px-2 py-1" value={form.purchaseDate} onChange={e => setForm({ ...form, purchaseDate: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Maturity Date</label>
              <input type="date" className="w-full border rounded px-2 py-1" value={form.maturityDate} onChange={e => setForm({ ...form, maturityDate: e.target.value })} required />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 border rounded">Cancel</button>
          </div>
        </form>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2 border">Reference</th>
            <th className="p-2 border">Type</th>
            <th className="p-2 border">Counterparty</th>
            <th className="p-2 border text-right">Face Value</th>
            <th className="p-2 border text-right">Rate</th>
            <th className="p-2 border">Maturity</th>
            <th className="p-2 border text-right">Accrued Interest</th>
            <th className="p-2 border">Status</th>
            <th className="p-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {instruments.map((instr: any) => (
            <tr key={instr.id} className="hover:bg-gray-50">
              <td className="p-2 border font-mono text-xs">{instr.referenceNumber}</td>
              <td className="p-2 border">{instr.type}</td>
              <td className="p-2 border">{instr.counterparty}</td>
              <td className="p-2 border text-right">{Number(instr.faceValue).toLocaleString()}</td>
              <td className="p-2 border text-right">{(Number(instr.interestRate) * 100).toFixed(3)}%</td>
              <td className="p-2 border">{instr.maturityDate}</td>
              <td className="p-2 border text-right">{Number(instr.interestAccrued).toLocaleString()}</td>
              <td className="p-2 border">
                <span className={`px-2 py-0.5 rounded text-xs ${INSTRUMENT_STATUS_STYLES[instr.status] ?? ''}`}>{instr.status}</span>
              </td>
              <td className="p-2 border">
                <div className="flex gap-1">
                  {instr.status === 'ACTIVE' && (
                    <button onClick={() => accrue(instr.id)} className="text-xs px-2 py-1 bg-indigo-50 text-indigo-700 rounded border border-indigo-200">
                      Accrue
                    </button>
                  )}
                  {instr.status !== 'REDEEMED' && (
                    <button onClick={() => redeem(instr.id)} className="text-xs px-2 py-1 bg-gray-50 rounded border">
                      Redeem
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
          {instruments.length === 0 && (
            <tr><td colSpan={9} className="p-4 text-center text-gray-400">No instruments</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function LiquidityForecastTab() {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDays = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(thirtyDays);
  const [bucket, setBucket] = useState<'daily' | 'weekly'>('daily');
  const [forecast, setForecast] = useState<any[]>([]);

  async function load() {
    try {
      const res = await financeApi.getLiquidityForecast({ from, to, bucket });
      setForecast(res.data?.data ?? res.data ?? []);
    } catch {}
  }

  const totals = forecast.reduce((acc, row) => ({
    payables: acc.payables + Number(row.payables),
    receivables: acc.receivables + Number(row.receivables),
    net: acc.net + Number(row.net),
  }), { payables: 0, receivables: 0, net: 0 });

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Liquidity Forecast</h2>
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Bucket</label>
          <select value={bucket} onChange={e => setBucket(e.target.value as any)} className="border rounded px-2 py-1 text-sm">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <button onClick={load} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">
          Load Forecast
        </button>
      </div>

      {forecast.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-2">
          <div className="border rounded p-3 text-center">
            <div className="text-xs text-gray-500">Total Payables</div>
            <div className="text-lg font-bold text-red-600">{totals.payables.toLocaleString()}</div>
          </div>
          <div className="border rounded p-3 text-center">
            <div className="text-xs text-gray-500">Total Receivables</div>
            <div className="text-lg font-bold text-green-600">{totals.receivables.toLocaleString()}</div>
          </div>
          <div className="border rounded p-3 text-center">
            <div className="text-xs text-gray-500">Net Cash Flow</div>
            <div className={`text-lg font-bold ${totals.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{totals.net.toLocaleString()}</div>
          </div>
        </div>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2 border">{bucket === 'weekly' ? 'Week of' : 'Date'}</th>
            <th className="p-2 border text-right">Payables (AP)</th>
            <th className="p-2 border text-right">Receivables (AR)</th>
            <th className="p-2 border text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {forecast.map((row: any) => (
            <tr key={row.date} className="hover:bg-gray-50">
              <td className="p-2 border">{row.date}</td>
              <td className="p-2 border text-right text-red-600">{Number(row.payables).toLocaleString()}</td>
              <td className="p-2 border text-right text-green-600">{Number(row.receivables).toLocaleString()}</td>
              <td className={`p-2 border text-right font-medium ${Number(row.net) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {Number(row.net).toLocaleString()}
              </td>
            </tr>
          ))}
          {forecast.length === 0 && (
            <tr><td colSpan={4} className="p-4 text-center text-gray-400">Click "Load Forecast" to view data</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function SweepRulesTab() {
  const [rules, setRules] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', sweepType: 'ZERO_BALANCE', sourceAccountId: '', targetAccountId: '', targetBalance: '0' });

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const [rulesRes, logsRes] = await Promise.all([financeApi.getSweepRules(), financeApi.getSweepLogs()]);
      setRules(rulesRes.data?.data ?? rulesRes.data ?? []);
      setLogs(logsRes.data?.data ?? logsRes.data ?? []);
    } catch {}
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await financeApi.createSweepRule({ ...form, targetBalance: Number(form.targetBalance) });
    setShowForm(false);
    load();
  }

  async function execute(id: string) {
    try { await financeApi.executeSweep(id); load(); } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Sweep failed');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Cash Concentration / Sweep Rules</h2>
        <button onClick={() => setShowForm(!showForm)} className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm">
          + New Rule
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-gray-50 border rounded p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Name</label>
              <input className="w-full border rounded px-2 py-1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Sweep Type</label>
              <select className="w-full border rounded px-2 py-1" value={form.sweepType} onChange={e => setForm({ ...form, sweepType: e.target.value })}>
                <option value="ZERO_BALANCE">Zero Balance (ZBA)</option>
                <option value="TARGET_BALANCE">Target Balance</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Source Account ID</label>
              <input className="w-full border rounded px-2 py-1" value={form.sourceAccountId} onChange={e => setForm({ ...form, sourceAccountId: e.target.value })} required />
            </div>
            <div>
              <label className="block font-medium mb-1">Target Account ID</label>
              <input className="w-full border rounded px-2 py-1" value={form.targetAccountId} onChange={e => setForm({ ...form, targetAccountId: e.target.value })} required />
            </div>
            {form.sweepType === 'TARGET_BALANCE' && (
              <div>
                <label className="block font-medium mb-1">Target Balance</label>
                <input type="number" className="w-full border rounded px-2 py-1" value={form.targetBalance} onChange={e => setForm({ ...form, targetBalance: e.target.value })} />
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-3 py-1.5 bg-blue-600 text-white rounded">Save</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-3 py-1.5 border rounded">Cancel</button>
          </div>
        </form>
      )}

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2 border">Name</th>
            <th className="p-2 border">Type</th>
            <th className="p-2 border">Source → Target</th>
            <th className="p-2 border text-right">Target Bal</th>
            <th className="p-2 border">Active</th>
            <th className="p-2 border">Last Run</th>
            <th className="p-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r: any) => (
            <>
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="p-2 border">{r.name}</td>
                <td className="p-2 border text-xs">{r.sweepType.replace('_', ' ')}</td>
                <td className="p-2 border text-xs font-mono">{r.sourceAccountId.slice(0, 8)}… → {r.targetAccountId.slice(0, 8)}…</td>
                <td className="p-2 border text-right">{Number(r.targetBalance).toLocaleString()}</td>
                <td className="p-2 border">
                  <span className={`px-2 py-0.5 rounded text-xs ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {r.isActive ? 'Active' : 'Off'}
                  </span>
                </td>
                <td className="p-2 border text-xs">{r.lastRunAt ? new Date(r.lastRunAt).toLocaleString() : '—'}</td>
                <td className="p-2 border">
                  <div className="flex gap-1">
                    <button onClick={() => execute(r.id)} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded border border-green-200">Execute</button>
                    <button onClick={() => setExpandedRule(expandedRule === r.id ? null : r.id)} className="text-xs px-2 py-1 border rounded">Logs</button>
                  </div>
                </td>
              </tr>
              {expandedRule === r.id && (
                <tr key={`${r.id}-logs`}>
                  <td colSpan={7} className="p-3 bg-gray-50 border">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-200">
                          <th className="p-1 border">Run At</th>
                          <th className="p-1 border text-right">Transferred</th>
                          <th className="p-1 border text-right">Source Before</th>
                          <th className="p-1 border text-right">Source After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.filter((l: any) => l.sweepRuleId === r.id).map((log: any) => (
                          <tr key={log.id}>
                            <td className="p-1 border">{new Date(log.runAt).toLocaleString()}</td>
                            <td className="p-1 border text-right">{Number(log.amountTransferred).toLocaleString()}</td>
                            <td className="p-1 border text-right">{Number(log.sourceBalanceBefore).toLocaleString()}</td>
                            <td className="p-1 border text-right">{Number(log.sourceBalanceAfter).toLocaleString()}</td>
                          </tr>
                        ))}
                        {logs.filter((l: any) => l.sweepRuleId === r.id).length === 0 && (
                          <tr><td colSpan={4} className="p-2 text-center text-gray-400">No logs</td></tr>
                        )}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </>
          ))}
          {rules.length === 0 && (
            <tr><td colSpan={7} className="p-4 text-center text-gray-400">No sweep rules configured</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const TABS = [
  { key: 'cash', label: 'Cash Position' },
  { key: 'guarantees', label: 'Bank Guarantees' },
  { key: 'money-market', label: 'Money Market' },
  { key: 'liquidity', label: 'Liquidity Forecast' },
  { key: 'sweep', label: 'Cash Sweeping' },
];

export default function TreasuryPage() {
  const [tab, setTab] = useState('cash');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Treasury &amp; Cash Management</h1>
        <p className="text-gray-500 text-sm mt-1">Cash positions, bank guarantees, money market instruments, liquidity forecasting, and cash concentration</p>
      </div>

      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === 'cash' && <CashPositionTab />}
        {tab === 'guarantees' && <BankGuaranteesTab />}
        {tab === 'money-market' && <MoneyMarketTab />}
        {tab === 'liquidity' && <LiquidityForecastTab />}
        {tab === 'sweep' && <SweepRulesTab />}
      </div>
    </div>
  );
}
