import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileText, CheckCircle } from 'lucide-react';
import { payrollApi } from '../../api/payroll';

type BankFileFormat = 'NEFT_RTGS' | 'NACHA_ACH' | 'WPS_SIF' | 'SEPA_XML';

interface BankFileRun {
  id: string;
  format: BankFileFormat;
  status: 'GENERATED' | 'SUPERSEDED';
  employeeCount: number;
  totalAmount: number;
  generatedAt: string;
  generatedBy: string | null;
}

const FORMAT_LABELS: Record<BankFileFormat, string> = {
  NEFT_RTGS: 'NEFT/RTGS (India)',
  NACHA_ACH: 'NACHA ACH (US)',
  WPS_SIF: 'WPS SIF (UAE)',
  SEPA_XML: 'SEPA XML (EU/UK)',
};

const FORMAT_FIELDS: Record<BankFileFormat, { key: string; label: string; placeholder: string }[]> = {
  NEFT_RTGS: [
    { key: 'companyName', label: 'Company Name', placeholder: 'ACME CORP' },
    { key: 'paymentDate', label: 'Payment Date', placeholder: 'YYYY-MM-DD' },
  ],
  NACHA_ACH: [
    { key: 'companyName', label: 'Company Name', placeholder: 'PAYROLL CO' },
    { key: 'odfiRoutingNumber', label: 'ODFI Routing Number', placeholder: '000000000' },
    { key: 'companyIdentification', label: 'Company Tax ID', placeholder: '0000000000' },
    { key: 'paymentDate', label: 'Effective Date', placeholder: 'YYYY-MM-DD' },
  ],
  WPS_SIF: [
    { key: 'molEmployerId', label: 'MOL Employer ID', placeholder: '0000000000' },
    { key: 'paymentDate', label: 'Payment Date', placeholder: 'YYYY-MM-DD' },
  ],
  SEPA_XML: [
    { key: 'companyName', label: 'Company Name', placeholder: 'EMPLOYER LTD' },
    { key: 'creditorIban', label: 'Creditor IBAN', placeholder: 'GB00XXXX00000000000000' },
    { key: 'paymentDate', label: 'Execution Date', placeholder: 'YYYY-MM-DD' },
  ],
};

const fmt = (n: number) =>
  new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

export default function BankFilesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [files, setFiles] = useState<BankFileRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);

  const [format, setFormat] = useState<BankFileFormat>('NEFT_RTGS');
  const [options, setOptions] = useState<Record<string, string>>({});

  const refetch = useCallback(async () => {
    if (!id) return;
    const res = await payrollApi.listBankFileRuns(id);
    setFiles(res.data?.data ?? res.data ?? []);
  }, [id]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await refetch();
      } finally {
        setLoading(false);
      }
    };
    if (id) load();
  }, [id, refetch]);

  const handleGenerate = async () => {
    if (!id) return;
    setGenerating(true);
    try {
      await payrollApi.generateBankFile(id, { format, options });
      await refetch();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to generate bank file');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = (fileId: string, fileFormat: BankFileFormat) => {
    const url = payrollApi.downloadBankFileUrl(id!, fileId);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bank-file-${fileFormat}-${id!.slice(0, 8)}.${fileFormat === 'SEPA_XML' ? 'xml' : 'txt'}`;
    a.click();
  };

  const handleMarkPaid = async () => {
    if (!id) return;
    if (!confirm('Mark all payslips in this run as PAID?')) return;
    setMarkingPaid(true);
    try {
      const res = await payrollApi.markPayslipsPaid(id);
      const result = res.data?.data ?? res.data;
      alert(`Marked ${result?.updated ?? 0} payslip(s) as PAID.`);
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to mark payslips as paid');
    } finally {
      setMarkingPaid(false);
    }
  };

  const activeFiles = files.filter((f) => f.status === 'GENERATED');
  const supersededFiles = files.filter((f) => f.status === 'SUPERSEDED');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <button
        onClick={() => navigate(`/payroll/runs/${id}`)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Back to run
      </button>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Bank File Export</h1>
        <button
          onClick={handleMarkPaid}
          disabled={markingPaid}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          <CheckCircle className="w-4 h-4" />
          {markingPaid ? 'Marking...' : 'Mark Payslips Paid'}
        </button>
      </div>

      {/* Generate panel */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="text-base font-medium text-gray-800 mb-4">Generate New Bank File</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Format</label>
          <select
            value={format}
            onChange={(e) => { setFormat(e.target.value as BankFileFormat); setOptions({}); }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {(Object.keys(FORMAT_LABELS) as BankFileFormat[]).map((f) => (
              <option key={f} value={f}>{FORMAT_LABELS[f]}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {FORMAT_FIELDS[format].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type="text"
                value={options[key] ?? ''}
                placeholder={placeholder}
                onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ))}
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          <FileText className="w-4 h-4" />
          {generating ? 'Generating...' : 'Generate'}
        </button>
      </div>

      {/* Active files */}
      <h2 className="text-base font-semibold text-gray-800 mb-3">Generated Files</h2>
      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : activeFiles.length === 0 ? (
        <p className="text-sm text-gray-400 mb-6">No files generated yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 mb-6">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Format</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Employees</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Generated At</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {activeFiles.map((f) => (
                <tr key={f.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium text-indigo-700">{FORMAT_LABELS[f.format]}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-700">{f.employeeCount}</td>
                  <td className="px-4 py-3 text-sm text-right text-gray-900 font-mono">{fmt(f.totalAmount)}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {new Date(f.generatedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <button
                      onClick={() => handleDownload(f.id, f.format)}
                      className="flex items-center gap-1 text-indigo-600 hover:text-indigo-800"
                    >
                      <Download className="w-4 h-4" /> Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Superseded files (collapsed) */}
      {supersededFiles.length > 0 && (
        <details className="text-sm text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700 mb-2">
            {supersededFiles.length} superseded file(s)
          </summary>
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Format</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Employees</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Generated At</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {supersededFiles.map((f) => (
                  <tr key={f.id} className="opacity-60">
                    <td className="px-4 py-3 text-sm">{FORMAT_LABELS[f.format]}</td>
                    <td className="px-4 py-3 text-sm text-right">{f.employeeCount}</td>
                    <td className="px-4 py-3 text-sm text-right font-mono">{fmt(f.totalAmount)}</td>
                    <td className="px-4 py-3 text-sm">{new Date(f.generatedAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => handleDownload(f.id, f.format)}
                        className="flex items-center gap-1 text-gray-400 hover:text-gray-600"
                      >
                        <Download className="w-4 h-4" /> Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
