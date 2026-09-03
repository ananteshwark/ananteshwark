import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Key,
  Globe,
  Copy,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { ssoApi } from '../../api/sso';

const unwrapList = (res: any) => {
  const d = res.data?.data ?? res.data;
  return Array.isArray(d) ? d : d?.items ?? [];
};
const unwrap = (res: any) => res.data?.data ?? res.data;

const PROTOCOLS = ['OIDC', 'SAML', 'OAUTH2'];

const IDP_PRESETS: Record<string, Partial<{ issuerUrl: string; metadataUrl: string }>> = {
  'Azure AD': {
    issuerUrl: 'https://login.microsoftonline.com/{tenant-id}/v2.0',
    metadataUrl: 'https://login.microsoftonline.com/{tenant-id}/v2.0/.well-known/openid-configuration',
  },
  Okta: {
    issuerUrl: 'https://{your-domain}.okta.com/oauth2/default',
    metadataUrl: 'https://{your-domain}.okta.com/oauth2/default/.well-known/openid-configuration',
  },
  'Google Workspace': {
    issuerUrl: 'https://accounts.google.com',
    metadataUrl: 'https://accounts.google.com/.well-known/openid-configuration',
  },
};

const PROTOCOL_BADGE: Record<string, string> = {
  OIDC: 'bg-blue-100 text-blue-700',
  SAML: 'bg-purple-100 text-purple-700',
  OAUTH2: 'bg-green-100 text-green-700',
};

const DEFAULT_ATTR_MAPPING = {
  email: 'email',
  firstName: 'given_name',
  lastName: 'family_name',
  department: 'department',
};

const emptyForm = () => ({
  name: '',
  protocol: 'OIDC',
  issuerUrl: '',
  metadataUrl: '',
  clientId: '',
  clientSecret: '',
  certificate: '',
  attributeMapping: JSON.stringify(DEFAULT_ATTR_MAPPING, null, 2),
});

