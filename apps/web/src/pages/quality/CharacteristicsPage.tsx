import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qualityApi } from '../../api/quality';
import { clsx } from 'clsx';
import { Plus, Pencil, Trash2, ListChecks } from 'lucide-react';

const unwrap = (res: any) => res?.data?.data ?? res?.data;

interface CharForm {
  code: string;
  name: string;
  type: 'MEASURED' | 'QUALITATIVE';
  uom: string;
  lowerLimit: string;
  upperLimit: string;
  target: string;
  mandatory: boolean;
  sequence: string;
}

const emptyForm: CharForm = {
  code: '', name: '', type: 'MEASURED', uom: '',
  lowerLimit: '', upperLimit: '', target: '', mandatory: true, sequence: '0',
};

export default function CharacteristicsPage() {
  const qc = useQueryClient();
  const [planId, setPlanId] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<CharForm>(emptyForm);

  const { data: plansRes } = useQuery({ queryKey: ['quality-plans'], queryFn: () => qualityApi.getPlans() });
  const plans = unwrap(plansRes)?.items ?? unwrap(plansRes) ?? [];

  const { data: charsRes } = useQuery({
    queryKey: ['quality-characteristics', planId],
    queryFn: () => qualityApi.getCharacteristics(planId),
    enabled: !!planId,
  });
  const chars = unwrap(charsRes) ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ['quality-characteristics', planId] });

  const createMut = useMutation({
    mutationFn: (d: any) => qualityApi.createCharacteristic(planId, d),
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => qualityApi.updateCharacteristic(id, data),
    onSuccess: () => { invalidate(); closeModal(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => qualityApi.deleteCharacteristic(id),
    onSuccess: () => invalidate(),
  });

  const openCreate = () => { setEditId(null); setForm(emptyForm); setShowModal(true); };
  const openEdit = (c: any) => {
    setEditId(c.id);
    setForm({
      code: c.code ?? '', name: c.name ?? '', type: c.type ?? 'MEASURED', uom: c.uom ?? '',
      lowerLimit: c.lowerLimit?.toString() ?? '', upperLimit: c.upperLimit?.toString() ?? '',
      target: c.target?.toString() ?? '', mandatory: c.mandatory ?? true, sequence: c.sequence?.toString() ?? '0',
    });
    setShowModal(true);
  };
  const closeModal = () => { setShowModal(false); setEditId(null); setForm(emptyForm); };

  const submit = () => {
    const payload: any = {
      code: form.code,
      name: form.name,
      type: form.type,
      uom: form.uom || undefined,
      mandatory: form.mandatory,
      sequence: form.sequence === '' ? 0 : Number(form.sequence),
    };
    if (form.type === 'MEASURED') {
      payload.lowerLimit = form.lowerLimit === '' ? undefined : Number(form.lowerLimit);
      payload.upperLimit = form.upperLimit === '' ? undefined : Number(form.upperLimit);
      payload.target = form.target === '' ? undefined : Number(form.target);
    }
    if (editId) updateMut.mutate({ id: editId, data: payload });
    else createMut.mutate(payload);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><ListChecks className="h-6 w-6" /> Quality Characteristics</h1>
          <p className="text-gray-500 text-sm mt-1">Define measured and qualitative characteristics per inspection plan</p>
        </div>
        {planId && (
          <button onClick={openCreate} className="inline-flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            <Plus className="h-4 w-4" /> Add Characteristic
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl p-4 border mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Inspection Plan</label>
        <select value={planId} onChange={(e) => setPlanId(e.target.value)} className="w-full max-w-md border rounded-lg px-3 py-2 text-sm">
          <option value="">Select an inspection plan…</option>
          {plans.map((p: any) => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </select>
      </div>

      {planId && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-4 py-3">Seq</th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">UoM</th>
                <th className="px-4 py-3">Lower</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Upper</th>
                <th className="px-4 py-3">Mandatory</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {chars.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-6 text-center text-gray-400">No characteristics defined yet.</td></tr>
              )}
              {chars.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">{c.sequence}</td>
                  <td className="px-4 py-3 font-medium">{c.code}</td>
                  <td className="px-4 py-3">{c.name}</td>
                  <td className="px-4 py-3">
                    <span className={clsx('px-2 py-0.5 rounded text-xs', c.type === 'MEASURED' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800')}>{c.type}</span>
                  </td>
                  <td className="px-4 py-3">{c.uom ?? '—'}</td>
                  <td className="px-4 py-3">{c.lowerLimit ?? '—'}</td>
                  <td className="px-4 py-3">{c.target ?? '—'}</td>
                  <td className="px-4 py-3">{c.upperLimit ?? '—'}</td>
                  <td className="px-4 py-3">{c.mandatory ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(c)} className="text-gray-500 hover:text-blue-600 mr-2"><Pencil className="h-4 w-4 inline" /></button>
                    <button onClick={() => { if (confirm('Delete this characteristic?')) deleteMut.mutate(c.id); }} className="text-gray-500 hover:text-red-600"><Trash2 className="h-4 w-4 inline" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg">
            <h2 className="text-lg font-bold mb-4">{editId ? 'Edit' : 'Add'} Characteristic</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Code</label>
                <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="MEASURED">MEASURED</option>
                  <option value="QUALITATIVE">QUALITATIVE</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">UoM</label>
                <input value={form.uom} onChange={(e) => setForm({ ...form, uom: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              {form.type === 'MEASURED' && (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Lower Limit</label>
                    <input type="number" value={form.lowerLimit} onChange={(e) => setForm({ ...form, lowerLimit: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Upper Limit</label>
                    <input type="number" value={form.upperLimit} onChange={(e) => setForm({ ...form, upperLimit: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Target</label>
                    <input type="number" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-xs text-gray-500 mb-1">Sequence</label>
                <input type="number" value={form.sequence} onChange={(e) => setForm({ ...form, sequence: e.target.value })} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex items-center gap-2 mt-6">
                <input id="mandatory" type="checkbox" checked={form.mandatory} onChange={(e) => setForm({ ...form, mandatory: e.target.checked })} />
                <label htmlFor="mandatory" className="text-sm text-gray-700">Mandatory</label>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={closeModal} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={submit} disabled={!form.code || !form.name || createMut.isPending || updateMut.isPending} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
