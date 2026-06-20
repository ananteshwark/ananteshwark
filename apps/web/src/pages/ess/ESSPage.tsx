import { useState, useEffect } from 'react';
import { User, Calendar, FileText, Clock, Plus, X } from 'lucide-react';
import { hrApi } from '../../api/hr';
import { payrollApi } from '../../api/payroll';
import { useAuthStore } from '../../store/authStore';

type Tab = 'profile' | 'leave' | 'payslips' | 'attendance';

const LEAVE_STATUS_COLORS: Record<string, string> = {
  PENDING:  'bg-yellow-100 text-yellow-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

function ApplyLeaveModal({ leaveTypes, onClose, onApplied }: {
  leaveTypes: any[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const [form, setForm] = useState({
    leaveTypeId: leaveTypes[0]?.id || '', startDate: '', endDate: '', reason: '',
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await hrApi.applyLeave(form);
      onApplied();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-4">Apply for Leave</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Leave Type</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.leaveTypeId} onChange={e => setForm(p => ({ ...p, leaveTypeId: e.target.value }))}>
              {leaveTypes.map((lt: any) => <option key={lt.id} value={lt.id}>{lt.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start Date</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.startDate} onChange={e => setForm(p => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Date</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Reason</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3}
              value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancel</button>
          <button onClick={save} disabled={saving || !form.startDate || !form.endDate || !form.leaveTypeId}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">
            {saving ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ESSPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>('profile');
  const [employee, setEmployee] = useState<any>(null);
  const [leaveBalance, setLeaveBalance] = useState<any[]>([]);
  const [leaveApplications, setLeaveApplications] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [showApply, setShowApply] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      hrApi.getLeaveTypes(),
      hrApi.getLeaveBalance(),
      hrApi.getLeaveApplications({ limit: 20 }),
    ]).then(([lt, lb, la]) => {
      setLeaveTypes(lt.data || []);
      setLeaveBalance(lb.data || []);
      setLeaveApplications(la.data?.items || la.data || []);
    }).finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    if (tab === 'payslips' && payslips.length === 0 && user) {
      // Load payslips for current user's employee
      payrollApi.getPayslips({ limit: 24 }).then(r => setPayslips(r.data?.items || []));
    }
    if (tab === 'attendance' && attendance.length === 0) {
      const now = new Date();
      hrApi.getMonthlyAttendance({ year: now.getFullYear(), month: now.getMonth() + 1 })
        .then(r => setAttendance(r.data || []));
    }
  }, [tab]);

  const tabs = [
    { id: 'profile' as Tab, label: 'My Profile', icon: User },
    { id: 'leave' as Tab, label: 'Leave', icon: Calendar },
    { id: 'payslips' as Tab, label: 'Payslips', icon: FileText },
    { id: 'attendance' as Tab, label: 'Attendance', icon: Clock },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Employee Self-Service</h1>
        <p className="text-sm text-gray-500 mt-0.5">View and manage your personal information</p>
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

      {tab === 'profile' && (
        <div className="bg-white rounded-xl border p-6 max-w-lg">
          <div className="flex items-center gap-4 mb-6">
            <div className="h-14 w-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-xl">
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <div>
              <h2 className="font-semibold text-lg">{user?.firstName} {user?.lastName}</h2>
              <p className="text-sm text-gray-500">{user?.email}</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Email</span>
              <span>{user?.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tenant ID</span>
              <span className="font-mono text-xs">{user?.tenantId}</span>
            </div>
          </div>
        </div>
      )}

      {tab === 'leave' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {leaveBalance.map((b: any) => (
              <div key={b.leaveTypeId || b.id} className="bg-white rounded-xl border p-4">
                <p className="text-xs text-gray-500">{b.leaveTypeName || b.name}</p>
                <p className="text-2xl font-bold mt-1">{b.balance ?? b.remaining ?? '—'}</p>
                <p className="text-xs text-gray-400">days remaining</p>
              </div>
            ))}
            {leaveBalance.length === 0 && (
              <div className="col-span-4 bg-white rounded-xl border p-6 text-center text-gray-400 text-sm">
                No leave balance data available.
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-medium">My Leave Applications</h2>
              <button onClick={() => setShowApply(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg">
                <Plus className="h-4 w-4" /> Apply
              </button>
            </div>
            {loading ? (
              <div className="p-6 text-center text-gray-400">Loading...</div>
            ) : leaveApplications.length === 0 ? (
              <div className="p-6 text-center text-gray-400">No leave applications.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Type', 'From', 'To', 'Days', 'Reason', 'Status'].map(h => (
                      <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {leaveApplications.map((a: any) => (
                    <tr key={a.id}>
                      <td className="px-4 py-2">{a.leaveTypeName || a.leaveTypeId}</td>
                      <td className="px-4 py-2 text-gray-500">{a.startDate}</td>
                      <td className="px-4 py-2 text-gray-500">{a.endDate}</td>
                      <td className="px-4 py-2">{a.numberOfDays ?? '—'}</td>
                      <td className="px-4 py-2 text-gray-500 truncate max-w-[150px]">{a.reason || '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${LEAVE_STATUS_COLORS[a.status] || ''}`}>
                          {a.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'payslips' && (
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b">
            <h2 className="font-medium">My Payslips</h2>
          </div>
          {payslips.length === 0 ? (
            <div className="p-6 text-center text-gray-400">No payslips available.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Period', 'Gross Pay', 'Deductions', 'Net Pay', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {payslips.map((p: any) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{p.payPeriodStart} – {p.payPeriodEnd}</td>
                    <td className="px-4 py-2 text-right">{(p.grossPay ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-right text-red-600">{(p.totalDeductions ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2 text-right font-semibold text-green-700">{(p.netPay ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">{p.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'attendance' && (
        <div className="bg-white rounded-xl border">
          <div className="p-4 border-b">
            <h2 className="font-medium">My Attendance (Current Month)</h2>
          </div>
          {attendance.length === 0 ? (
            <div className="p-6 text-center text-gray-400">No attendance data for this month.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Date', 'Check In', 'Check Out', 'Hours', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {attendance.map((a: any) => (
                  <tr key={a.id || a.date}>
                    <td className="px-4 py-2">{a.date || a.attendanceDate}</td>
                    <td className="px-4 py-2 text-gray-500">{a.checkIn || a.timeIn || '—'}</td>
                    <td className="px-4 py-2 text-gray-500">{a.checkOut || a.timeOut || '—'}</td>
                    <td className="px-4 py-2">{a.hoursWorked || a.totalHours || '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.status === 'PRESENT' ? 'bg-green-100 text-green-700' :
                        a.status === 'ABSENT' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>{a.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showApply && (
        <ApplyLeaveModal
          leaveTypes={leaveTypes}
          onClose={() => setShowApply(false)}
          onApplied={() => {
            setShowApply(false);
            hrApi.getLeaveApplications({ limit: 20 }).then(r =>
              setLeaveApplications(r.data?.items || r.data || []));
          }}
        />
      )}
    </div>
  );
}
