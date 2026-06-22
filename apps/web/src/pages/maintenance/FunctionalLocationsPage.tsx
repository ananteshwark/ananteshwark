import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { maintenanceApi } from '../../api/maintenance';
import { clsx } from 'clsx';
import { Plus, MapPin, ChevronRight, Pencil, Trash2 } from 'lucide-react';

interface FlocNode {
  id: string;
  code: string;
  description?: string | null;
  parentId?: string | null;
  structureIndicator?: string | null;
  isActive: boolean;
  children: FlocNode[];
}

const STRUCTURE_INDICATORS = ['PLANT', 'AREA', 'UNIT', 'TAG'];

const indicatorColor = (s?: string | null) => ({
  PLANT: 'bg-purple-100 text-purple-800',
  AREA: 'bg-blue-100 text-blue-800',
  UNIT: 'bg-teal-100 text-teal-800',
  TAG: 'bg-amber-100 text-amber-800',
}[s ?? ''] ?? 'bg-gray-100 text-gray-600');

function FlocRow({ node, depth, onEdit, onDelete }: { node: FlocNode; depth: number; onEdit: (n: FlocNode) => void; onDelete: (n: FlocNode) => void }) {
  return (
    <>
      <div className="flex items-center justify-between px-4 py-2.5 border-t hover:bg-gray-50">
        <div className="flex items-center gap-2" style={{ paddingLeft: `${depth * 20}px` }}>
          {depth > 0 && <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          <MapPin className="h-4 w-4 text-gray-400" />
          <span className="font-mono text-sm font-medium">{node.code}</span>
          {node.structureIndicator && (
            <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', indicatorColor(node.structureIndicator))}>{node.structureIndicator}</span>
          )}
          {node.description && <span className="text-sm text-gray-500">— {node.description}</span>}
          {!node.isActive && <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">Inactive</span>}
        </div>
        <div className="flex gap-3">
          <button onClick={() => onEdit(node)} className="text-gray-400 hover:text-blue-600"><Pencil className="h-4 w-4" /></button>
          <button onClick={() => onDelete(node)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
        </div>
      </div>
      {node.children?.map(c => <FlocRow key={c.id} node={c} depth={depth + 1} onEdit={onEdit} onDelete={onDelete} />)}
    </>
  );
}

export default function FunctionalLocationsPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<FlocNode | null>(null);

  const { data: treeRes } = useQuery({ queryKey: ['floc-tree'], queryFn: () => maintenanceApi.getFunctionalLocationTree() });
  const { data: flatRes } = useQuery({ queryKey: ['floc-flat'], queryFn: () => maintenanceApi.getFunctionalLocations() });
  const tree: FlocNode[] = (treeRes as any)?.data?.data ?? (treeRes as any)?.data ?? [];
  const flat: FlocNode[] = (flatRes as any)?.data?.data ?? (flatRes as any)?.data ?? [];

  const invalidate = () => { qc.invalidateQueries({ queryKey: ['floc-tree'] }); qc.invalidateQueries({ queryKey: ['floc-flat'] }); };

  const createMut = useMutation({ mutationFn: (d: any) => maintenanceApi.createFunctionalLocation(d), onSuccess: () => { invalidate(); setShowModal(false); } });
  const updateMut = useMutation({ mutationFn: ({ id, data }: any) => maintenanceApi.updateFunctionalLocation(id, data), onSuccess: () => { invalidate(); setShowModal(false); setEditing(null); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => maintenanceApi.deleteFunctionalLocation(id), onSuccess: invalidate });

  const openAdd = () => { setEditing(null); setShowModal(true); };
  const openEdit = (n: FlocNode) => { setEditing(n); setShowModal(true); };
  const onDelete = (n: FlocNode) => { if (confirm(`Delete functional location ${n.code}?`)) deleteMut.mutate(n.id); };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const data = {
      code: f.get('code'),
      description: f.get('description') || undefined,
      parentId: f.get('parentId') || undefined,
      structureIndicator: f.get('structureIndicator') || undefined,
      isActive: f.get('isActive') === 'on',
    };
    if (editing) updateMut.mutate({ id: editing.id, data });
    else createMut.mutate(data);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Functional Locations</h1>
          <p className="text-gray-500 text-sm mt-1">Hierarchical plant structure (Plant / Area / Unit / Tag)</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700">
          <Plus className="h-4 w-4" /> Add Location
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {tree.length === 0 && <div className="px-4 py-10 text-center text-gray-400">No functional locations defined</div>}
        {tree.map(n => <FlocRow key={n.id} node={n} depth={0} onEdit={openEdit} onDelete={onDelete} />)}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <form className="bg-white rounded-xl p-6 w-[480px]" onSubmit={submit}>
            <h2 className="text-lg font-semibold mb-4">{editing ? 'Edit' : 'Add'} Functional Location</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-gray-500">Code</label><input name="code" required defaultValue={editing?.code ?? ''} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
                <div><label className="text-xs text-gray-500">Structure Indicator</label>
                  <select name="structureIndicator" defaultValue={editing?.structureIndicator ?? ''} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                    <option value="">—</option>
                    {STRUCTURE_INDICATORS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="text-xs text-gray-500">Description</label><input name="description" defaultValue={editing?.description ?? ''} className="w-full border rounded-lg px-3 py-2 text-sm mt-1" /></div>
              <div><label className="text-xs text-gray-500">Parent Location</label>
                <select name="parentId" defaultValue={editing?.parentId ?? ''} className="w-full border rounded-lg px-3 py-2 text-sm mt-1">
                  <option value="">— None (Root) —</option>
                  {flat.filter(f => f.id !== editing?.id).map(f => <option key={f.id} value={f.id}>{f.code}{f.description ? ` — ${f.description}` : ''}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isActive" defaultChecked={editing ? editing.isActive : true} /> Active</label>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => { setShowModal(false); setEditing(null); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">{editing ? 'Save' : 'Add'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
