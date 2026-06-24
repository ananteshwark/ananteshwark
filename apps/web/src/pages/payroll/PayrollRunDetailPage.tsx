import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, BookOpen, FileText } from 'lucide-react';
import { payrollApi } from '../../api/payroll';
import { payrollGlApi } from '../../api/payrollGl';

interface Payslip {
  id: string;
  employeeCode: string;
  employeeName: string;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  employerContributions: number;
  status: string;
}

interface RunDetail {
  id: string;
  name: string;
  status: string;
  payPeriodMonth: number;
  payPeriodYear: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  totalEmployerCost: number;
  employeeCount: number;
  glJournalEntryId: string | null;
  payslips: Payslip[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n ?? 0);

export default function PayrollRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [postingGl, setPostingGl] = useState(false);

  const refetch = async () => {
    if (!id) return;
    const res = await payrollApi.getRun(id);
    setRun(res.data?.data ?? res.data);
  };

  const postToGl = async () => {
    if (!id) return;
    setPostingGl(true);
    try {
      const res = await payrollGlApi.postToGl(id);
      const je = res.data?.data ?? res.data;
      if (je?.id) {
        alert(`Posted to GL. Journal entry: ${je.entryNumber ?? je.id}`);
      } else {
        alert('No GL mappings configured. Set up GL Mappings first.');
      }
      await refetch();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to post to GL');
    } finally {
      setPostingGl(false);
    }
  };

  const downloadBankFile = async () => {
    if (!id) return;
    setDownloading(true);
    try {
      const res = await payrollApi.getBankFile(id);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `bank-file-${id}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download bank file');
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    const fetchRun = async () => {
      setLoading(true);
      try {
        const res = await payrollApi.getRun(id!);
        setRun(res.data?.data ?? res.data);
      } catch (err: any) {
        setError(err?.response?.data?.message ?? 'Failed to load run');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchRun();
  }, [id]);

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!run) return <div className="p-6 text-gray-500">Run not found</div>;

  return (
    <div className="p-6">
      <button onClick={() => navigate('/payroll/runs')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to runs
      </button>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">{run.name}</h1>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800">{run.status}</span>
          {run.glJournalEntryId && (
            <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">GL Posted</span>
          )}
          {run.status === 'APPROVED' && !run.glJournalEntryId && (
            <button
              onClick={postToGl}
              disabled={postingGl}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              <BookOpen className="w-4 h-4" /> {postingGl ? 'Posting...' : 'Post to GL'}
            </button>
          )}
          {run.status === 'PAID' && (
            <button
              onClick={downloadBankFile}
              disabled={downloading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> {downloading ? 'Downloading...' : 'Bank File (CSV)'}
            </button>
          )}
          {(run.status === 'APPROVED' || run.status === 'PAID') && (
            <button
              onClick={() => navigate(`/payroll/runs/${id}/bank-files`)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100"
            >
              <FileText className="w-4 h-4" /> Bank Files
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Employees', value: run.employeeCount },
          { label: 'Total Gross', value: fmt(run.totalGross) },
          { label: 'Total Deductions', value: fmt(run.totalDeductions) },
          { label: 'Total Net', value: fmt(run.totalNet) },
          { label: 'Employer Cost', value: fmt(run.totalEmployerCost) },
        ].map((card) => (
          <div key={card.label} className="bg-white border border-gray-200 rounded-lg p-4">
            <p className="text-xs text-gray-500 uppercase">{card.label}</p>
            <p className="text-lg font-semibold text-gray-900 mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold text-gray-900 mb-3">Payslips</h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gross</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Deductions</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {(run.payslips ?? []).length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No payslips. Process the run to generate them.</td></tr>
            )}
            {(run.payslips ?? []).map((p) => (
              <tr key={p.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/payroll/payslips/${p.id}`)}>
                <td className="px-4 py-3 text-sm font-mono text-gray-500">{p.employeeCode}</td>
                <td className="px-4 py-3 text-sm text-indigo-600">{p.employeeName}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-900">{fmt(p.grossEarnings)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(p.totalDeductions)}</td>
                <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{fmt(p.netPay)}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
