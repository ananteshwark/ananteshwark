import { useState, useEffect } from 'react';
import {
  SlidersHorizontal,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical,
} from 'lucide-react';
import { customFieldsApi } from '../../api/customFields';

const unwrapList = (res: any) => {
  const d = res.data?.data ?? res.data;
  return Array.isArray(d) ? d : d?.items ?? [];
};
const unwrap = (res: any) => res.data?.data ?? res.data;

const ENTITY_TYPES = [
  { value: 'EMPLOYEE', label: 'Employee' },
  { value: 'VENDOR', label: 'Vendor' },
  { value: 'CUSTOMER', label: 'Customer' },
  { value: 'PURCHASE_ORDER', label: 'Purchase Order' },
  { value: 'VENDOR_INVOICE', label: 'Vendor Invoice' },
  { value: 'SALES_ORDER', label: 'Sales Order' },
  { value: 'ASSET', label: 'Fixed Asset' },
  { value: 'PROJECT', label: 'Project' },
];

const FIELD_TYPES = [
  { value: 'TEXT', label: 'Text' },
  { value: 'NUMBER', label: 'Number' },
  { value: 'DATE', label: 'Date' },
  { value: 'DROPDOWN', label: 'Dropdown' },
  { value: 'CHECKBOX', label: 'Checkbox' },
  { value: 'MULTI_SELECT', label: 'Multi-select' },
];

const FIELD_TYPE_BADGE: Record<string, string> = {
  TEXT: 'bg-blue-100 text-blue-700',
  NUMBER: 'bg-purple-100 text-purple-700',
  DATE: 'bg-green-100 text-green-700',
  DROPDOWN: 'bg-yellow-100 text-yellow-700',
  CHECKBOX: 'bg-pink-100 text-pink-700',
  MULTI_SELECT: 'bg-orange-100 text-orange-700',
};

const emptyForm = () => ({
  entityType: 'EMPLOYEE',
  fieldKey: '',
  fieldLabel: '',
  fieldType: 'TEXT',
  isRequired: false,
  showInList: false,
  options: '',
  defaultValue: '',
  sortOrder: 0,
  description: '',
});

