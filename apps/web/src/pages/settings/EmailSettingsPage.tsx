import { useState, useEffect } from 'react';
import { Mail, Save, Send, FileText, List } from 'lucide-react';
import { emailApi } from '../../api/email';

type Tab = 'smtp' | 'templates' | 'logs';

interface SmtpForm {
  host: string;
  port: string;
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  isActive: boolean;
}

interface Template {
  id: string | null;
  code: string;
  subject: string;
  body: string;
  isActive: boolean;
  isDefault?: boolean;
}

interface EmailLog {
  id: string;
  templateCode: string;
  toEmail: string;
  subject: string;
  status: string;
  errorMessage?: string | null;
  sentAt: string;
}

const emptySmtp: SmtpForm = {
  host: '',
  port: '587',
  username: '',
  password: '',
  fromEmail: '',
  fromName: '',
  isActive: true,
};

export default function EmailSettingsPage() {
  const [tab, setTab] = useState<Tab>('smtp');

  return (
    <div className="p-6">
      <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900 mb-6">
        <Mail className="w-6 h-6" /> Email Settings
      </h1>

      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {([
          ['smtp', 'SMTP', <Save className="w-4 h-4" key="s" />],
          ['templates', 'Templates', <FileText className="w-4 h-4" key="t" />],
          ['logs', 'Logs', <List className="w-4 h-4" key="l" />],
        ] as [Tab, string, JSX.Element][]).map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {tab === 'smtp' && <SmtpTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'logs' && <LogsTab />}
    </div>
  );
}

function SmtpTab() {
  const [form, setForm] = useState<SmtpForm>(emptySmtp);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await emailApi.getSmtpConfig();
        const cfg = res.data?.data ?? res.data;
        if (cfg) {
          setForm({
            host: cfg.host ?? '',
            port: String(cfg.port ?? 587),
            username: cfg.username ?? '',
            password: cfg.password ?? '',
            fromEmail: cfg.fromEmail ?? '',
            fromName: cfg.fromName ?? '',
            isActive: cfg.isActive ?? true,
          });
        }
      } catch {
        // no config yet
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await emailApi.saveSmtpConfig({ ...form, port: parseInt(form.port, 10) || 587 });
      setMessage('SMTP configuration saved.');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to save SMTP config');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await emailApi.testSmtp(testTo || undefined);
      const data = res.data?.data ?? res.data;
      if (data?.success) setMessage('SMTP test succeeded.');
      else setError(data?.error ?? 'SMTP test failed');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'SMTP test failed');
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;

  const inputCls =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <form onSubmit={handleSave} className="space-y-4">
      {message && <p className="text-sm text-green-600">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Host</label>
          <input className={inputCls} value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="smtp.example.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Port</label>
          <input className={inputCls} type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
          <input className={inputCls} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input className={inputCls} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From Email</label>
          <input className={inputCls} value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} placeholder="noreply@example.com" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">From Name</label>
          <input className={inputCls} value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
        Active
      </label>

      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <div className="border-t border-gray-200 pt-4 mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Send test email to</label>
        <div className="flex items-center gap-2">
          <input className={inputCls} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
          <button type="button" onClick={handleTest} disabled={testing} className="flex items-center gap-2 shrink-0 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
            <Send className="w-4 h-4" /> {testing ? 'Testing...' : 'Test'}
          </button>
        </div>
      </div>
    </form>
  );
}

function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await emailApi.listTemplates();
      const list: Template[] = res.data?.data ?? res.data ?? [];
      setTemplates(list);
      setSelected((prev) => (prev ? list.find((t) => t.code === prev.code) ?? list[0] ?? null : list[0] ?? null));
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      if (selected.id) {
        await emailApi.updateTemplate(selected.id, {
          code: selected.code,
          subject: selected.subject,
          body: selected.body,
          isActive: selected.isActive,
        });
      } else {
        await emailApi.saveTemplate({
          code: selected.code,
          subject: selected.subject,
          body: selected.body,
          isActive: selected.isActive,
        });
      }
      setMessage('Template saved.');
      await load();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to save template');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-gray-500">Loading...</p>;

  const inputCls =
    'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="flex gap-6">
      <div className="w-56 shrink-0">
        <ul className="space-y-1">
          {templates.map((t) => (
            <li key={t.code}>
              <button
                onClick={() => { setSelected(t); setMessage(null); setError(null); }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                  selected?.code === t.code ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {t.code}
                {t.isDefault && <span className="ml-1 text-xs text-gray-400">(default)</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex-1">
        {message && <p className="mb-2 text-sm text-green-600">{message}</p>}
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {selected ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input className={inputCls} value={selected.subject} onChange={(e) => setSelected({ ...selected, subject: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Body</label>
              <textarea
                className={`${inputCls} font-mono`}
                rows={10}
                value={selected.body}
                onChange={(e) => setSelected({ ...selected, body: e.target.value })}
              />
              <p className="mt-1 text-xs text-gray-400">Use {'{{variableName}}'} placeholders.</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={selected.isActive} onChange={(e) => setSelected({ ...selected, isActive: e.target.checked })} />
              Active
            </label>
            <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        ) : (
          <p className="text-gray-400">No templates.</p>
        )}
      </div>
    </div>
  );
}

function LogsTab() {
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await emailApi.getLogs(100);
        setLogs(res.data?.data ?? res.data ?? []);
      } catch (err: any) {
        setError(err?.response?.data?.message ?? 'Failed to load logs');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-gray-500">Loading...</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent At</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">To</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {logs.length === 0 && (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No email logs</td></tr>
          )}
          {logs.map((log) => (
            <tr key={log.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-sm text-gray-500">{new Date(log.sentAt).toLocaleString()}</td>
              <td className="px-4 py-3 text-sm font-mono text-gray-700">{log.templateCode}</td>
              <td className="px-4 py-3 text-sm text-gray-700">{log.toEmail}</td>
              <td className="px-4 py-3 text-sm text-gray-700">{log.subject}</td>
              <td className="px-4 py-3">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${log.status === 'SENT' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`} title={log.errorMessage ?? ''}>
                  {log.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
