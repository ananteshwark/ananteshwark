import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { payrollApi } from '../../api/payroll';

interface LineItem {
  code: string;
  name: string;
  amount: number;
}

interface Payslip {
  id: string;
  employeeCode: string;
  employeeName: string;
  payPeriodMonth: number;
  payPeriodYear: number;
  daysWorked: number;
  lopDays: number;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  employerContributions: number;
  status: string;
  earnings: LineItem[];
  deductions: LineItem[];
  employerContribs: LineItem[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n ?? 0);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function PayslipPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ps, setPs] = useState<Payslip | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPs = async () => {
      setLoading(true);
      try {
        const res = await payrollApi.getPayslip(id!);
        setPs(res.data?.data ?? res.data);
      } catch (err: any) {
        setError(err?.response?.data?.message ?? 'Failed to load payslip');
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchPs();
  }, [id]);

  if (loading) return <div className="p-6 text-gray-500">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!ps) return <div className="p-6 text-gray-500">Payslip not found</div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 print:hidden">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-2 text-sm text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
          <Printer className="w-4 h-4" /> Print
        </button>
      </div>

      <div className="max-w-3xl mx-auto bg-white border border-gray-200 rounded-lg p-8">
        <div className="flex items-center justify-between border-b border-gray-200 pb-4 mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Payslip</h1>
            <p className="text-sm text-gray-500">{MONTHS[ps.payPeriodMonth - 1]} {ps.payPeriodYear}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-gray-900">{ps.employeeName}</p>
            <p className="text-xs font-mono text-gray-500">{ps.employeeCode}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6 text-sm">
          <div><span className="text-gray-500">Days Worked: </span><span className="font-medium">{ps.daysWorked}</span></div>
          <div><span className="text-gray-500">LOP Days: </span><span className="font-medium">{ps.lopDays}</span></div>
          <div><span className="text-gray-500">Status: </span><span className="font-medium">{ps.status}</span></div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Earnings</h3>
            <table className="w-full text-sm">
              <tbody>
                {ps.earnings.map((e) => (
                  <tr key={e.code} className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-600">{e.name}</td>
                    <td className="py-1.5 text-right font-medium text-gray-900">{fmt(e.amount)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 text-gray-900">Gross Earnings</td>
                  <td className="py-2 text-right text-gray-900">{fmt(ps.grossEarnings)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Deductions</h3>
            <table className="w-full text-sm">
              <tbody>
                {ps.deductions.length === 0 && (
                  <tr><td className="py-1.5 text-gray-400" colSpan={2}>None</td></tr>
                )}
                {ps.deductions.map((d) => (
                  <tr key={d.code} className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-600">{d.name}</td>
                    <td className="py-1.5 text-right font-medium text-gray-900">{fmt(d.amount)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 text-gray-900">Total Deductions</td>
                  <td className="py-2 text-right text-gray-900">{fmt(ps.totalDeductions)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-indigo-50 rounded-lg px-4 py-3 flex items-center justify-between mb-6">
          <span className="text-sm font-semibold text-indigo-900">Net Pay</span>
          <span className="text-lg font-bold text-indigo-900">{fmt(ps.netPay)}</span>
        </div>

        {ps.employerContribs.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Employer Contributions</h3>
            <table className="w-full text-sm">
              <tbody>
                {ps.employerContribs.map((e) => (
                  <tr key={e.code} className="border-b border-gray-100">
                    <td className="py-1.5 text-gray-600">{e.name}</td>
                    <td className="py-1.5 text-right font-medium text-gray-900">{fmt(e.amount)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 text-gray-900">Total Employer Cost</td>
                  <td className="py-2 text-right text-gray-900">{fmt(ps.employerContributions)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
