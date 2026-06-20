import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { hrApi } from '../../api/hr';

const STATUS_COLORS: Record<string, string> = {
  PRESENT: 'bg-green-100 text-green-700',
  ABSENT: 'bg-red-100 text-red-700',
  HALF_DAY: 'bg-yellow-100 text-yellow-700',
  HOLIDAY: 'bg-blue-100 text-blue-700',
  WEEKEND: 'bg-gray-100 text-gray-500',
  LEAVE: 'bg-purple-100 text-purple-700',
};

const STATUS_SHORT: Record<string, string> = {
  PRESENT: 'P',
  ABSENT: 'A',
  HALF_DAY: 'H',
  HOLIDAY: 'Ho',
  WEEKEND: 'W',
  LEAVE: 'L',
};

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function formatDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export default function AttendancePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [attendanceMap, setAttendanceMap] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [showMarkModal, setShowMarkModal] = useState(false);
  const [markForm, setMarkForm] = useState({ date: formatDate(now.getFullYear(), now.getMonth() + 1, now.getDate()), status: 'PRESENT', checkIn: '', checkOut: '', remarks: '' });

  useEffect(() => {
    hrApi.getEmployees({ limit: 100 }).then(res => {
      const data = res.data?.data ?? res.data ?? {};
      const emps = data.items ?? data ?? [];
      setEmployees(emps);
      if (emps.length > 0 && !selectedEmployee) setSelectedEmployee(emps[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedEmployee) return;
    setLoading(true);
    hrApi.getMonthlyAttendance({ employeeId: selectedEmployee, month, year }).then(res => {
      const records: any[] = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      const map: Record<string, any> = {};
      records.forEach((r: any) => { map[r.date?.substring(0, 10)] = r; });
      setAttendanceMap(map);
    }).catch(() => setAttendanceMap({})).finally(() => setLoading(false));
  }, [selectedEmployee, month, year]);

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1); } else setMonth(m => m + 1); };

  const daysInMonth = getDaysInMonth(year, month);
  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

  const handleMark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    try {
      await hrApi.markAttendance({
        employeeId: selectedEmployee,
        date: markForm.date,
        status: markForm.status,
        checkIn: markForm.checkIn || undefined,
        checkOut: markForm.checkOut || undefined,
        remarks: markForm.remarks || undefined,
        source: 'MANUAL',
      });
      setShowMarkModal(false);
      // Refresh
      const res = await hrApi.getMonthlyAttendance({ employeeId: selectedEmployee, month, year });
      const records: any[] = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      const map: Record<string, any> = {};
      records.forEach((r: any) => { map[r.date?.substring(0, 10)] = r; });
      setAttendanceMap(map);
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to mark attendance');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-500 mt-1">Monthly attendance overview</p>
        </div>
        <button
          onClick={() => setShowMarkModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus className="h-4 w-4" />
          Mark Attendance
        </button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 mb-6">
        <select
          value={selectedEmployee}
          onChange={e => setSelectedEmployee(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select Employee</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} ({emp.employeeCode})</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-medium w-32 text-center">{monthName} {year}</span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
              <div key={d} className="text-center text-xs font-medium text-gray-500 py-2 bg-gray-50">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {/* Leading empty cells */}
            {Array.from({ length: new Date(year, month - 1, 1).getDay() }, (_, i) => (
              <div key={`empty-${i}`} className="border-r border-b border-gray-100 h-20" />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dateStr = formatDate(year, month, day);
              const record = attendanceMap[dateStr];
              const dow = new Date(year, month - 1, day).getDay();
              const isWeekend = dow === 0 || dow === 6;
              const status = record?.status ?? (isWeekend ? 'WEEKEND' : null);
              return (
                <div key={day} className={`border-r border-b border-gray-100 h-20 p-2 ${isWeekend ? 'bg-gray-50' : ''}`}>
                  <div className="text-xs text-gray-500 font-medium mb-1">{day}</div>
                  {status && (
                    <div className={`text-xs rounded px-1.5 py-0.5 font-medium inline-block ${STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-600'}`}>
                      {STATUS_SHORT[status] ?? status}
                    </div>
                  )}
                  {record?.checkIn && (
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(record.checkIn).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 mt-4 flex-wrap">
        {Object.entries(STATUS_COLORS).map(([status, cls]) => (
          <div key={status} className="flex items-center gap-1.5">
            <span className={`text-xs rounded px-1.5 py-0.5 font-medium ${cls}`}>{STATUS_SHORT[status]}</span>
            <span className="text-xs text-gray-500">{status.replace('_', ' ')}</span>
          </div>
        ))}
      </div>

      {showMarkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">Mark Attendance</h2>
              <button onClick={() => setShowMarkModal(false)} className="text-gray-400 hover:text-gray-600">X</button>
            </div>
            <form onSubmit={handleMark} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <input required type="date" value={markForm.date} onChange={e => setMarkForm(f => ({ ...f, date: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                <select value={markForm.status} onChange={e => setMarkForm(f => ({ ...f, status: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="PRESENT">Present</option>
                  <option value="ABSENT">Absent</option>
                  <option value="HALF_DAY">Half Day</option>
                  <option value="LEAVE">Leave</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check In</label>
                  <input type="datetime-local" value={markForm.checkIn} onChange={e => setMarkForm(f => ({ ...f, checkIn: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check Out</label>
                  <input type="datetime-local" value={markForm.checkOut} onChange={e => setMarkForm(f => ({ ...f, checkOut: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                <input value={markForm.remarks} onChange={e => setMarkForm(f => ({ ...f, remarks: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowMarkModal(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">Mark</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
