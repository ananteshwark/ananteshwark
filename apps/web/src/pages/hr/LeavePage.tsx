import { useState, useEffect } from 'react';
import { Plus, X, Calendar, CheckCircle, XCircle } from 'lucide-react';
import { hrApi } from '../../api/hr';

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  CANCELLED: 'bg-gray-100 text-gray-600',
  WITHDRAWN: 'bg-gray-100 text-gray-600',
  DRAFT: 'bg-blue-100 text-blue-800',
};

const BALANCE_COLORS = ['bg-blue-50 border-blue-200', 'bg-green-50 border-green-200', 'bg-purple-50 border-purple-200', 'bg-orange-50 border-orange-200'];

const defaultApplyForm = {
  leaveTypeId: '',
  fromDate: '',
  toDate: '',
  days: '1',
  reason: '',
  halfDay: false,
};

export default function LeavePage() {
  const [tab, setTab] = useState<'my' | 'balance' | 'team'>('my');
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [teamLeaves, setTeamLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyForm, setApplyForm] = useState(defaultApplyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = new Date();
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [calYear, setCalYear] = useState(now.getFullYear());

  useEffect(() => {
    Promise.all([
      hrApi.getEmployees({ limit: 100 }),
      hrApi.getLeaveTypes(),
    ]).then(([empRes, ltRes]) => {
      const empData = empRes.data?.data ?? empRes.data ?? {};
      const emps = empData.items ?? empData ?? [];
      setEmployees(emps);
      if (emps.length > 0 && !selectedEmployee) setSelectedEmployee(emps[0].id);
      const ltData = ltRes.data?.data ?? ltRes.data ?? [];
      setLeaveTypes(Array.isArray(ltData) ? ltData : []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedEmployee) return;
    setLoading(true);
    Promise.all([
      hrApi.getLeaveApplications({ employeeId: selectedEmployee }),
      hrApi.getLeaveBalance({ employeeId: selectedEmployee }),
    ]).then(([appRes, balRes]) => {
      const appData = appRes.data?.data ?? appRes.data ?? {};
      setApplications(appData.items ?? appData ?? []);
      const balData = balRes.data?.data ?? balRes.data ?? [];
      setBalances(Array.isArray(balData) ? balData : []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [selectedEmployee]);

  useEffect(() => {
    if (tab !== 'team') return;
    hrApi.getLeaveCalendar({ month: calMonth, year: calYear }).then(res => {
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setTeamLeaves(Array.isArray(data) ? data : []);
    }).catch(() => setTeamLeaves([]));
  }, [tab, calMonth, calYear]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    setSubmitting(true);
    setError(null);
    try {
      await hrApi.applyLeave({
        ...applyForm,
        employeeId: selectedEmployee,
        days: parseFloat(applyForm.days),
        halfDay: applyForm.halfDay,
      });
      setShowApplyModal(false);
      setApplyForm(defaultApplyForm);
      const res = await hrApi.getLeaveApplications({ employeeId: selectedEmployee });
      const data = res.data?.data ?? res.data ?? {};
      setApplications(data.items ?? data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to apply leave');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this leave application?')) return;
    try {
      await hrApi.cancelLeave(id);
      const res = await hrApi.getLeaveApplications({ employeeId: selectedEmployee });
      const data = res.data?.data ?? res.data ?? {};
      setApplications(data.items ?? data ?? []);
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to cancel');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
          <p className="text-sm text-gray-500 mt-1">Apply and track leave requests</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedEmployee}
            onChange={e => setSelectedEmployee(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
            ))}
          </select>
          <button
            onClick={() => setShowApplyModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus className="h-4 w-4" />
            Apply Leave
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {(['my', 'balance', 'team'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t === 'my' ? 'My Leaves' : t === 'balance' ? 'Leave Balance' : 'Team Leaves'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <>
          {/* My Leaves Tab */}
          {tab === 'my' && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Leave Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">From</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">To</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Days</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Reason</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {applications.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-8 text-gray-400">No leave applications</td></tr>
                  ) : (
                    applications.map((app: any) => {
                      const lt = leaveTypes.find(l => l.id === app.leaveTypeId);
                      return (
                        <tr key={app.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">{lt?.name ?? app.leaveTypeId}</td>
                          <td className="px-4 py-3 text-gray-600">{app.fromDate}</td>
                          <td className="px-4 py-3 text-gray-600">{app.toDate}</td>
                          <td className="px-4 py-3 text-gray-600">{app.days}</td>
                          <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{app.reason}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[app.status] ?? 'bg-gray-100 text-gray-700'}`}>{app.status}</span>
                          </td>
                          <td className="px-4 py-3">
                            {(app.status === 'SUBMITTED' || app.status === 'APPROVED') && (
                              <button onClick={() => handleCancel(app.id)} className="text-xs text-red-600 hover:text-red-800">Cancel</button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Balance Tab */}
          {tab === 'balance' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {balances.length === 0 ? (
                <div className="col-span-3 text-center py-8 text-gray-400">No leave balances found</div>
              ) : (
                balances.map((bal: any, i: number) => (
                  <div key={bal.leaveType?.id ?? i} className={`rounded-lg border p-5 ${BALANCE_COLORS[i % BALANCE_COLORS.length]}`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-gray-900">{bal.leaveType?.name ?? 'Unknown'}</h3>
                      <span className="text-xs text-gray-500">{bal.leaveType?.code}</span>
                    </div>
                    <div className="text-3xl font-bold text-gray-900 mb-1">{bal.closingBalance}</div>
                    <div className="text-sm text-gray-500 mb-3">days available</div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div><div className="text-gray-500">Accrued</div><div className="font-medium">{bal.accrued}</div></div>
                      <div><div className="text-gray-500">Taken</div><div className="font-medium">{bal.taken}</div></div>
                      <div><div className="text-gray-500">Adjusted</div><div className="font-medium">{bal.adjusted}</div></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Team Leaves Tab */}
          {tab === 'team' && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <select value={calMonth} onChange={e => setCalMonth(parseInt(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString('default', { month: 'long' })}</option>
                  ))}
                </select>
                <input type="number" value={calYear} onChange={e => setCalYear(parseInt(e.target.value))} className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-24" />
              </div>
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Leave Type</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">From</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">To</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-600">Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {teamLeaves.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-gray-400">No approved leaves for this month</td></tr>
                    ) : (
                      teamLeaves.map((leave: any) => {
                        const emp = employees.find(e => e.id === leave.employeeId);
                        const lt = leaveTypes.find(l => l.id === leave.leaveTypeId);
                        return (
                          <tr key={leave.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 font-medium text-gray-900">{emp ? `${emp.firstName} ${emp.lastName}` : leave.employeeId}</td>
                            <td className="px-4 py-3 text-gray-600">{lt?.name ?? leave.leaveTypeId}</td>
                            <td className="px-4 py-3 text-gray-600">{leave.fromDate}</td>
                            <td className="px-4 py-3 text-gray-600">{leave.toDate}</td>
                            <td className="px-4 py-3 text-gray-600">{leave.days}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Apply Leave Modal */}
      {showApplyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">Apply Leave</h2>
              <button onClick={() => setShowApplyModal(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleApply} className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type *</label>
                <select required value={applyForm.leaveTypeId} onChange={e => setApplyForm(f => ({ ...f, leaveTypeId: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Select Leave Type</option>
                  {leaveTypes.map(lt => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">From Date *</label>
                  <input required type="date" value={applyForm.fromDate} onChange={e => setApplyForm(f => ({ ...f, fromDate: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">To Date *</label>
                  <input required type="date" value={applyForm.toDate} onChange={e => setApplyForm(f => ({ ...f, toDate: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of Days *</label>
                <input required type="number" step="0.5" min="0.5" value={applyForm.days} onChange={e => setApplyForm(f => ({ ...f, days: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason *</label>
                <textarea required value={applyForm.reason} onChange={e => setApplyForm(f => ({ ...f, reason: e.target.value }))} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" placeholder="Reason for leave..." />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowApplyModal(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">{submitting ? 'Submitting...' : 'Apply Leave'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
