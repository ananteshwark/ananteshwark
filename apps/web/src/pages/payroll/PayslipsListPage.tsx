import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { payrollApi } from '../../api/payroll';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  GENERATED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  PAID: 'bg-purple-100 text-purple-700',
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function PayslipsListPage() {
  const [payslips, setPayslips] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const limit = 20;

  useEffect(() => {
    setLoading(true);
    payrollApi.getPayslips({ page, limit, search: search || undefined })
      .then(r => {
        setPayslips(r.data?.items ?? r.data?.data?.items ?? []);
        setTotal(r.data?.total ?? r.data?.data?.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [page, search]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payslips</h1>
          <p className="text-sm text-gray-500 mt-1">{total} payslips total</p>
        </div>
        <input
          type="text"
          placeholder="Search employee..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="border rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : payslips.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No payslips found</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Employee</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Period</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Gross</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Deductions</th>
                <th className="px-4 py-3 text-right font-medium text-gray-600">Net Pay</th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payslips.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{p.employeeName}</div>
                    <div className="text-xs text-gray-400">{p.employeeCode}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {MONTHS[(p.payPeriodMonth ?? 1) - 1]} {p.payPeriodYear}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">{Number(p.grossEarnings ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right text-red-600">{Number(p.totalDeductions ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{Number(p.netPay ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[p.status] || 'bg-gray-100 text-gray-700'}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/payroll/payslips/${p.id}`)}
                      className="text-blue-600 hover:text-blue-800 p-1"
                      title="View"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {total > limit && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
          <span>Page {page} of {Math.ceil(total / limit)}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Previous</button>
            <button disabled={page * limit >= total} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
