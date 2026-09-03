import { useState, useEffect } from 'react';
import { serviceTicketsApi } from '../../api/serviceTickets';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const DEFAULTS: Record<string, { response: number; resolution: number }> = {
  LOW: { response: 480, resolution: 2880 },
  MEDIUM: { response: 240, resolution: 1440 },
  HIGH: { response: 120, resolution: 480 },
  CRITICAL: { response: 30, resolution: 240 },
};

export default function SlaPoliciesPage() {
  const [rows, setRows] = useState<Record<string, { responseMinutes: number; resolutionMinutes: number; isActive: boolean }>>({});
  const [loading, setLoading] = useState(false);
  const [savingPriority, setSavingPriority] = useState<string | null>(null);

  const fetchAll = () => {
    setLoading(true);
    serviceTicketsApi
      .listSla()
      .then((list: any[]) => {
        const map: any = {};
        for (const p of PRIORITIES) {
          map[p] = {
            responseMinutes: DEFAULTS[p].response,
            resolutionMinutes: DEFAULTS[p].resolution,
            isActive: true,
          };
        }
        (Array.isArray(list) ? list : []).forEach((p: any) => {
          map[p.priority] = {
            responseMinutes: p.responseMinutes,
            resolutionMinutes: p.resolutionMinutes,
            isActive: p.isActive,
          };
        });
        setRows(map);
      })
      .catch(() => {
        const map: any = {};
        for (const p of PRIORITIES) {
          map[p] = { responseMinutes: DEFAULTS[p].response, resolutionMinutes: DEFAULTS[p].resolution, isActive: true };
        }
        setRows(map);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const update = (priority: string, field: string, value: any) => {
    setRows((prev) => ({ ...prev, [priority]: { ...prev[priority], [field]: value } }));
  };

  const save = async (priority: string) => {
    setSavingPriority(priority);
    try {
      await serviceTicketsApi.saveSla({
        priority,
        responseMinutes: Number(rows[priority].responseMinutes),
        resolutionMinutes: Number(rows[priority].resolutionMinutes),
        isActive: rows[priority].isActive,
      });
      fetchAll();
    } catch {
      alert('Failed to save SLA policy');
    } finally {
      setSavingPriority(null);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">SLA Policies</h1>
      <p className="text-sm text-gray-500 mb-4">
        Response and resolution targets per priority, in minutes. Used to compute SLA due dates for new tickets.
      </p>

      {loading && <p className="text-gray-500 text-sm">Loading…</p>}

      {!loading && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Priority', 'Response (min)', 'Resolution (min)', 'Active', ''].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {PRIORITIES.map((p) => {
                const r = rows[p] || { responseMinutes: 0, resolutionMinutes: 0, isActive: true };
                return (
                  <tr key={p}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{p}</td>
                    <td className="px-4 py-3">
                      <input type="number" value={r.responseMinutes} onChange={(e) => update(p, 'responseMinutes', e.target.value)} className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                    </td>
                    <td className="px-4 py-3">
                      <input type="number" value={r.resolutionMinutes} onChange={(e) => update(p, 'resolutionMinutes', e.target.value)} className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-sm" />
                    </td>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={r.isActive} onChange={(e) => update(p, 'isActive', e.target.checked)} />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => save(p)} disabled={savingPriority === p} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 disabled:opacity-50">
                        {savingPriority === p ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