export default function SsoSettingsPage() {
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [spMetadata, setSpMetadata] = useState<Record<string, string>>({});
  const [copiedMetadata, setCopiedMetadata] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await ssoApi.listProviders();
      setProviders(unwrapList(res));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setSelectedPreset('');
    setShowForm(true);
  };

  const openEdit = (p: any) => {
    setEditing(p);
    setForm({
      name: p.name,
      protocol: p.protocol,
      issuerUrl: p.issuerUrl ?? '',
      metadataUrl: p.metadataUrl ?? '',
      clientId: p.clientId ?? '',
      clientSecret: '',
      certificate: p.certificate ?? '',
      attributeMapping: JSON.stringify(p.attributeMapping ?? DEFAULT_ATTR_MAPPING, null, 2),
    });
    setSelectedPreset('');
    setShowForm(true);
  };

  const applyPreset = (preset: string) => {
    setSelectedPreset(preset);
    if (IDP_PRESETS[preset]) {
      setForm((prev) => ({
        ...prev,
        issuerUrl: IDP_PRESETS[preset].issuerUrl ?? prev.issuerUrl,
        metadataUrl: IDP_PRESETS[preset].metadataUrl ?? prev.metadataUrl,
        name: prev.name || preset,
      }));
    }
  };

  const save = async () => {
    if (!form.name || !form.protocol) return;
    setSaving(true);
    try {
      let attrMapping = DEFAULT_ATTR_MAPPING;
      try { attrMapping = JSON.parse(form.attributeMapping); } catch {}

      const payload = {
        name: form.name,
        protocol: form.protocol,
        issuerUrl: form.issuerUrl || undefined,
        metadataUrl: form.metadataUrl || undefined,
        clientId: form.clientId || undefined,
        clientSecret: form.clientSecret || undefined,
        certificate: form.certificate || undefined,
        attributeMapping: attrMapping,
      };

      if (editing) {
        await ssoApi.updateProvider(editing.id, payload);
      } else {
        await ssoApi.createProvider(payload);
      }
      setShowForm(false);
      setEditing(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: any) => {
    await ssoApi.updateProvider(p.id, { isActive: !p.isActive });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this SSO provider?')) return;
    await ssoApi.deleteProvider(id);
    load();
  };

  const loadMetadata = async (id: string) => {
    try {
      const res = await ssoApi.getSpMetadata(id);
      const xml = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      setSpMetadata((prev) => ({ ...prev, [id]: xml }));
    } catch {
      setSpMetadata((prev) => ({ ...prev, [id]: 'Failed to load SP metadata' }));
    }
  };

  const copyMetadata = (id: string) => {
    navigator.clipboard.writeText(spMetadata[id] ?? '').catch(() => {});
    setCopiedMetadata(id);
    setTimeout(() => setCopiedMetadata(null), 2000);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-indigo-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">SSO Configuration</h1>
            <p className="text-sm text-gray-500">Configure SAML/OIDC identity providers for single sign-on</p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
        >
          <Plus className="w-4 h-4" /> Add Provider
        </button>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
        <strong>Setup guide:</strong> Create a provider, copy the SP metadata XML to your IdP, then enable it.
        Users can sign in via <code className="font-mono text-xs bg-blue-100 px-1 rounded">/auth/sso/[provider-id]/initiate</code>.
        On first login, accounts are automatically provisioned (JIT provisioning).
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white border rounded-xl p-6 shadow-sm space-y-4">
          <h3 className="font-semibold text-gray-800">
            {editing ? 'Edit SSO Provider' : 'New SSO Provider'}
          </h3>

          {/* IdP presets */}
          {!editing && (
            <div>
              <label className="text-xs text-gray-500 mb-2 block">Quick start with a preset</label>
              <div className="flex gap-2">
                {Object.keys(IDP_PRESETS).map((preset) => (
                  <button
                    key={preset}
                    onClick={() => applyPreset(preset)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      selectedPreset === preset
                        ? 'bg-indigo-100 border-indigo-400 text-indigo-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-indigo-300'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Name *</label>
              <input
                className="border rounded-lg px-3 py-2 text-sm w-full"
                value={form.name}
                placeholder="Azure AD"
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Protocol *</label>
              <select
                className="border rounded-lg px-3 py-2 text-sm w-full"
                value={form.protocol}
                disabled={!!editing}
                onChange={(e) => setForm({ ...form, protocol: e.target.value })}
              >
                {PROTOCOLS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Issuer URL</label>
              <input
                className="border rounded-lg px-3 py-2 text-sm w-full font-mono"
                value={form.issuerUrl}
                placeholder="https://login.microsoftonline.com/..."
                onChange={(e) => setForm({ ...form, issuerUrl: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Metadata / Well-known URL</label>
              <input
                className="border rounded-lg px-3 py-2 text-sm w-full font-mono"
                value={form.metadataUrl}
                onChange={(e) => setForm({ ...form, metadataUrl: e.target.value })}
              />
            </div>
            {form.protocol !== 'SAML' && (
              <>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Client ID</label>
                  <input
                    className="border rounded-lg px-3 py-2 text-sm w-full font-mono"
                    value={form.clientId}
                    onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">Client Secret</label>
                  <input
                    type="password"
                    className="border rounded-lg px-3 py-2 text-sm w-full font-mono"
                    value={form.clientSecret}
                    placeholder={editing ? '(unchanged)' : ''}
                    onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                  />
                </div>
              </>
            )}
            {form.protocol === 'SAML' && (
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-1 block">IdP Certificate (PEM)</label>
                <textarea
                  className="border rounded-lg px-3 py-2 text-sm w-full font-mono"
                  rows={4}
                  value={form.certificate}
                  placeholder="-----BEGIN CERTIFICATE-----"
                  onChange={(e) => setForm({ ...form, certificate: e.target.value })}
                />
              </div>
            )}
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">
                Attribute Mapping (JSON)
              </label>
              <textarea
                className="border rounded-lg px-3 py-2 text-sm w-full font-mono"
                rows={5}
                value={form.attributeMapping}
                onChange={(e) => setForm({ ...form, attributeMapping: e.target.value })}
              />
              <p className="text-xs text-gray-400 mt-1">
                Maps ERP fields (email, firstName, lastName, department) to IdP claim names
              </p>
            </div>
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
              disabled={saving || !form.name}
              className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Provider list */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading…</div>
      ) : (
        <div className="space-y-3">
          {providers.map((p) => (
            <div key={p.id} className="bg-white border rounded-xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-5">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${p.isActive ? 'bg-green-50' : 'bg-gray-50'}`}>
                    {p.isActive
                      ? <CheckCircle2 className="w-5 h-5 text-green-500" />
                      : <XCircle className="w-5 h-5 text-gray-400" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">{p.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PROTOCOL_BADGE[p.protocol] ?? 'bg-gray-100 text-gray-600'}`}>
                        {p.protocol}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 font-mono mt-0.5">{p.issuerUrl}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleActive(p)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      p.isActive
                        ? 'border-red-200 text-red-600 hover:bg-red-50'
                        : 'border-green-200 text-green-600 hover:bg-green-50'
                    }`}
                  >
                    {p.isActive ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    onClick={() => openEdit(p)}
                    className="p-1.5 text-gray-400 hover:text-indigo-600 rounded hover:bg-indigo-50"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => remove(p.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                  >
                    {expandedId === p.id
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {expandedId === p.id && (
                <div className="border-t p-5 bg-gray-50 space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Client ID</p>
                      <p className="font-mono text-xs text-gray-800">{p.clientId ?? '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Attribute Mapping</p>
                      <pre className="text-xs font-mono bg-white border rounded p-2">
                        {JSON.stringify(p.attributeMapping ?? {}, null, 2)}
                      </pre>
                    </div>
                  </div>

                  {p.protocol === 'SAML' && (
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <p className="text-xs font-medium text-gray-700">SP Metadata XML</p>
                        {!spMetadata[p.id] ? (
                          <button
                            onClick={() => loadMetadata(p.id)}
                            className="text-xs text-indigo-600 hover:underline"
                          >
                            Load
                          </button>
                        ) : (
                          <button
                            onClick={() => copyMetadata(p.id)}
                            className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedMetadata === p.id ? 'Copied!' : 'Copy'}
                          </button>
                        )}
                      </div>
                      {spMetadata[p.id] && (
                        <pre className="text-xs font-mono bg-white border rounded p-3 overflow-auto max-h-40">
                          {spMetadata[p.id]}
                        </pre>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Globe className="w-3 h-3" />
                    Login URL:
                    <code className="font-mono bg-white border px-2 py-0.5 rounded text-gray-700">
                      /auth/sso/{p.id}/initiate
                    </code>
                  </div>
                </div>
              )}
            </div>
          ))}
          {!providers.length && !showForm && (
            <div className="text-center py-12 text-gray-400">
              No SSO providers configured. Add one to enable single sign-on.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
