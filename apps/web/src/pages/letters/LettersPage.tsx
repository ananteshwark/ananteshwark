import { useState, useEffect } from 'react';
import { Plus, X, FileText, Eye, Stamp, Undo2, Wand2 } from 'lucide-react';
import { lettersApi } from '../../api/letters';
import { hrApi } from '../../api/hr';

const LETTER_TYPES = ['OFFER', 'APPOINTMENT', 'CONFIRMATION', 'INCREMENT', 'PROMOTION', 'TRANSFER', 'RELIEVING', 'EXPERIENCE', 'ADDRESS_PROOF', 'WARNING', 'CUSTOM'];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  ISSUED: 'bg-green-100 text-green-700',
  REVOKED: 'bg-red-100 text-red-700',
};

function TemplateModal({ editing, onClose, onDone }: { editing?: any; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({
    code: editing?.code ?? '', name: editing?.name ?? '', type: editing?.type ?? 'CUSTOM',
    subject: editing?.subject ?? '', body: editing?.body ?? '', isActive: editing?.isActive ?? true,
  });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      if (editing) await lettersApi.updateTemplate(editing.id, form);
      else await lettersApi.createTemplate(form);
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not save template');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{editing ? 'Edit Template' : 'New Letter Template'}</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Code (e.g. CONF)"
              value={form.code} disabled={!!editing}
              onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
            <input className="border rounded-lg px-3 py-2 text-sm col-span-2" placeholder="Template name"
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          </div>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.type}
            onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
            {LETTER_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
          </select>
          <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Subject — supports {{placeholders}}"
            value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value }))} />
          <textarea className="w-full border rounded-lg px-3 py-2 text-sm font-mono" rows={10}
            placeholder={'Dear {{firstName}},\n\nWe are pleased to confirm…\n\nAvailable: {{employeeName}} {{employeeCode}} {{email}} {{dateOfJoining}} {{today}} + any custom field you pass at generation time.'}
            value={form.body} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} />
            Active
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={save} disabled={saving || !form.code.trim() || !form.name.trim() || !form.body.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Template'}
          </button>
        </div>
      </div>
    </div>
  );
}

