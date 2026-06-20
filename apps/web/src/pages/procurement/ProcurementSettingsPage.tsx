import React, { useState, useEffect, useCallback } from 'react';
import { procurementApi } from '../../api/procurement';
import {
  Settings, Shield, Plus, Trash2, Edit2, Check, X, AlertTriangle,
} from 'lucide-react';

type DoaTab = 'workflow' | 'doa';

const DOC_TYPES = ['PR', 'PO'];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
      >
        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${checked ? 'left-5' : 'left-0.5'}`} />
      </div>
      <span className="text-sm">{label}</span>
    </label>
  );
}

export const ProcurementSettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DoaTab>('workflow');
  const [config, setConfig] = useState<any>(null);
  const [doaRules, setDoaRules] = useState<any[]>([]);
  const [doaFilter, setDoaFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [showDoaModal, setShowDoaModal] = useState(false);
  const [editingRule, setEditingRule] = useState<any>(null);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [doaForm, setDoaForm] = useState({
    documentType: 'PO',
    level: 1,
    amountFrom: 0,
    amountTo: '',
    approverRole: '',
    approverName: '',
    approverUserId: '',
  });

  const loadConfig = useCallback(async () => {
    try {
      const res = await procurementApi.getWorkflowConfig();
      setConfig(res.data?.data ?? res.data);
    } catch {}
  }, []);

  const loadDoaRules = useCallback(async (docType?: string) => {
    try {
      const res = await procurementApi.getDoaRules(docType ? { documentType: docType } : {});
      const data = res.data?.data ?? res.data ?? [];
      setDoaRules(Array.isArray(data) ? data : []);
    } catch {}
  }, []);

  useEffect(() => {
    loadConfig();
    loadDoaRules();
  }, [loadConfig, loadDoaRules]);

  const handleSaveConfig = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await procurementApi.updateWorkflowConfig(config);
      setConfig(res.data?.data ?? res.data);
      setSaveMsg('Workflow configuration saved.');
      setTimeout(() => setSaveMsg(null), 3000);
    } catch { setSaveMsg('Save failed.'); }
    setSaving(false);
  };

  const handleDeleteRule = async (id: string) => {
    await procurementApi.deleteDoaRule(id);
    loadDoaRules(doaFilter || undefined);
  };

  const handleDoaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...doaForm,
      level: Number(doaForm.level),
      amountFrom: Number(doaForm.amountFrom),
      amountTo: doaForm.amountTo === '' ? null : Number(doaForm.amountTo),
    };
    if (editingRule) {
      await procurementApi.updateDoaRule(editingRule.id, payload);
    } else {
      await procurementApi.createDoaRule(payload);
    }
    setShowDoaModal(false);
    setEditingRule(null);
    loadDoaRules(doaFilter || undefined);
  };

  const openEditRule = (rule: any) => {
    setEditingRule(rule);
    setDoaForm({
      documentType: rule.documentType,
      level: rule.level,
      amountFrom: rule.amountFrom,
      amountTo: rule.amountTo == null ? '' : String(rule.amountTo),
      approverRole: rule.approverRole,
      approverName: rule.approverName,
      approverUserId: rule.approverUserId ?? '',
    });
    setShowDoaModal(true);
  };

  const openNewRule = () => {
    setEditingRule(null);
    setDoaForm({ documentType: 'PO', level: 1, amountFrom: 0, amountTo: '', approverRole: '', approverName: '', approverUserId: '' });
    setShowDoaModal(true);
  };

  const cfg = (key: string) => config?.[key];
  const setCfg = (key: string, val: any) => setConfig((p: any) => ({ ...p, [key]: val }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Procurement Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure workflow steps and delegation of authority</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b gap-1">
        {[
          { key: 'workflow' as DoaTab, label: 'Workflow Configuration', icon: <Settings className="h-4 w-4" /> },
          { key: 'doa' as DoaTab, label: 'Delegation of Authority', icon: <Shield className="h-4 w-4" /> },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── WORKFLOW CONFIG ──────────────────────────────────────────── */}
      {activeTab === 'workflow' && config && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* PR Settings */}
            <div className="bg-white rounded-lg border p-5 space-y-4">
              <h2 className="font-semibold text-gray-800">Purchase Requisition (PR)</h2>
              <Toggle checked={!!cfg('requirePrApproval')} onChange={v => setCfg('requirePrApproval', v)} label="Require PR Approval" />
              {cfg('requirePrApproval') && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Approval Threshold (amount above which approval required)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">₹</span>
                    <input
                      type="number" min="0" value={cfg('prApprovalThreshold') ?? 0}
                      onChange={e => setCfg('prApprovalThreshold', Number(e.target.value))}
                      className="border rounded px-3 py-1.5 text-sm w-40"
                    />
                    <span className="text-xs text-gray-400">(0 = all PRs need approval)</span>
                  </div>
                </div>
              )}
            </div>

            {/* RFQ Settings */}
            <div className="bg-white rounded-lg border p-5 space-y-4">
              <h2 className="font-semibold text-gray-800">RFQ (Request for Quotation)</h2>
              <Toggle checked={!!cfg('requireRfqStep')} onChange={v => setCfg('requireRfqStep', v)} label="Require RFQ before PO creation" />
              {cfg('requireRfqStep') && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">RFQ Required Above Amount</label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">₹</span>
                    <input
                      type="number" min="0" value={cfg('rfqThreshold') ?? 0}
                      onChange={e => setCfg('rfqThreshold', Number(e.target.value))}
                      className="border rounded px-3 py-1.5 text-sm w-40"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* PO Settings */}
            <div className="bg-white rounded-lg border p-5 space-y-4">
              <h2 className="font-semibold text-gray-800">Purchase Order (PO)</h2>
              <Toggle checked={!!cfg('requirePoApproval')} onChange={v => setCfg('requirePoApproval', v)} label="Require PO Approval" />
              {cfg('requirePoApproval') && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">PO Approval Threshold</label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">₹</span>
                    <input
                      type="number" min="0" value={cfg('poApprovalThreshold') ?? 0}
                      onChange={e => setCfg('poApprovalThreshold', Number(e.target.value))}
                      className="border rounded px-3 py-1.5 text-sm w-40"
                    />
                    <span className="text-xs text-gray-400">(0 = all POs need approval)</span>
                  </div>
                </div>
              )}
              <Toggle checked={!!cfg('requirePoRelease')} onChange={v => setCfg('requirePoRelease', v)} label="Require PO Release step (explicit release to vendor)" />
            </div>

            {/* Receipt & Matching */}
            <div className="bg-white rounded-lg border p-5 space-y-4">
              <h2 className="font-semibold text-gray-800">Receipt & Invoice Matching</h2>
              <Toggle checked={!!cfg('allowPartialGrn')} onChange={v => setCfg('allowPartialGrn', v)} label="Allow Partial GRN (partial goods receipt)" />
              <Toggle checked={!!cfg('requireThreeWayMatch')} onChange={v => setCfg('requireThreeWayMatch', v)} label="Require 3-Way Match before invoice approval" />
              <Toggle checked={!!cfg('autoClosePoOnFullReceipt')} onChange={v => setCfg('autoClosePoOnFullReceipt', v)} label="Auto-close PO on full receipt" />
            </div>
          </div>

          {/* Workflow Flow Diagram */}
          <div className="bg-white rounded-lg border p-5">
            <h2 className="font-semibold text-gray-800 mb-4">Active Workflow Flow</h2>
            <div className="flex items-center gap-2 flex-wrap text-sm">
              {[
                { label: 'PR', always: true },
                { label: 'PR Approval', enabled: cfg('requirePrApproval') },
                { label: 'RFQ', enabled: cfg('requireRfqStep') },
                { label: 'PO Creation', always: true },
                { label: 'PO Approval', enabled: cfg('requirePoApproval') },
                { label: 'PO Release', enabled: cfg('requirePoRelease') },
                { label: 'Material Delivery (GRN)', always: true },
                { label: 'Invoice Booking', always: true },
                { label: '3-Way Match', enabled: cfg('requireThreeWayMatch') },
                { label: 'Invoice Payment', always: true },
                { label: 'PO Close', always: true },
              ].map((step, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="text-gray-300">→</span>}
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    step.always ? 'bg-blue-100 text-blue-800'
                    : step.enabled ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-400 line-through'
                  }`}>
                    {step.label}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>

          {saveMsg && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded p-3">
              <Check className="h-4 w-4" /> {saveMsg}
            </div>
          )}

          <div className="flex justify-end">
            <button onClick={handleSaveConfig} disabled={saving} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50">
              {saving ? 'Saving…' : 'Save Configuration'}
            </button>
          </div>
        </div>
      )}

      {/* ── DELEGATION OF AUTHORITY ──────────────────────────────────── */}
      {activeTab === 'doa' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
            <strong>Delegation of Authority (DoA)</strong> defines who must approve PRs and POs based on amount ranges.
            Higher amounts can require multiple levels of approval. Rules are evaluated by amount bracket.
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <select
                value={doaFilter}
                onChange={e => { setDoaFilter(e.target.value); loadDoaRules(e.target.value || undefined); }}
                className="border rounded px-3 py-1.5 text-sm"
              >
                <option value="">All Document Types</option>
                {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button onClick={openNewRule} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              <Plus className="h-3.5 w-3.5" /> Add Rule
            </button>
          </div>

          {['PR', 'PO'].map(docType => {
            const rules = doaRules.filter(r => r.documentType === docType || !doaFilter || doaFilter === docType);
            const filtered = doaFilter && doaFilter !== docType ? [] : rules.filter(r => r.documentType === docType);
            if (doaFilter && doaFilter !== docType) return null;
            return (
              <div key={docType} className="bg-white rounded-lg border">
                <div className="p-4 border-b flex items-center gap-2">
                  <Shield className="h-4 w-4 text-purple-600" />
                  <h3 className="font-semibold">{docType} Approval Rules</h3>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 text-xs">
                    <tr>
                      <th className="px-4 py-2 text-left">Level</th>
                      <th className="px-4 py-2 text-left">Amount Range</th>
                      <th className="px-4 py-2 text-left">Approver Role</th>
                      <th className="px-4 py-2 text-left">Approver Name</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.sort((a: any, b: any) => a.level - b.level || a.amountFrom - b.amountFrom).map((r: any) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3"><span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-xs font-medium">L{r.level}</span></td>
                        <td className="px-4 py-3 font-mono text-xs">
                          ₹{Number(r.amountFrom).toLocaleString()} — {r.amountTo == null ? '∞' : `₹${Number(r.amountTo).toLocaleString()}`}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{r.approverRole}</td>
                        <td className="px-4 py-3 font-medium">{r.approverName}</td>
                        <td className="px-4 py-3">
                          {r.isActive ? <span className="text-green-600 text-xs font-medium">Active</span> : <span className="text-gray-400 text-xs">Inactive</span>}
                        </td>
                        <td className="px-4 py-3 flex gap-2">
                          <button onClick={() => openEditRule(r)} className="text-blue-600 hover:underline text-xs flex items-center gap-1"><Edit2 className="h-3 w-3" /> Edit</button>
                          <button onClick={() => handleDeleteRule(r.id)} className="text-red-500 hover:underline text-xs flex items-center gap-1"><Trash2 className="h-3 w-3" /> Remove</button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No {docType} rules defined</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}

      {/* DoA Modal */}
      {showDoaModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">{editingRule ? 'Edit' : 'New'} Approval Rule</h3>
            <form onSubmit={handleDoaSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Document Type</label>
                  <select value={doaForm.documentType} onChange={e => setDoaForm(p => ({ ...p, documentType: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm">
                    {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Approval Level</label>
                  <input type="number" min="1" value={doaForm.level} onChange={e => setDoaForm(p => ({ ...p, level: Number(e.target.value) }))} className="w-full border rounded px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Amount From (₹)</label>
                  <input type="number" min="0" value={doaForm.amountFrom} onChange={e => setDoaForm(p => ({ ...p, amountFrom: Number(e.target.value) }))} className="w-full border rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Amount To (₹, blank=∞)</label>
                  <input type="number" min="0" value={doaForm.amountTo} onChange={e => setDoaForm(p => ({ ...p, amountTo: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" placeholder="Unlimited" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Approver Role</label>
                <input value={doaForm.approverRole} onChange={e => setDoaForm(p => ({ ...p, approverRole: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. Department Manager" required />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Approver Name / Title</label>
                <input value={doaForm.approverName} onChange={e => setDoaForm(p => ({ ...p, approverName: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. Head of Finance" required />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Approver User ID (optional)</label>
                <input value={doaForm.approverUserId} onChange={e => setDoaForm(p => ({ ...p, approverUserId: e.target.value }))} className="w-full border rounded px-3 py-2 text-sm font-mono" placeholder="UUID of user" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => { setShowDoaModal(false); setEditingRule(null); }} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Save Rule</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
