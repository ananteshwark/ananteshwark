import { useState, useEffect } from 'react';
import { Users, Calendar, Clock, CheckCircle, XCircle } from 'lucide-react';
import { hrApi } from '../../api/hr';

type Tab = 'team' | 'leave-approvals' | 'timesheets';

const LEAVE_STATUS_COLORS: Record<string, string> = {
  PENDING:  'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

export default function MSSPage() {
  const [tab, setTab] = useState<Tab>('team');
  const [employees, setEmployees] = useState<any[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [timesheets, setTimesheets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      hrApi.getEmployees({ limit: 50, status: 'ACTIVE' }),
      hrApi.getLeaveApplications({ limit: 50, status: 'PENDING' }),
    ]).then(([emp, leaves]) => {
      setEmployees(emp.data?.items || []);
      setPendingLeaves(leaves.data?.items || leaves.data || []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab === 'timesheets' && timesheets.length === 0) {
      hrApi.getTimesheets?.({ limit: 30, status: 'SUBMITTED' })
        ?.then((r: any) => setTimesheets(r.data?.items || []))
        ?.catch(() => {});
    }
  }, [tab]);

  const approveLeave = async (id: string) => {
    setActing(id);
    try {
      await hrApi.approveLeave(id, { remarks: 'Approved by manager' });
      setPendingLeaves(l => l.filter(x => x.id !== id));
    } finally {
      setActing(null);
    }
  };

  const rejectLeave = async (id: string) => {
    setActing(id);
    try {
      await hrApi.rejectLeave(id, { remarks: 'Rejected by manager' });
      setPendingLeaves(l => l.filter(x => x.id !== id));
    } finally {
      setActing(null);
    }
  };

  const tabs = [
    { id: 'team' as Tab, label: 'My Team', icon: Users },
    { id: 'leave-approvals' as Tab, label: 'Leave Approvals', icon: Calendar },
    { id: 'timesheets' as Tab, label: 'Team Timesheets', icon: Clock },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Manager Self-Service</h1>
        <p className="text-sm text-gray-500 mt-0.5">Team management and approvals</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Active Employees</p>
          <p className="text-2xl font-bold mt-1">{employees.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Pending Leave Requests</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{pendingLeaves.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Pending Timesheets</p>
          <p className="text-2xl font-bold mt-1">{timesheets.filter((t: any) => t.status === 'SUBMITTED').length}</p>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t.id ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'team' && (
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b">
            <h2 className="font-medium">Team Members</h2>
          </div>
          {loading ? (
            <div className="p-6 text-center text-gray-400">Loading...</div>
          ) : employees.length === 0 ? (
            <div className="p-6 text-center text-gray-400">No active employees found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Code', 'Name', 'Email', 'Department', 'Designation', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {employees.map((e: any) => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{e.employeeCode}</td>
                    <td className="px-4 py-2 font-medium">{e.firstName} {e.lastName}</td>
                    <td className="px-4 py-2 text-gray-500">{e.email}</td>
                    <td className="px-4 py-2 text-gray-500">{e.departmentId || '—'}</td>
                    <td className="px-4 py-2 text-gray-500">{e.designationId || '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        e.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>{e.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'leave-approvals' && (
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b">
            <h2 className="font-medium">Pending Leave Requests</h2>
            <p className="text-xs text-gray-400 mt-0.5">{pendingLeaves.length} pending approval</p>
          </div>
          {pendingLeaves.length === 0 ? (
            <div className="p-6 text-center text-gray-400">No pending leave requests.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Employee', 'Type', 'From', 'To', 'Days', 'Reason', 'Actions'].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {pendingLeaves.map((a: any) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 font-medium">{a.employeeId || a.employeeName || '—'}</td>
                    <td className="px-4 py-2">{a.leaveTypeName || a.leaveTypeId}</td>
                    <td className="px-4 py-2 text-gray-500">{a.startDate}</td>
                    <td className="px-4 py-2 text-gray-500">{a.endDate}</td>
                    <td className="px-4 py-2">{a.numberOfDays ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-500 truncate max-w-[120px]">{a.reason || '—'}</td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => approveLeave(a.id)}
                          disabled={acting === a.id}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded disabled:opacity-50"
                        >
                          <CheckCircle className="h-3 w-3" /> Approve
                        </button>
                        <button
                          onClick={() => rejectLeave(a.id)}
                          disabled={acting === a.id}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-red-600 text-white rounded disabled:opacity-50"
                        >
                          <XCircle className="h-3 w-3" /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'timesheets' && (
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b">
            <h2 className="font-medium">Submitted Timesheets</h2>
          </div>
          {timesheets.length === 0 ? (
            <div className="p-6 text-center text-gray-400">No submitted timesheets.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Employee', 'Period', 'Hours', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {timesheets.map((t: any) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2">{t.employeeId}</td>
                    <td className="px-4 py-2 text-gray-500">{t.weekStartDate} – {t.weekEndDate}</td>
                    <td className="px-4 py-2">{t.totalHours || t.totalRegularHours || '—'}</td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                        {t.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
