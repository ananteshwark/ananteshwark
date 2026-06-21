import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { taxApi } from '../../api/tax';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Card, CardContent } from '../../components/ui/Card';

const TAX_TYPES = [
  { value: 'GST_CGST_SGST', label: 'GST — CGST + SGST' },
  { value: 'GST_IGST', label: 'GST — IGST' },
  { value: 'VAT', label: 'VAT' },
  { value: 'WITHHOLDING', label: 'Withholding (TDS)' },
  { value: 'NONE', label: 'None / Exempt' },
];

interface TaxComponent {
  name: string;
  rate: number | string;
  glAccountId?: string;
}

interface TaxCodeForm {
  code: string;
  name: string;
  type: string;
  rate: number | string;
  components: TaxComponent[];
  description: string;
}

const emptyForm = (): TaxCodeForm => ({
  code: '',
  name: '',
  type: 'GST_CGST_SGST',
  rate: 18,
  components: [],
  description: '',
});

function formatComponents(components: TaxComponent[], type: string, rate: number): string {
  if (components && components.length > 0) {
    return components.map((c) => `${c.name} ${c.rate}%`).join(' + ');
  }
  // derive label from type
  switch (type) {
    case 'GST_CGST_SGST': {
      const half = rate / 2;
      return `CGST ${half}% + SGST ${half}%`;
    }
    case 'GST_IGST':
      return `IGST ${rate}%`;
    case 'VAT':
      return `VAT ${rate}%`;
    case 'WITHHOLDING':
      return `TDS ${rate}%`;
    default:
      return `${rate}%`;
  }
}

function TaxCodeModal({
  isOpen,
  onClose,
  initial,
}: {
  isOpen: boolean;
  onClose: () => void;
  initial?: any;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!initial;

  const [form, setForm] = useState<TaxCodeForm>(emptyForm());

  useEffect(() => {
    if (initial) {
      setForm({
        code: initial.code || '',
        name: initial.name || '',
        type: initial.type || 'GST_CGST_SGST',
        rate: initial.rate ?? 18,
        components: initial.components || [],
        description: initial.description || '',
      });
    } else {
      setForm(emptyForm());
    }
  }, [initial, isOpen]);

  const createMut = useMutation({
    mutationFn: (data: any) => taxApi.createCode(data).then((r) => r.data?.data ?? r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxCodes'] });
      toast.success('Tax code created');
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to create'),
  });

  const updateMut = useMutation({
    mutationFn: (data: any) =>
      taxApi.updateCode(initial.id, data).then((r) => r.data?.data ?? r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxCodes'] });
      toast.success('Tax code updated');
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to update'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      rate: Number(form.rate),
      components: form.components.map((c) => ({ ...c, rate: Number(c.rate) })),
    };
    if (isEdit) updateMut.mutate(payload);
    else createMut.mutate(payload);
  };

  const addComponent = () => {
    setForm((f) => ({
      ...f,
      components: [...f.components, { name: '', rate: 0 }],
    }));
  };

  const removeComponent = (idx: number) => {
    setForm((f) => ({
      ...f,
      components: f.components.filter((_, i) => i !== idx),
    }));
  };

  const updateComponent = (idx: number, field: keyof TaxComponent, value: string) => {
    setForm((f) => {
      const comps = [...f.components];
      comps[idx] = { ...comps[idx], [field]: value };
      return { ...f, components: comps };
    });
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Edit Tax Code' : 'New Tax Code'} size="lg">
      <form onSubmit={handleSubmit} className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Code"
            name="code"
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
            placeholder="e.g. GST18"
            required
            disabled={isEdit}
          />
          <Input
            label="Name"
            name="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. GST 18%"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Type"
            name="type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            options={TAX_TYPES}
          />
          <Input
            label="Overall Rate (%)"
            name="rate"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={form.rate}
            onChange={(e) => setForm({ ...form, rate: e.target.value })}
            required
          />
        </div>

        {/* Components */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Components <span className="text-gray-400 font-normal">(optional — auto-derived if empty)</span>
            </label>
            <button
              type="button"
              onClick={addComponent}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Add component
            </button>
          </div>
          {form.components.length === 0 && (
            <p className="text-xs text-gray-400 italic">
              Preview: {formatComponents([], form.type, Number(form.rate))}
            </p>
          )}
          {form.components.map((comp, idx) => (
            <div key={idx} className="flex items-center gap-2 mb-2">
              <Input
                placeholder="Component name (e.g. CGST)"
                value={comp.name}
                onChange={(e) => updateComponent(idx, 'name', e.target.value)}
                className="flex-1"
              />
              <Input
                type="number"
                placeholder="Rate %"
                min={0}
                max={100}
                step={0.01}
                value={comp.rate}
                onChange={(e) => updateComponent(idx, 'rate', e.target.value)}
                className="w-24"
              />
              <button
                type="button"
                onClick={() => removeComponent(idx)}
                className="text-red-400 hover:text-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <Input
          label="Description"
          name="description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Optional description"
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={isSaving}>
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function TaxCodesPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);

  const { data: rawData, isLoading } = useQuery({
    queryKey: ['taxCodes'],
    queryFn: () => taxApi.listCodes().then((r) => r.data?.data ?? r.data),
  });

  const codes: any[] = Array.isArray(rawData) ? rawData : [];

  const deleteMut = useMutation({
    mutationFn: (id: string) => taxApi.deleteCode(id).then((r) => r.data?.data ?? r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['taxCodes'] });
      toast.success('Tax code deactivated');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Failed to delete'),
  });

  const openCreate = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const openEdit = (code: any) => {
    setEditTarget(code);
    setModalOpen(true);
  };

  const typeLabel = (type: string) => TAX_TYPES.find((t) => t.value === type)?.label ?? type;

  return (
    <div>
      <PageHeader
        title="Tax Codes"
        description="Manage GST, VAT, and withholding tax codes for your organization"
        actions={
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New Tax Code
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-10 text-gray-500">Loading...</div>
          ) : codes.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p className="font-medium">No tax codes yet</p>
              <p className="text-sm mt-1">Create your first tax code to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Rate</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Components</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {codes.map((code: any) => (
                    <tr key={code.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono font-semibold text-gray-900">{code.code}</td>
                      <td className="px-4 py-3 text-gray-700">{code.name}</td>
                      <td className="px-4 py-3 text-gray-500">{typeLabel(code.type)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{Number(code.rate)}%</td>
                      <td className="px-4 py-3 text-gray-600">
                        {formatComponents(code.components, code.type, Number(code.rate))}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={code.isActive ? 'success' : 'default'}>
                          {code.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            onClick={() => openEdit(code)}
                            className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => deleteMut.mutate(code.id)}
                            className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                            title="Deactivate"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <TaxCodeModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initial={editTarget}
      />
    </div>
  );
}