function GenerateModal({ templates, onClose, onDone }: { templates: any[]; onClose: () => void; onDone: () => void }) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '');
  const [employeeId, setEmployeeId] = useState('');
  const [customJson, setCustomJson] = useState('{}');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    hrApi.getEmployees({ page: 1, limit: 200 }).then((r: any) =>
      setEmployees(r.data?.items || r.data?.data || []));
  }, []);

  const generate = async () => {
    let data: Record<string, any> = {};
    try { data = JSON.parse(customJson || '{}'); } catch { alert('Custom data must be valid JSON'); return; }
    setSaving(true);
    try {
      await lettersApi.generate({ templateId, employeeId, data });
      onDone();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Could not generate letter');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Generate Letter</h2>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={templateId}
            onChange={e => setTemplateId(e.target.value)}>
            {templates.filter(t => t.isActive).map(t => <option key={t.id} value={t.id}>{t.name} ({t.code})</option>)}
          </select>
          <select className="w-full border rounded-lg px-3 py-2 text-sm" value={employeeId}
            onChange={e => setEmployeeId(e.target.value)}>
            <option value="">Select employee…</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</option>)}
          </select>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Custom fields (JSON) — override or add placeholders</label>
            <textarea rows={3} className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
              value={customJson} onChange={e => setCustomJson(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancel</button>
          <button onClick={generate} disabled={saving || !templateId || !employeeId}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            {saving ? 'Generating…' : 'Generate Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LetterViewer({ letter, onClose }: { letter: any; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="font-mono text-xs text-gray-400">{letter.letterNumber}</p>
            <h2 className="text-lg font-semibold">{letter.renderedSubject}</h2>
          </div>
          <button onClick={onClose}><X className="h-4 w-4 text-gray-400" /></button>
        </div>
        <div className="border rounded-lg p-6 bg-gray-50 whitespace-pre-wrap text-sm leading-relaxed">
          {letter.renderedBody}
        </div>
        {letter.issuedAt && (
          <p className="text-xs text-gray-400 mt-2">Issued {new Date(letter.issuedAt).toLocaleString()}</p>
        )}
      </div>
    </div>
  );
}

export default function LettersPage() {
  const [tab, setTab] = useState<'issued' | 'templates'>('issued');
  const [templates, setTemplates] = useState<any[]>([]);
  const [issued, setIssued] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplate, setShowTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [viewing, setViewing] = useState<any>(null);

  const load = () => {
    setLoading(true);
    Promise.all([lettersApi.getTemplates(), lettersApi.getIssued()])
      .then(([t, i]) => { setTemplates(t.data || []); setIssued(i.data || []); })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const act = async (fn: () => Promise<any>) => {
    try { await fn(); load(); } catch (e: any) { alert(e?.response?.data?.message || 'Action failed'); }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-6 w-6 text-blue-600" /> HR Letters
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Offer, confirmation, relieving and other letters from templates</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowGenerate(true)} disabled={!templates.some(t => t.isActive)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
            <Wand2 className="h-4 w-4" /> Generate Letter
          </button>
          <button onClick={() => { setEditingTemplate(null); setShowTemplate(true); }}
            className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
            <Plus className="h-4 w-4" /> New Template
          </button>
        </div>
      </div>

      <div className="flex rounded-lg border overflow-hidden text-sm w-fit">
        <button onClick={() => setTab('issued')}
          className={`px-4 py-1.5 ${tab === 'issued' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}>Issued Letters</button>
        <button onClick={() => setTab('templates')}
          className={`px-4 py-1.5 ${tab === 'templates' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}`}>Templates</button>
      </div>

      <div className="bg-white rounded-xl border">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : tab === 'templates' ? (
          templates.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No templates yet — create one to get started.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Code', 'Name', 'Type', 'Active', ''].map(h => (
                    <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {templates.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{t.code}</td>
                    <td className="px-4 py-2 font-medium">{t.name}</td>
                    <td className="px-4 py-2 text-gray-500">{t.type.replace('_', ' ')}</td>
                    <td className="px-4 py-2">{t.isActive ? '✓' : '—'}</td>
                    <td className="px-4 py-2">
                      <button onClick={() => { setEditingTemplate(t); setShowTemplate(true); }}
                        className="text-blue-600 hover:underline text-xs">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : issued.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No letters generated yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Number', 'Employee', 'Template', 'Type', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-xs text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {issued.map(l => (
                <tr key={l.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{l.letterNumber}</td>
                  <td className="px-4 py-2 font-medium">{l.employeeName}</td>
                  <td className="px-4 py-2 text-gray-500">{l.templateName}</td>
                  <td className="px-4 py-2 text-gray-500">{l.letterType?.replace('_', ' ')}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[l.status]}`}>{l.status}</span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => setViewing(l)} className="text-gray-500 hover:text-gray-700 p-1" title="View">
                        <Eye className="h-4 w-4" />
                      </button>
                      {l.status === 'DRAFT' && (
                        <button onClick={() => act(() => lettersApi.issue(l.id))}
                          className="text-green-600 hover:text-green-800 p-1" title="Issue">
                          <Stamp className="h-4 w-4" />
                        </button>
                      )}
                      {l.status === 'ISSUED' && (
                        <button onClick={() => { if (confirm('Revoke this letter?')) act(() => lettersApi.revoke(l.id)); }}
                          className="text-red-500 hover:text-red-700 p-1" title="Revoke">
                          <Undo2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showTemplate && (
        <TemplateModal editing={editingTemplate} onClose={() => setShowTemplate(false)}
          onDone={() => { setShowTemplate(false); load(); }} />
      )}
      {showGenerate && (
        <GenerateModal templates={templates} onClose={() => setShowGenerate(false)}
          onDone={() => { setShowGenerate(false); setTab('issued'); load(); }} />
      )}
      {viewing && <LetterViewer letter={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
