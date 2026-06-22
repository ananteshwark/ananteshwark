import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceApi } from '../../api/maintenance';
import { clsx } from 'clsx';
import { Gauge, Plus, AlertTriangle } from 'lucide-react';

const COUNTER_TYPES = ['HOURS', 'KM', 'CYCLES'];

export default function CounterReadingsPage() {
  const qc = useQueryClient();
  const [equipmentId, setEquipmentId] = useState('');
  const [showModal, setShowModal] = useState(false);

  const { data: equipRes } = useQuery({ queryKey: ['maint-equipment'], queryFn: () => maintenanceApi.getEquipment() });
  const equipment: any[] = (equipRes as any)?.data?.data?.items ?? (equipRes as any)?.data?.items ?? [];

  const { data: readingsRes } = useQuery({
    queryKey: ['counter-readings', equipmentId],
    queryFn: () => maintenanceApi.getCounterReadings(equipmentId),
    enabled: !!equipmentId,
  });
  const readings: any[] = (readingsRes as any)?.data?.data ?? (readingsRes as any)?.data ?? [];

  const { data: dueRes } = useQuery({ queryKey: ['due-plans-all'], queryFn: () => maintenanceApi.getDuePlansAll() });
  const duePlans: any[] = (dueRes as any)?.data?.data ?? (dueRes as any)?.data ?? [];

  const recordMut = useMutation({
    mutationFn: ({ id, data }: any) => maintenanceApi.recordCounterReading(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['counter-readings', equipmentId] });
      qc.invalidateQueries({ queryKey: ['due-plans-all'] });
      setShowModal(false);
    },
  });

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    recordMut.mutate({
      id: equipmentId,
      data: {
        counterType: f.get('counterType'),
        reading: Number(f.get('reading')),
        readingDate: f.get('readingDate'),
      },
    });
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Counter Readings</h1>
          <p className="text-gray-500 text-sm mt-1">Record meter readings and track counter-based maintenance</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          disabled={!equipmentId}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Record Reading
        </button>
      </div>

      {/* Due Maintenance panel */}
      <div className="bg-white rounded-xl border mb-6 overflow-hidden">
        <div className="px-4 py-3 border-b bg-amber-50 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="font-medium text-amber-800">Due Maintenance ({duePlans.length})</span>
        </div>
        {duePlans.length === 0 ? (
          <div className="px-4 py-6 text-center text-gray-400 text-sm">No plans currently due</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>{['Plan', 'Trigger', 'Counter Type', 'Next Due', 'Last Reading', 'Next Due Date'].map(h => <th key={h} className="px-4 py-2 text-left font-medium text-gray-600">{h}</th>)}</tr></thead>
            <tbody>
              {duePlans.map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2">{p.triggerType ?? 'TIME'}</td>
                  <td className="px-4 py-2">{p.counterType ?? '—'}</td>
                  <td className="px-4 py-2">{p.nextDueCounter ?? '—'}</td>
                  <td className="px-4 py-2">{p.lastCounterReading ?? '—'}</td>
                  <td className="px-4 py-2">{p.nextDueDate ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Equipment picker */}
      <div className="bg-white rounded-xl border p-4 mb-6">
        <label className="text-xs text-gray-500">Equipment</label>
        <select value={equipmentId} onChange={e => setEquipmentId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
          <option value="">— Select equipment —</option>
          {equipment.map((eq: any) => <option key={eq.id} value={eq.id}>{eq.equipmentCode} — {eq.name}</option>)}
        </select>
      </div>

      {/* Reading history */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Gauge className="h-4 w-4 text-gray-400" />
          <span className="font-medium">Reading History</span>
        </div>
        {!equipmentId ? (
          <div className="px-4 py-8 text-center text-gray-400 text-sm">Select equipment to view its readings</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50"><tr>{['Date', 'Counter Type', 'Reading'].map(h => <th key={h} className="px-4 py-2 text-left font-medium text-gray-600">{h}</th>)}</tr></thead>
            <tbody>
              {readings.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No readings recorded</td></tr>}
              {readings.map((r: any) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">{r.readingDate}</td>
                  <td className="px-4 py-2"><span className={clsx('px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700')}>{r.counterType}</span></td>
                  <td className="px-4 py-2 font-mono">{r.reading}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[400px]" onSubmit={submit}>
            <h2 className="text-lg font-semibold mb-4">Record Counter Reading</h2>
            <div className="space-y-3">
              <div><label className="text-xs text-gray-500">Counter Type</label>
                <select name="counterType" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                  {COUNTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="text-xs text-gray-500">Reading</label><input name="reading" type="number" step="0.01" required className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-xs text-gray-500">Reading Date</label><input name="readingDate" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Record</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
