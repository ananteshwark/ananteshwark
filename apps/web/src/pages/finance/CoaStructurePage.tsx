import { useState, useEffect } from 'react';
import { financeApi } from '../../api/finance';

const OPERATORS = [
  { value: 'eq', label: 'equals' },
  { value: 'in', label: 'in list' },
  { value: 'range', label: 'in range' },
  { value: 'startsWith', label: 'starts with' },
];

function unwrap(res: any) {
  return res.data?.data ?? res.data ?? [];
}

// ─── Segments Tab ────────────────────────────────────────────────────

function SegmentsTab() {
  const [segments, setSegments] = useState<any[]>([]);
  const [form, setForm] = useState({ position: 1, code: '', label: '', length: 4, isRequired: true, delimiter: '-' });
  const [showForm, setShowForm] = useState(false);
  const [selectedSeg, setSelectedSeg] = useState<any>(null);
  const [values, setValues] = useState<any[]>([]);
  const [valueForm, setValueForm] = useState({ value: '', description: '', parentValue: '' });
  const [testCode, setTestCode] = useState('');
  const [testResult, setTestResult] = useState<string[] | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setSegments(unwrap(await financeApi.listSegments()));
  }

  async function loadValues(seg: any) {
    setSelectedSeg(seg);
    setValues(unwrap(await financeApi.listSegmentValues(seg.id)));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await financeApi.createSegment(form);
    setShowForm(false);
    setForm({ position: segments.length + 1, code: '', label: '', length: 4, isRequired: true, delimiter: '-' });
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete segment and its values?')) return;
    await financeApi.deleteSegment(id);
    if (selectedSeg?.id === id) { setSelectedSeg(null); setValues([]); }
    load();
  }

  async function handleAddValue(e: React.FormEvent) {
    e.preventDefault();
    await financeApi.createSegmentValue({ segmentId: selectedSeg.id, ...valueForm, parentValue: valueForm.parentValue || undefined });
    setValueForm({ value: '', description: '', parentValue: '' });
    loadValues(selectedSeg);
  }

  async function handleTest() {
    setTestResult(unwrap(await financeApi.validateAccountCode(testCode)));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Segment Definitions</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700">+ Segment</button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="border rounded-lg p-4 bg-gray-50 grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-gray-500">Position (1-6)</label>
            <input type="number" min={1} max={6} value={form.position} onChange={(e) => setForm({ ...form, position: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Code</label>
            <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="COMPANY" className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Label</label>
            <input required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Company" className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Length</label>
            <input type="number" value={form.length} onChange={(e) => setForm({ ...form, length: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Delimiter</label>
            <input value={form.delimiter} onChange={(e) => setForm({ ...form, delimiter: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <input type="checkbox" id="req" checked={form.isRequired} onChange={(e) => setForm({ ...form, isRequired: e.target.checked })} />
            <label htmlFor="req" className="text-sm">Required</label>
          </div>
          <div className="col-span-3 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="border rounded px-3 py-1 text-sm">Cancel</button>
            <button type="submit" className="bg-indigo-600 text-white px-3 py-1 rounded text-sm">Create</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr><th className="px-3 py-2 text-left">Pos</th><th className="px-3 py-2 text-left">Code</th><th className="px-3 py-2 text-left">Label</th><th className="px-3 py-2 text-left">Req</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y">
              {segments.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No segments defined — COA uses flat codes.</td></tr>
              ) : segments.map((s) => (
                <tr key={s.id} className={`hover:bg-gray-50 cursor-pointer ${selectedSeg?.id === s.id ? 'bg-indigo-50' : ''}`} onClick={() => loadValues(s)}>
                  <td className="px-3 py-2">{s.position}</td>
                  <td className="px-3 py-2 font-mono text-xs">{s.code}</td>
                  <td className="px-3 py-2">{s.label}</td>
                  <td className="px-3 py-2">{s.isRequired ? '✓' : '—'}</td>
                  <td className="px-3 py-2"><button onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }} className="text-red-500 text-xs hover:underline">Del</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border rounded-lg p-3">
          {selectedSeg ? (
            <>
              <h3 className="font-medium text-sm mb-2">Values for {selectedSeg.label}</h3>
              <form onSubmit={handleAddValue} className="flex gap-2 mb-3">
                <input required value={valueForm.value} onChange={(e) => setValueForm({ ...valueForm, value: e.target.value })} placeholder="value" className="border rounded px-2 py-1 text-sm w-20" />
                <input required value={valueForm.description} onChange={(e) => setValueForm({ ...valueForm, description: e.target.value })} placeholder="description" className="border rounded px-2 py-1 text-sm flex-1" />
                <button type="submit" className="bg-gray-200 px-2 py-1 rounded text-sm">Add</button>
              </form>
              <div className="max-h-48 overflow-y-auto divide-y text-sm">
                {values.length === 0 ? <p className="text-gray-400 text-xs">No values — any value accepted.</p> : values.map((v) => (
                  <div key={v.id} className="flex justify-between py-1">
                    <span><span className="font-mono">{v.value}</span> — {v.description}</span>
                    <button onClick={async () => { await financeApi.deleteSegmentValue(v.id); loadValues(selectedSeg); }} className="text-red-400 text-xs">×</button>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-gray-400 text-sm">Select a segment to manage its value set.</p>}
        </div>
      </div>

      <div className="border-t pt-3">
        <p className="text-xs font-medium text-gray-600 mb-2">Validate an account code against segment value sets</p>
        <div className="flex gap-2">
          <input value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="01-200-4000-PROD" className="border rounded px-2 py-1 text-sm font-mono w-64" />
          <button onClick={handleTest} className="bg-gray-200 px-3 py-1 rounded text-sm">Validate</button>
        </div>
        {testResult !== null && (
          <div className="mt-2 text-sm">
            {testResult.length === 0 ? <span className="text-green-600">✓ Valid</span> : (
              <ul className="text-red-600 list-disc ml-5">{testResult.map((e, i) => <li key={i}>{e}</li>)}</ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Trees Tab ───────────────────────────────────────────────────────

function TreeNode({ node, onAddChild, onDelete }: any) {
  return (
    <div className="ml-4 border-l pl-3 py-0.5">
      <div className="flex items-center gap-2 text-sm group">
        <span className={node.isLeaf ? 'text-blue-700' : 'font-medium'}>
          {node.isLeaf ? '🔵' : '📁'} {node.label}
        </span>
        <button onClick={() => onAddChild(node)} className="text-xs text-indigo-500 opacity-0 group-hover:opacity-100">+child</button>
        <button onClick={() => onDelete(node.id)} className="text-xs text-red-400 opacity-0 group-hover:opacity-100">×</button>
      </div>
      {node.children?.map((c: any) => <TreeNode key={c.id} node={c} onAddChild={onAddChild} onDelete={onDelete} />)}
    </div>
  );
}

function TreesTab() {
  const [trees, setTrees] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [structure, setStructure] = useState<any>(null);
  const [treeForm, setTreeForm] = useState({ code: '', name: '', description: '' });
  const [showTreeForm, setShowTreeForm] = useState(false);
  const [nodeParent, setNodeParent] = useState<any>(null);
  const [nodeForm, setNodeForm] = useState({ label: '', accountId: '' });

  useEffect(() => { load(); }, []);

  async function load() {
    setTrees(unwrap(await financeApi.listTrees()));
  }

  async function openTree(t: any) {
    setSelected(t);
    setStructure((await financeApi.getTreeStructure(t.id)).data?.data ?? (await financeApi.getTreeStructure(t.id)).data);
  }

  async function refreshStructure() {
    if (selected) {
      const res = await financeApi.getTreeStructure(selected.id);
      setStructure(res.data?.data ?? res.data);
    }
  }

  async function handleCreateTree(e: React.FormEvent) {
    e.preventDefault();
    await financeApi.createTree(treeForm);
    setShowTreeForm(false);
    setTreeForm({ code: '', name: '', description: '' });
    load();
  }

  async function handleAddNode(e: React.FormEvent) {
    e.preventDefault();
    await financeApi.addTreeNode(selected.id, {
      label: nodeForm.label,
      accountId: nodeForm.accountId || undefined,
      parentNodeId: nodeParent?.id || undefined,
    });
    setNodeForm({ label: '', accountId: '' });
    setNodeParent(null);
    refreshStructure();
  }

  async function handleDeleteNode(id: string) {
    await financeApi.deleteTreeNode(id);
    refreshStructure();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Account Hierarchy Trees</h2>
        <button onClick={() => setShowTreeForm(!showTreeForm)} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700">+ Tree</button>
      </div>

      {showTreeForm && (
        <form onSubmit={handleCreateTree} className="border rounded-lg p-4 bg-gray-50 grid grid-cols-3 gap-3">
          <input required value={treeForm.code} onChange={(e) => setTreeForm({ ...treeForm, code: e.target.value })} placeholder="Code (STAT)" className="border rounded px-2 py-1 text-sm" />
          <input required value={treeForm.name} onChange={(e) => setTreeForm({ ...treeForm, name: e.target.value })} placeholder="Name" className="border rounded px-2 py-1 text-sm" />
          <input value={treeForm.description} onChange={(e) => setTreeForm({ ...treeForm, description: e.target.value })} placeholder="Description" className="border rounded px-2 py-1 text-sm" />
          <div className="col-span-3 flex justify-end gap-2">
            <button type="button" onClick={() => setShowTreeForm(false)} className="border rounded px-3 py-1 text-sm">Cancel</button>
            <button type="submit" className="bg-indigo-600 text-white px-3 py-1 rounded text-sm">Create</button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="border rounded-lg divide-y">
          {trees.length === 0 ? <p className="p-3 text-gray-400 text-sm">No trees.</p> : trees.map((t) => (
            <div key={t.id} className={`p-2 flex justify-between items-center cursor-pointer hover:bg-gray-50 ${selected?.id === t.id ? 'bg-indigo-50' : ''}`} onClick={() => openTree(t)}>
              <div><span className="font-mono text-xs">{t.code}</span> <span className="text-sm">{t.name}</span></div>
              <button onClick={async (e) => { e.stopPropagation(); if (confirm('Delete tree?')) { await financeApi.deleteTree(t.id); if (selected?.id === t.id) { setSelected(null); setStructure(null); } load(); } }} className="text-red-400 text-xs">Del</button>
            </div>
          ))}
        </div>

        <div className="col-span-2 border rounded-lg p-3">
          {structure ? (
            <>
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-medium text-sm">{structure.tree?.name}</h3>
                <button onClick={() => setNodeParent({ id: null, label: '(root)' })} className="text-xs text-indigo-600">+ root node</button>
              </div>
              {nodeParent !== null && (
                <form onSubmit={handleAddNode} className="flex gap-2 mb-3 bg-gray-50 p-2 rounded">
                  <span className="text-xs text-gray-500 self-center">under {nodeParent.label}:</span>
                  <input required value={nodeForm.label} onChange={(e) => setNodeForm({ ...nodeForm, label: e.target.value })} placeholder="label" className="border rounded px-2 py-1 text-sm flex-1" />
                  <input value={nodeForm.accountId} onChange={(e) => setNodeForm({ ...nodeForm, accountId: e.target.value })} placeholder="accountId (leaf, optional)" className="border rounded px-2 py-1 text-xs font-mono w-48" />
                  <button type="submit" className="bg-indigo-600 text-white px-2 py-1 rounded text-sm">Add</button>
                  <button type="button" onClick={() => setNodeParent(null)} className="text-xs text-gray-400">cancel</button>
                </form>
              )}
              {structure.roots?.length === 0 ? <p className="text-gray-400 text-sm">No nodes yet.</p> : structure.roots.map((n: any) => (
                <TreeNode key={n.id} node={n} onAddChild={(p: any) => setNodeParent(p)} onDelete={handleDeleteNode} />
              ))}
            </>
          ) : <p className="text-gray-400 text-sm">Select a tree to view its hierarchy.</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Cross-Validation Tab ────────────────────────────────────────────

function CrossValidationTab() {
  const [rules, setRules] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '', description: '',
    conditionPosition: 1, conditionOperator: 'eq', conditionValue: '',
    targetPosition: 3, targetOperator: 'range', targetValueFrom: '', targetValueTo: '', targetValueSingle: '',
    errorMessage: '',
  });
  const [testCode, setTestCode] = useState('');
  const [testResult, setTestResult] = useState<any[] | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setRules(unwrap(await financeApi.listCrossValidationRules()));
  }

  function buildValue(op: string, single: string, from: string, to: string): any {
    if (op === 'range') return { from, to };
    if (op === 'in') return single.split(',').map((s) => s.trim());
    return single;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await financeApi.createCrossValidationRule({
      name: form.name,
      description: form.description || undefined,
      conditionPosition: Number(form.conditionPosition),
      conditionOperator: form.conditionOperator,
      conditionValue: buildValue(form.conditionOperator, form.conditionValue, '', ''),
      targetPosition: Number(form.targetPosition),
      targetOperator: form.targetOperator,
      targetValue: buildValue(form.targetOperator, form.targetValueSingle, form.targetValueFrom, form.targetValueTo),
      errorMessage: form.errorMessage || undefined,
    });
    setShowForm(false);
    load();
  }

  async function handleTest() {
    setTestResult(unwrap(await financeApi.validateCombination(testCode)));
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Cross-Validation Rules</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700">+ Rule</button>
      </div>
      <p className="text-xs text-gray-500">Rules fire (and block the journal entry) when BOTH the condition segment and the target segment match.</p>

      {showForm && (
        <form onSubmit={handleCreate} className="border rounded-lg p-4 bg-gray-50 space-y-3">
          <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Rule name" className="w-full border rounded px-2 py-1 text-sm" />
          <div className="grid grid-cols-3 gap-2 items-end">
            <div><label className="text-xs text-gray-500">When segment position</label><input type="number" value={form.conditionPosition} onChange={(e) => setForm({ ...form, conditionPosition: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
            <div><label className="text-xs text-gray-500">operator</label><select value={form.conditionOperator} onChange={(e) => setForm({ ...form, conditionOperator: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">{OPERATORS.filter(o => o.value !== 'range').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
            <div><label className="text-xs text-gray-500">value{form.conditionOperator === 'in' ? ' (comma-sep)' : ''}</label><input required value={form.conditionValue} onChange={(e) => setForm({ ...form, conditionValue: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
          </div>
          <div className="grid grid-cols-4 gap-2 items-end">
            <div><label className="text-xs text-gray-500">then segment pos</label><input type="number" value={form.targetPosition} onChange={(e) => setForm({ ...form, targetPosition: Number(e.target.value) })} className="w-full border rounded px-2 py-1 text-sm" /></div>
            <div><label className="text-xs text-gray-500">operator</label><select value={form.targetOperator} onChange={(e) => setForm({ ...form, targetOperator: e.target.value })} className="w-full border rounded px-2 py-1 text-sm">{OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
            {form.targetOperator === 'range' ? (
              <>
                <div><label className="text-xs text-gray-500">from</label><input value={form.targetValueFrom} onChange={(e) => setForm({ ...form, targetValueFrom: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
                <div><label className="text-xs text-gray-500">to</label><input value={form.targetValueTo} onChange={(e) => setForm({ ...form, targetValueTo: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
              </>
            ) : (
              <div className="col-span-2"><label className="text-xs text-gray-500">value{form.targetOperator === 'in' ? ' (comma-sep)' : ''}</label><input value={form.targetValueSingle} onChange={(e) => setForm({ ...form, targetValueSingle: e.target.value })} className="w-full border rounded px-2 py-1 text-sm" /></div>
            )}
          </div>
          <span className="text-xs text-gray-400">→ DISALLOW</span>
          <input value={form.errorMessage} onChange={(e) => setForm({ ...form, errorMessage: e.target.value })} placeholder="Custom error message (optional)" className="w-full border rounded px-2 py-1 text-sm" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="border rounded px-3 py-1 text-sm">Cancel</button>
            <button type="submit" className="bg-indigo-600 text-white px-3 py-1 rounded text-sm">Create</button>
          </div>
        </form>
      )}

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Condition</th><th className="px-3 py-2 text-left">Target</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2" /></tr></thead>
          <tbody className="divide-y">
            {rules.length === 0 ? <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">No cross-validation rules.</td></tr> : rules.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium">{r.name}</td>
                <td className="px-3 py-2 text-xs font-mono">seg{r.conditionPosition} {r.conditionOperator} {JSON.stringify(r.conditionValue)}</td>
                <td className="px-3 py-2 text-xs font-mono">seg{r.targetPosition} {r.targetOperator} {JSON.stringify(r.targetValue)}</td>
                <td className="px-3 py-2"><span className={`text-xs px-1.5 py-0.5 rounded ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>{r.isActive ? 'Active' : 'Inactive'}</span></td>
                <td className="px-3 py-2"><button onClick={async () => { if (confirm('Delete?')) { await financeApi.deleteCrossValidationRule(r.id); load(); } }} className="text-red-500 text-xs hover:underline">Del</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t pt-3">
        <p className="text-xs font-medium text-gray-600 mb-2">Test an account code against cross-validation rules</p>
        <div className="flex gap-2">
          <input value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="01-200-9500-PROD" className="border rounded px-2 py-1 text-sm font-mono w-64" />
          <button onClick={handleTest} className="bg-gray-200 px-3 py-1 rounded text-sm">Test</button>
        </div>
        {testResult !== null && (
          <div className="mt-2 text-sm">
            {testResult.length === 0 ? <span className="text-green-600">✓ No violations</span> : (
              <ul className="text-red-600 list-disc ml-5">{testResult.map((v, i) => <li key={i}>{v.message}</li>)}</ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const TABS = ['Segments', 'Trees', 'Cross-Validation'];

export default function CoaStructurePage() {
  const [tab, setTab] = useState('Segments');
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Chart of Accounts Structure</h1>
        <p className="text-gray-500 text-sm mt-1">
          Oracle-style segmented COA — configurable Key Flexfield segments with value sets,
          hierarchy trees for reporting roll-ups, and cross-validation rules enforced at journal entry.
        </p>
      </div>
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t}</button>
        ))}
      </div>
      {tab === 'Segments' && <SegmentsTab />}
      {tab === 'Trees' && <TreesTab />}
      {tab === 'Cross-Validation' && <CrossValidationTab />}
    </div>
  );
}
