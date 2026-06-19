import { useState, useEffect } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import { hrApi } from '../../api/hr';

export default function LeaveApprovalsPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [remarksMap, setRemarksMap] = useState<Record<string, string>>({});

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [appRes, empRes, ltRes] = await Promise.all([
        hrApi.getLeaveApplications({ status: 'SUBMITTED' }),
        hrApi.getEmployees({ limit: 100 }),
        hrApi.getLeaveTypes(),
      ]);
      const appData = appRes.data?.data ?? appRes.data ?? {};
      setApplications(appData.items ?? appData ?? []);
      const empData = empRes.data?.data ?? empRes.data ?? {};
      setEmployees(empData.items ?? empData ?? []);
      const ltData = ltRes.data?.data ?? ltRes.data ?? [];
      setLeaveTypes(Array.isArray(ltData) ? ltData : []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await hrApi.approveLeave(id, { remarks: remarksMap[id] ?? '' });
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to approve');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    if (!remarksMap[id]) {
      alert('Please enter rejection remarks');
      return;
    }
    setProcessingId(id);
    try {
      await hrApi.rejectLeave(id, { remarks: remarksMap[id] });
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to reject');
    } finally {
      setProcessingId(null);
    }
  };

  const getEmployeeName = (id: string) => {
    const emp = employees.find(e => e.id === id);
    return emp ? `${emp.firstName} ${emp.lastName}` : id;
  };

  const getLeaveTypeName = (id: string) => {
    return leaveTypes.find(l => l.id === id)?.name ?? id;
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Leave Approvals</h1>
        <p className="text-sm text-gray-500 mt-1">Review pending leave applications from your team</p>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : applications.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No pending approvals</p>
          <p className="text-sm text-gray-400 mt-1">All leave applications have been reviewed</p>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app: any) => (
            <div key={app.id} className="bg-white rounded-lg border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-semibold text-gray-900">{getEmployeeName(app.employeeId)}</h3>
                    <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full font-medium">PENDING</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
                    <div>
                      <div className="text-gray-500 text-xs">Leave Type</div>
                      <div className="font-medium text-gray-900">{getLeaveTypeName(app.leaveTypeId)}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">Duration</div>
                      <div className="font-medium text-gray-900">{app.days} day{app.days !== 1 ? 's' : ''}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">From</div>
                      <div className="font-medium text-gray-900">{app.fromDate}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 text-xs">To</div>
                      <div className="font-medium text-gray-900">{app.toDate}</div>
                    </div>
                  </div>
                  <div className="text-sm">
                    <span className="text-gray-500">Reason: </span>
                    <span className="text-gray-900">{app.reason}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-1">Applied: {new Date(app.appliedAt).toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
                <input
                  type="text"
                  placeholder="Remarks (required for rejection)..."
                  value={remarksMap[app.id] ?? ''}
                  onChange={e => setRemarksMap(m => ({ ...m, [app.id]: e.target.value }))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={() => handleApprove(app.id)}
                  disabled={processingId === app.id}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-50"
                >
                  <CheckCircle className="h-4 w-4" />
                  Approve
                </button>
                <button
                  onClick={() => handleReject(app.id)}
                  disabled={processingId === app.id}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
