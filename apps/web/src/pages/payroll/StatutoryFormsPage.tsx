import { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Printer, Mail, CheckCircle, XCircle, DollarSign } from 'lucide-react';
import { payrollApi } from '../../api/payroll';
import { apiClient } from '../../api/client';

type Tab = 'us' | 'eosb' | 'wps';

interface StatutoryFormRow {
  id: string;
  formType: string;
  taxYear: number;
  recipientName: string | null;
  totalAmount: number;
  recipientCount: number;
  status: string;
  generatedAt: string;
}

interface EosbRow {
  id: string;
  employeeName: string | null;
  lastDrawnBasic: number;
  yearsOfService: number;
  eosbAmount: number;
  currency: string;
  status: string;
  separationDate: string;
}

const money = (n: number) =>
  new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

const unwrap = (res: any) => res.data?.data ?? res.data ?? [];

export default function StatutoryFormsPage() {
  const [tab, setTab] = useState<Tab>('us');
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Statutory Forms</h1>
      <p className="text-sm text-gray-500 mb-6">
        Year-end and settlement forms — US (W-2 / 1099-NEC / W-3 / SSA), UAE (EOSB &amp; WPS).
      </p>

      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {([
          ['us', 'US Forms'],
          ['eosb', 'UAE EOSB'],
          ['wps', 'WPS Validation'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              tab === key
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'us' && <UsFormsTab />}
      {tab === 'eosb' && <EosbTab />}
      {tab === 'wps' && <WpsTab />}
    </div>
  );
}

// ─── US Forms ────────────────────────────────────────────────────────────────

function UsFormsTab() {
  const [taxYear, setTaxYear] = useState(new Date().getFullYear() - 1);
  const [employerEin, setEmployerEin] = useState('');
  const [employerName, setEmployerName] = useState('');
  const [forms, setForms] = useState<StatutoryFormRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // 1099 inputs
  const [recipientName, setRecipientName] = useState('');
  const [recipientTin, setRecipientTin] = useState('');
  const [nec, setNec] = useState('');

  const refetch = useCallback(async () => {
    const res = await payrollApi.getStatutoryForms({ taxYear });
    setForms(unwrap(res));
  }, [taxYear]);

  useEffect(() => { refetch(); }, [refetch]);

  const run = async (label: string, fn: () => Promise<any>) => {
    setBusy(label);
    try {
      const res = await fn();
      const data = res.data?.data ?? res.data;
      if (data?.generated !== undefined) {
        alert(`Generated ${data.generated} W-2(s), skipped ${data.skipped}.`);
      }
      await refetch();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? `Failed: ${label}`);
    } finally {
      setBusy(null);
    }
  };

  const options = () => ({ employerEin, employerName });

  const printForm = async (id: string) => {
    const res = await apiClient.get(payrollApi.w2PrintUrl(id), { responseType: 'text' });
    const w = window.open('', '_blank');
    if (w) { w.document.write(res.data); w.document.close(); }
  };

  const downloadForm = async (id: string, formType: string, year: number) => {
    const res = await apiClient.get(payrollApi.downloadStatutoryFormUrl(id), { responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${formType}-${year}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const emailForm = async (id: string) => {
    const to = prompt('Recipient email address:');
    if (!to) return;
    try {
      const res = await payrollApi.emailStatutoryForm(id, to);
      const data = res.data?.data ?? res.data;
      alert(data?.status === 'SENT' ? 'Email sent.' : `Email ${data?.status}: ${data?.error ?? ''}`);
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to send email');
    }
  };

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tax Year</label>
            <input type="number" value={taxYear} onChange={(e) => setTaxYear(parseInt(e.target.value, 10) || taxYear)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employer EIN</label>
            <input type="text" value={employerEin} placeholder="12-3456789" onChange={(e) => setEmployerEin(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employer Name</label>
            <input type="text" value={employerName} onChange={(e) => setEmployerName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button disabled={!!busy} onClick={() => run('w2batch', () => payrollApi.generateW2Batch({ taxYear, options: options() }))}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            Generate All W-2s
          </button>
          <button disabled={!!busy} onClick={() => run('w3', () => payrollApi.generateW3({ taxYear, options: options() }))}
            className="px-4 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">
            Generate W-3
          </button>
          <button disabled={!!busy} onClick={() => run('efw2', () => payrollApi.generateEfw2({ taxYear, options: options() }))}
            className="px-4 py-2 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50">
            Generate SSA EFW2
          </button>
        </div>
      </div>

      {/* 1099-NEC */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h3 className="text-base font-medium text-gray-800 mb-3">Generate 1099-NEC (Contractor)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <input type="text" value={recipientName} placeholder="Recipient name" onChange={(e) => setRecipientName(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="text" value={recipientTin} placeholder="Recipient TIN" onChange={(e) => setRecipientTin(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="number" value={nec} placeholder="Compensation (box 1)" onChange={(e) => setNec(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
        </div>
        <button disabled={!!busy || !nec} onClick={() => run('1099', () => payrollApi.generate1099Nec({
          taxYear, options: { recipientName, recipientTin, nonemployeeCompensation: Number(nec), payerName: employerName, payerTin: employerEin },
        }))}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          Generate 1099-NEC
        </button>
      </div>

      {/* Generated forms */}
      <h3 className="text-base font-semibold text-gray-800 mb-3">Generated Forms — {taxYear}</h3>
      {forms.length === 0 ? (
        <p className="text-sm text-gray-400">No forms generated for this year yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Form</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {forms.map((f) => (
                <tr key={f.id} className={`hover:bg-gray-50 ${f.status === 'SUPERSEDED' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-sm font-medium text-indigo-700">{f.formType}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{f.recipientName ?? `${f.recipientCount} recipient(s)`}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-gray-900">{money(f.totalAmount)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{f.status}</td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-3">
                      {f.formType === 'W2' && (
                        <button onClick={() => printForm(f.id)} className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800" title="Print">
                          <Printer className="w-4 h-4" />
                        </button>
                      )}
                      {f.formType === 'EFW2' && (
                        <button onClick={() => downloadForm(f.id, f.formType, f.taxYear)} className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800" title="Download">
                          <Download className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => emailForm(f.id)} className="flex items-center gap-1 text-gray-500 hover:text-gray-700" title="Email">
                        <Mail className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── EOSB ────────────────────────────────────────────────────────────────────

function EosbTab() {
  const [rows, setRows] = useState<EosbRow[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [form, setForm] = useState({ employeeId: '', lastDrawnBasic: '', joinDate: '', separationDate: '', terminationType: 'RESIGNATION' });
  const [preview, setPreview] = useState<number | null>(null);

  const previewEosb = async () => {
    const basic = Number(form.lastDrawnBasic);
    if (!basic || !form.joinDate || !form.separationDate) { setPreview(null); return; }
    const years = (new Date(form.separationDate).getTime() - new Date(form.joinDate).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (years <= 0) { setPreview(null); return; }
    try {
      const res = await payrollApi.calculateEosb({ lastDrawnBasic: basic, yearsOfService: years });
      const data = res.data?.data ?? res.data;
      setPreview(data?.amount ?? null);
    } catch { setPreview(null); }
  };

  const refetch = useCallback(async () => {
    const res = await payrollApi.getEosbSettlements();
    setRows(unwrap(res));
  }, []);

  useEffect(() => {
    refetch();
    payrollApi.getEmployees({ limit: 500 }).then((res) => {
      const data = res.data?.data?.items ?? res.data?.items ?? res.data?.data ?? res.data ?? [];
      setEmployees(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, [refetch]);

  const create = async () => {
    try {
      await payrollApi.createEosb({
        ...form,
        lastDrawnBasic: Number(form.lastDrawnBasic),
      });
      setForm({ employeeId: '', lastDrawnBasic: '', joinDate: '', separationDate: '', terminationType: 'RESIGNATION' });
      setPreview(null);
      await refetch();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to create EOSB settlement');
    }
  };

  const act = async (fn: () => Promise<any>) => {
    try { await fn(); await refetch(); }
    catch (err: any) { alert(err?.response?.data?.message ?? 'Action failed'); }
  };

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h3 className="text-base font-medium text-gray-800 mb-3">New EOSB Settlement</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">Select employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</option>
            ))}
          </select>
          <input type="number" value={form.lastDrawnBasic} placeholder="Last drawn basic (monthly)"
            onChange={(e) => setForm({ ...form, lastDrawnBasic: e.target.value })} onBlur={previewEosb}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="date" value={form.joinDate} onChange={(e) => setForm({ ...form, joinDate: e.target.value })} onBlur={previewEosb}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <input type="date" value={form.separationDate} onChange={(e) => setForm({ ...form, separationDate: e.target.value })} onBlur={previewEosb}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <select value={form.terminationType} onChange={(e) => setForm({ ...form, terminationType: e.target.value })}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="RESIGNATION">Resignation</option>
            <option value="TERMINATION">Termination</option>
            <option value="END_OF_CONTRACT">End of contract</option>
          </select>
        </div>
        {preview !== null && (
          <p className="text-sm text-gray-600 mb-2">Estimated EOSB: <span className="font-semibold">{money(preview)} AED</span></p>
        )}
        <div className="flex gap-2">
          <button disabled={!form.employeeId || !form.lastDrawnBasic || !form.joinDate || !form.separationDate}
            onClick={create}
            className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
            Create Settlement
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">No EOSB settlements yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Employee</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Years</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">EOSB</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-800">{r.employeeName ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-600">{Number(r.yearsOfService).toFixed(2)}</td>
                  <td className="px-4 py-3 text-sm text-right font-mono text-gray-900">{money(r.eosbAmount)} {r.currency}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      r.status === 'PAID' ? 'bg-green-100 text-green-800'
                      : r.status === 'APPROVED' ? 'bg-blue-100 text-blue-800'
                      : r.status === 'REJECTED' ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-700'
                    }`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-3">
                      {r.status === 'PENDING' && (
                        <>
                          <button onClick={() => act(() => payrollApi.approveEosb(r.id))} className="flex items-center gap-1 text-green-600 hover:text-green-800" title="Approve">
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => act(() => payrollApi.rejectEosb(r.id))} className="flex items-center gap-1 text-red-500 hover:text-red-700" title="Reject">
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {r.status === 'APPROVED' && (
                        <button onClick={() => act(() => payrollApi.payEosb(r.id))} className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800" title="Mark paid">
                          <DollarSign className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── WPS Validation ──────────────────────────────────────────────────────────

function WpsTab() {
  const [content, setContent] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const validate = async () => {
    setBusy(true);
    try {
      const res = await payrollApi.validateWps(content);
      setResult(res.data?.data ?? res.data);
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Validation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h3 className="text-base font-medium text-gray-800 mb-2">Validate WPS SIF File</h3>
        <p className="text-xs text-gray-500 mb-3">Paste a WPS SIF file body (EDR + EER pipe-delimited records).</p>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={8}
          placeholder="EDR|123456789012|2026|05|AED|9000.00|2&#10;EER|E001|...|4500.00|AED"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono mb-3" />
        <button disabled={busy || !content} onClick={validate}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          <FileText className="w-4 h-4 inline mr-1" /> {busy ? 'Validating…' : 'Validate'}
        </button>
      </div>

      {result && (
        <div className={`rounded-lg border p-5 ${result.valid ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <p className={`font-semibold mb-3 ${result.valid ? 'text-green-800' : 'text-red-800'}`}>
            {result.valid ? '✓ Valid SIF file' : '✗ Validation failed'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
            <div><span className="text-gray-500">EDR:</span> {result.summary?.edrCount}</div>
            <div><span className="text-gray-500">EER:</span> {result.summary?.eerCount}</div>
            <div><span className="text-gray-500">Declared:</span> {money(result.summary?.declaredTotal ?? 0)}</div>
            <div><span className="text-gray-500">Computed:</span> {money(result.summary?.computedTotal ?? 0)}</div>
          </div>
          {result.errors?.length > 0 && (
            <div className="mb-3">
              <p className="text-sm font-medium text-red-700 mb-1">Errors</p>
              <ul className="list-disc list-inside text-sm text-red-700">
                {result.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
          {result.warnings?.length > 0 && (
            <div>
              <p className="text-sm font-medium text-amber-700 mb-1">Warnings</p>
              <ul className="list-disc list-inside text-sm text-amber-700">
                {result.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