export default function CustomFieldsPage() {
  const [definitions, setDefinitions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedEntity, setExpandedEntity] = useState<string | null>('EMPLOYEE');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await customFieldsApi.listDefinitions();
      setDefinitions(unwrapList(res));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const byEntity = () => {
    const map: Record<string, any[]> = {};
    for (const et of ENTITY_TYPES) map[et.value] = [];
    for (const def of definitions) {
      if (map[def.entityType]) map[def.entityType].push(def);
    }
    return map;
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (def: any) => {
    setEditing(def);
    setForm({
      entityType: def.entityType,
      fieldKey: def.fieldKey,
      fieldLabel: def.fieldLabel,
      fieldType: def.fieldType,
      isRequired: def.isRequired,
      showInList: def.showInList,
      options: (def.options ?? []).join(', '),
      defaultValue: def.defaultValue ?? '',
      sortOrder: def.sortOrder ?? 0,
      description: def.description ?? '',
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.fieldKey || !form.fieldLabel) return;
    setSaving(true);
    try {
      const payload = {
        entityType: form.entityType,
        fieldKey: form.fieldKey,
        fieldLabel: form.fieldLabel,
        fieldType: form.fieldType,
        isRequired: form.isRequired,
        showInList: form.showInList,
        options: form.options
          ? form.options.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
        defaultValue: form.defaultValue || undefined,
        sortOrder: form.sortOrder,
        description: form.description || undefined,
      };
      if (editing) {
        await customFieldsApi.updateDefinition(editing.id, payload);
      } else {
        await customFieldsApi.createDefinition(payload);
      }
      setShowForm(false);
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this custom field and all its values?')) return;
    await customFieldsApi.deleteDefinition(id);
    load();
  };

  const needsOptions = form.fieldType === 'DROPDOWN' || form.fieldType === 'MULTI_SELECT';
  const grouped = byEntity();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="w-7 h-7 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Custom Fields</h1>
            <p className="text-sm text-gray-500">Add custom fields to any entity in the system</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
        >
          <Plus className="w-4 h-4" /> Add Field
        </button>
      </div>

      {/* ── Create/Edit Form ──────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-800">
            {editing ? 'Edit Custom Field' : 'New Custom Field'}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Entity *</label>
              <select
                className="border rounded-lg px-3 py-2 text-sm w-full"
                value={form.entityType}
                disabled={!!editing}
                onChange={(e) => setForm({ ...form, entityType: e.target.value })}
              >
                {ENTITY_TYPES.map((et) => (
                  <option key={et.value} value={et.value}>{et.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Field Type *</label>
              <select
                className="border rounded-lg px-3 py-2 text-sm w-full"
                value={form.fieldType}
                disabled={!!editing}
                onChange={(e) => setForm({ ...form, fieldType: e.target.value })}
              >
                {FIELD_TYPES.map((ft) => (
                  <option key={ft.value} value={ft.value}>{ft.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Field Key * (snake_case)</label>
              <input
                className="border rounded-lg px-3 py-2 text-sm w-full font-mono"
                value={form.fieldKey}
                disabled={!!editing}
                placeholder="my_field"
                onChange={(e) => setForm({ ...form, fieldKey: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Label *</label>
              <input
                className="border rounded-lg px-3 py-2 text-sm w-full"
                value={form.fieldLabel}
                placeholder="My Field"
                onChange={(e) => setForm({ ...form, fieldLabel: e.target.value })}
              />
            </div>
            {needsOptions && (
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">
                  Options (comma-separated) *
                </label>
                <input
                  className="border rounded-lg px-3 py-2 text-sm w-full"
                  value={form.options}
                  placeholder="Option 1, Option 2, Option 3"
                  onChange={(e) => setForm({ ...form, options: e.target.value })}
                />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Default Value</label>
              <input
                className="border rounded-lg px-3 py-2 text-sm w-full"
                value={form.defaultValue}
                onChange={(e) => setForm({ ...form, defaultValue: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Sort Order</label>
              <input
                type="number"
                className="border rounded-lg px-3 py-2 text-sm w-full"
                value={form.sortOrder}
                min={0}
                onChange={(e) => setForm({ ...form, sortOrder: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">Description</label>
              <input
                className="border rounded-lg px-3 py-2 text-sm w-full"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.isRequired}
                onChange={(e) => setForm({ ...form, isRequired: e.target.checked })}
              />
              Required
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.showInList}
                onChange={(e) => setForm({ ...form, showInList: e.target.checked })}
              />
              Show in list view
            </label>
          </div>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => { setShowForm(false); setEditing(null); }}
              className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !form.fieldKey || !form.fieldLabel}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* ── Grouped list ─────────────────────────────────────────────────── */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading…</div>
      ) : (
        <div className="space-y-3">
          {ENTITY_TYPES.map((et) => {
            const fields = grouped[et.value] ?? [];
            const isOpen = expandedEntity === et.value;
            return (
              <div key={et.value} className="bg-white border rounded-xl overflow-hidden shadow-sm">
                <button
                  className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
                  onClick={() => setExpandedEntity(isOpen ? null : et.value)}
                >
                  <div className="flex items-center gap-3">
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                    <span className="font-medium text-gray-800">{et.label}</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                      {fields.length} field{fields.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setForm({ ...emptyForm(), entityType: et.value });
                      setEditing(null);
                      setShowForm(true);
                      setExpandedEntity(et.value);
                    }}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded hover:bg-indigo-50"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                </button>

                {isOpen && (
                  <div className="border-t">
                    {fields.length === 0 ? (
                      <p className="text-sm text-gray-400 px-6 py-4">
                        No custom fields yet for {et.label}.
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-xs text-gray-500">
                          <tr>
                            <th className="w-6 px-3 py-2"></th>
                            <th className="text-left px-3 py-2">Key</th>
                            <th className="text-left px-3 py-2">Label</th>
                            <th className="text-left px-3 py-2">Type</th>
                            <th className="text-left px-3 py-2">Required</th>
                            <th className="text-left px-3 py-2">In List</th>
                            <th className="text-left px-3 py-2">Status</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {fields.map((f) => (
                            <tr key={f.id} className="border-t hover:bg-gray-50">
                              <td className="px-3 py-2.5 text-gray-300">
                                <GripVertical className="w-4 h-4" />
                              </td>
                              <td className="px-3 py-2.5 font-mono text-xs text-gray-600">{f.fieldKey}</td>
                              <td className="px-3 py-2.5 font-medium text-gray-800">{f.fieldLabel}</td>
                              <td className="px-3 py-2.5">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FIELD_TYPE_BADGE[f.fieldType] ?? 'bg-gray-100 text-gray-600'}`}>
                                  {f.fieldType}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {f.isRequired ? (
                                  <span className="text-xs text-red-600 font-medium">Yes</span>
                                ) : (
                                  <span className="text-xs text-gray-400">No</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {f.showInList ? (
                                  <span className="text-xs text-green-600 font-medium">Yes</span>
                                ) : (
                                  <span className="text-xs text-gray-400">No</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5">
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full ${
                                    f.isActive
                                      ? 'bg-green-100 text-green-700'
                                      : 'bg-gray-100 text-gray-500'
                                  }`}
                                >
                                  {f.isActive ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2 justify-end">
                                  <button
                                    onClick={() => openEdit(f)}
                                    className="p-1 text-gray-400 hover:text-indigo-600 rounded"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => remove(f.id)}
                                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                                  >
                                    <Trash2 className="w-4 h-4" />
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
