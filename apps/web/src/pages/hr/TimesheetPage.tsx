import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { hrApi } from '../../api/hr';

function getWeekStart(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

function formatDate(d: Date) {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number) {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function TimesheetPage() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart(new Date()));
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [entryForm, setEntryForm] = useState({ date: '', startTime: '', endTime: '', taskDescription: '', projectCode: '' });

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
    hrApi.getTimeEntries({ employeeId: selectedEmployee }).then(res => {
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setEntries(Array.isArray(data) ? data : []);
    }).catch(() => setEntries([])).finally(() => setLoading(false));
  }, [selectedEmployee, weekStart]);

  const prevWeek = () => setWeekStart(d => addDays(d, -7));
  const nextWeek = () => setWeekStart(d => addDays(d, 7));

  const weekDates = DAYS.map((_, i) => addDays(weekStart, i));
  const weekDateStrings = weekDates.map(formatDate);

  const entriesByDate: Record<string, any[]> = {};
  weekDateStrings.forEach(d => { entriesByDate[d] = []; });
  entries.forEach(e => {
    const dateStr = e.date?.substring(0, 10);
    if (entriesByDate[dateStr]) entriesByDate[dateStr].push(e);
  });

  const handleSubmitTimesheet = async () => {
    if (!selectedEmployee) return;
    try {
      await hrApi.submitTimesheet({
        employeeId: selectedEmployee,
        weekStart: formatDate(weekStart),
        weekEnd: formatDate(addDays(weekStart, 6)),
      });
      alert('Timesheet submitted successfully');
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to submit timesheet');
    }
  };

  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;
    try {
      await hrApi.createTimeEntry({
        employeeId: selectedEmployee,
        ...entryForm,
        startTime: entryForm.date + 'T' + entryForm.startTime,
        endTime: entryForm.endTime ? entryForm.date + 'T' + entryForm.endTime : undefined,
      });
      setShowAddEntry(false);
      setEntryForm({ date: '', startTime: '', endTime: '', taskDescription: '', projectCode: '' });
      const res = await hrApi.getTimeEntries({ employeeId: selectedEmployee });
      const data = res.data?.data?.items ?? res.data?.data ?? res.data ?? [];
      setEntries(Array.isArray(data) ? data : []);
    } catch (err: any) {
      alert(err?.response?.data?.message ?? 'Failed to add entry');
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
          <p className="text-sm text-gray-500 mt-1">Weekly time tracking</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddEntry(true)} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium">
            <Plus className="h-4 w-4" />
            Add Entry
          </button>
          <button onClick={handleSubmitTimesheet} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium">
            Submit Week
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <select
          value={selectedEmployee}
          onChange={e => setSelectedEmployee(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
        >
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-sm font-medium">
            {weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric' })} – {addDays(weekStart, 6).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
          <button onClick={nextWeek} className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Task</th>
                {DAYS.map((day, i) => (
                  <th key={day} className="text-center px-3 py-3 font-medium text-gray-600">
                    <div>{day}</div>
                    <div className="text-xs text-gray-400">{weekDates[i].getDate()}</div>
                  </th>
                ))}
                <th className="text-center px-3 py-3 font-medium text-gray-600">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-gray-400">No time entries for this week. Add entries to track time.</td>
                </tr>
              ) : (
                entries
                  .filter(e => weekDateStrings.includes(e.date?.substring(0, 10)))
                  .map(entry => (
                    <tr key={entry.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{entry.taskDescription ?? 'Task'}</div>
                        {entry.projectCode && <div className="text-xs text-gray-400">{entry.projectCode}</div>}
                      </td>
                      {weekDateStrings.map(dateStr => {
                        const dateEntry = entriesByDate[dateStr]?.find(e => e.id === entry.id);
                        return (
                          <td key={dateStr} className="text-center px-3 py-3 text-gray-600">
                            {dateEntry ? `${Math.round((dateEntry.durationMinutes ?? 0) / 60 * 10) / 10}h` : '-'}
                          </td>
                        );
                      })}
                      <td className="text-center px-3 py-3 font-medium text-gray-900">
                        {Math.round((entry.durationMinutes ?? 0) / 60 * 10) / 10}h
                      </td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-5 border-b">
              <h2 className="text-lg font-semibold">Add Time Entry</h2>
              <button onClick={() => setShowAddEntry(false)} className="text-gray-400 hover:text-gray-600">X</button>
            </div>
            <form onSubmit={handleAddEntry} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <input required type="date" value={entryForm.date} onChange={e => setEntryForm(f => ({ ...f, date: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
                  <input required type="time" value={entryForm.startTime} onChange={e => setEntryForm(f => ({ ...f, startTime: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <input type="time" value={entryForm.endTime} onChange={e => setEntryForm(f => ({ ...f, endTime: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Task Description</label>
                <input value={entryForm.taskDescription} onChange={e => setEntryForm(f => ({ ...f, taskDescription: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="What did you work on?" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Project Code</label>
                <input value={entryForm.projectCode} onChange={e => setEntryForm(f => ({ ...f, projectCode: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="PROJ-001" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddEntry(false)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2 text-sm font-medium hover:bg-gray-50">Cancel</button>
                <button type="submit" className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700">Add Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
