import { useState, useEffect } from 'react';
import {
  ArrowRightLeft,
  Plus,
  CheckCircle2,
  Scale,
  AlertTriangle,
  Building2,
} from 'lucide-react';
import { intercompanyApi } from '../../api/intercompany';
import { hrApi } from '../../api/hr';

const unwrapList = (res: any) => {
  const d = res.data?.data ?? res.data;
  return Array.isArray(d) ? d : d?.items ?? [];
};
const unwrap = (res: any) => res.data?.data ?? res.data;
const num = (v: any) => Number(v) || 0;
const fmt = (v: any) => num(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  POSTED: 'bg-blue-100 text-blue-700',
  ELIMINATED: 'bg-green-100 text-green-700',
};

type Tab = 'relationships' | 'transactions' | 'reconciliation';

export default function IntercompanyPage() {
  const [tab, setTab] = useState<Tab>('transactions');
  const [entities, setEntities] = useState<any[]>([]);
  const [relationships, setRelationships] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [recon, setRecon] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [showRelForm, setShowRelForm] = useState(false);
  const [relForm, setRelForm] = useState({
    sellingEntityId: '',
    buyingEntityId: '',
    markupPercent: '',
    eliminationAccountId: '',
    description: '',
  });

  const [showTxnForm, setShowTxnForm] = useState(false);
  const [txnForm, setTxnForm] = useState({
    sellingEntityId: '',
    buyingEntityId: '',
    transactionDate: today,
    baseAmount: '',
    description: '',
  });

  const entityName = (id: string) => entities.find((e) => e.id === id)?.name ?? id;

  // Live preview of markup/total based on an active relationship for the pair.
  const previewMarkupPct = () => {
    const rel = relationships.find(
      (r) =>
        r.isActive &&
        r.sellingEntityId === txnForm.sellingEntityId &&
        r.buyingEntityId === txnForm.buyingEntityId,
    );
    return rel ? num(rel.markupPercent) : 0;
  };
  const previewMarkup = (num(txnForm.baseAmount) * previewMarkupPct()) / 100;
  const previewTotal = num(txnForm.baseAmount) + previewMarkup;

  const loadRelationships = () =>
    intercompanyApi
      .listRelationships()
      .then((res) => setRelationships(unwrapList(res)))
      .catch(() => setRelationships([]));
  const loadTransactions = () =>
    intercompanyApi
      .listTransactions()
      .then((res) => setTransactions(unwrapList(res)))
      .catch(() => setTransactions([]));
  const loadRecon = () =>
    intercompanyApi
      .reconciliation()
      .then((res) => setRecon(unwrap(res)))
      .catch(() => setRecon(null));

  useEffect(() => {
    hrApi
      .getLegalEntities({ limit: 500 })
      .then((res) => setEntities(unwrapList(res)))
      .catch(() => setEntities([]));
    loadRelationships();
    loadTransactions();
    loadRecon();
  }, []);

  const createRelationship = async () => {
    if (!relForm.sellingEntityId || !relForm.buyingEntityId) {
      setMsg('Selling and buying entity are required');
      return;
    }
    if (relForm.sellingEntityId === relForm.buyingEntityId) {
      setMsg('Selling and buying entity must differ');
      return;
    }
    setMsg(null);
    try {
      await intercompanyApi.createRelationship({
        sellingEntityId: relForm.sellingEntityId,
        buyingEntityId: relForm.buyingEntityId,
        markupPercent: relForm.markupPercent ? Number(relForm.markupPercent) : 0,
        eliminationAccountId: relForm.eliminationAccountId || undefined,
        description: relForm.description || undefined,
      });
      setRelForm({ sellingEntityId: '', buyingEntityId: '', markupPercent: '', eliminationAccountId: '', description: '' });
      setShowRelForm(false);
      loadRelationships();
    } catch {
      setMsg('Failed to create relationship');
    }
  };

  const deactivateRelationship = async (id: string) => {
    try {
      await intercompanyApi.updateRelationship(id, { isActive: false });
      loadRelationships();
    } catch {
      setMsg('Failed to deactivate relationship');
    }
  };

  const createTransaction = async () => {
    if (!txnForm.sellingEntityId || !txnForm.buyingEntityId || !txnForm.baseAmount) {
      setMsg('Selling entity, buying entity and base amount are required');
      return;
    }
    if (txnForm.sellingEntityId === txnForm.buyingEntityId) {
      setMsg('Selling and buying entity must differ');
      return;
    }
    setMsg(null);
    try {
      await intercompanyApi.createTransaction({
        sellingEntityId: txnForm.sellingEntityId,
        buyingEntityId: txnForm.buyingEntityId,
        transactionDate: txnForm.transactionDate,
        baseAmount: Number(txnForm.baseAmount),
        description: txnForm.description || undefined,
      });
      setTxnForm({ sellingEntityId: '', buyingEntityId: '', transactionDate: today, baseAmount: '', description: '' });
      setShowTxnForm(false);
      loadTransactions();
      loadRecon();
    } catch {
      setMsg('Failed to create transaction');
    }
  };

  const postTxn = async (id: string) => {
    try {
      await intercompanyApi.postTransaction(id);
      loadTransactions();
      loadRecon();
    } catch {
      setMsg('Failed to post transaction');
    }
  };

  const eliminateTxn = async (id: string) => {
    try {
      await intercompanyApi.eliminateTransaction(id);
      loadTransactions();
      loadRecon();
    } catch {
      setMsg('Failed to eliminate transaction');
    }
  };

  const Chip = ({ status }: { status: string }) => (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );

  const TABS: { key: Tab; label: string }[] = [
    { key: 'relationships', label: 'Relationships' },
    { key: 'transactions', label: 'Transactions' },
    { key: 'reconciliation', label: 'Reconciliation' },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            <h1 className="text-2xl font-bold text-gray-900">Intercompany</h1>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Transactions between legal entities, with markup, posting, elimination and reconciliation
          </p>
        </div>
        {tab === 'relationships' && (
          <button onClick={() => setShowRelForm((s) => !s)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            <Plus className="h-4 w-4" /> New Relationship
          </button>
        )}
        {tab === 'transactions' && (
          <button onClick={() => setShowTxnForm((s) => !s)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
            <Plus className="h-4 w-4" /> New IC Transaction
          </button>
        )}
      </div>

      {msg && <div className="mb-4 p-3 bg-amber-50 text-amber-700 rounded-lg text-sm">{msg}</div>}

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── Relationships ─── */}
      {tab === 'relationships' && (
        <>
          {showRelForm && (
            <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4 flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Selling Entity</label>
                <select value={relForm.sellingEntityId} onChange={(e) => setRelForm({ ...relForm, sellingEntityId: e.target.value })}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-52">
                  <option value="">Select...</option>
                  {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Buying Entity</label>
                <select value={relForm.buyingEntityId} onChange={(e) => setRelForm({ ...relForm, buyingEntityId: e.target.value })}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-52">
                  <option value="">Select...</option>
                  {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Markup %</label>
                <input type="number" value={relForm.markupPercent} onChange={(e) => setRelForm({ ...relForm, markupPercent: e.target.value })}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Elimination Account</label>
                <input value={relForm.eliminationAccountId} onChange={(e) => setRelForm({ ...relForm, eliminationAccountId: e.target.value })}
                  placeholder="Account ID (optional)"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <input value={relForm.description} onChange={(e) => setRelForm({ ...relForm, description: e.target.value })}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48" />
              </div>
              <button onClick={createRelationship}
                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                <Plus className="h-4 w-4" /> Create
              </button>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Selling Entity</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Buying Entity</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Markup %</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Description</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {relationships.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-gray-400">No relationships</td></tr>
                ) : relationships.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{entityName(r.sellingEntityId)}</td>
                    <td className="px-4 py-3 text-gray-700">{entityName(r.buyingEntityId)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{num(r.markupPercent)}%</td>
                    <td className="px-4 py-3 text-gray-600">{r.description || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {r.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {r.isActive && (
                        <button onClick={() => deactivateRelationship(r.id)}
                          className="text-red-600 hover:text-red-800 text-xs">Deactivate</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── Transactions ─── */}
      {tab === 'transactions' && (
        <>
          {showTxnForm && (
            <div className="mb-6 bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Selling Entity</label>
                  <select value={txnForm.sellingEntityId} onChange={(e) => setTxnForm({ ...txnForm, sellingEntityId: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-52">
                    <option value="">Select...</option>
                    {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Buying Entity</label>
                  <select value={txnForm.buyingEntityId} onChange={(e) => setTxnForm({ ...txnForm, buyingEntityId: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-52">
                    <option value="">Select...</option>
                    {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Date</label>
                  <input type="date" value={txnForm.transactionDate} onChange={(e) => setTxnForm({ ...txnForm, transactionDate: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Base Amount</label>
                  <input type="number" value={txnForm.baseAmount} onChange={(e) => setTxnForm({ ...txnForm, baseAmount: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-32" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Description</label>
                  <input value={txnForm.description} onChange={(e) => setTxnForm({ ...txnForm, description: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-56" />
                </div>
                <button onClick={createTransaction}
                  className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                  <Plus className="h-4 w-4" /> Create
                </button>
              </div>
              <div className="mt-3 flex gap-6 text-sm text-gray-600">
                <span>Markup ({previewMarkupPct()}%): <strong className="text-gray-900">{fmt(previewMarkup)}</strong></span>
                <span>Total: <strong className="text-gray-900">{fmt(previewTotal)}</strong></span>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">IC #</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Selling</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Buying</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Base</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Markup</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Total</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {transactions.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-8 text-gray-400">No transactions</td></tr>
                ) : transactions.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{t.icNumber}</td>
                    <td className="px-4 py-3 text-gray-600">{t.transactionDate}</td>
                    <td className="px-4 py-3 text-gray-700">{entityName(t.sellingEntityId)}</td>
                    <td className="px-4 py-3 text-gray-700">{entityName(t.buyingEntityId)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(t.baseAmount)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(t.markupAmount)}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(t.totalAmount)}</td>
                    <td className="px-4 py-3"><Chip status={t.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {t.status === 'DRAFT' && (
                          <button onClick={() => postTxn(t.id)} className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Post
                          </button>
                        )}
                        {t.status === 'POSTED' && (
                          <button onClick={() => eliminateTxn(t.id)} className="flex items-center gap-1 text-green-600 hover:text-green-800 text-xs">
                            <Scale className="h-3.5 w-3.5" /> Eliminate
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ─── Reconciliation ─── */}
      {tab === 'reconciliation' && (
        <>
          {recon && (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-500">Total IC AR</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{fmt(recon.summary?.totalIcAr)}</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-500">Total IC AP</div>
                <div className="text-2xl font-bold text-gray-900 mt-1">{fmt(recon.summary?.totalIcAp)}</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-500">Net Difference</div>
                <div className={`text-2xl font-bold mt-1 ${num(recon.summary?.netDifference) === 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(recon.summary?.netDifference)}</div>
              </div>
              <div className="bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-xs text-gray-500">Imbalanced Pairs</div>
                <div className={`text-2xl font-bold mt-1 ${num(recon.summary?.imbalancedPairs) === 0 ? 'text-green-600' : 'text-red-600'}`}>{num(recon.summary?.imbalancedPairs)}</div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Selling Entity</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Buying Entity</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">IC AR</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">IC AP</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Net Diff</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600"># Txns</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!recon || (recon.pairs ?? []).length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">No posted intercompany balances</td></tr>
                ) : recon.pairs.map((p: any, i: number) => (
                  <tr key={i} className={`hover:bg-gray-50 ${p.balanced ? '' : 'bg-red-50'}`}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      <div className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-gray-400" />{p.sellingEntityName}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{p.buyingEntityName}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(p.icAr)}</td>
                    <td className="px-4 py-3 text-right text-gray-700">{fmt(p.icAp)}</td>
                    <td className={`px-4 py-3 text-right font-medium ${p.balanced ? 'text-gray-700' : 'text-red-600'}`}>{fmt(p.netDifference)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{p.count}</td>
                    <td className="px-4 py-3">
                      {p.balanced ? (
                        <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle2 className="h-3.5 w-3.5" /> Balanced</span>
                      ) : (
                        <span className="flex items-center gap-1 text-red-600 text-xs"><AlertTriangle className="h-3.5 w-3.5" /> Imbalanced</span>
                      )}
                    </td>
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
