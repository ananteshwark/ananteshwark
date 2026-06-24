import React, { useState, useEffect } from 'react';
import { platformApi } from '../../api/platform';
import { Shield, Key, AlertTriangle, FileText, Database, Plus, CheckCircle, XCircle, Play } from 'lucide-react';

type Tab = 'sso' | 'sod' | 'tax' | 'retention';

const RISK_COLORS: Record<string, string> = {
  LOW: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-red-100 text-red-800',
};

const VIOLATION_COLORS: Record<string, string> = {
  OPEN: 'bg-red-100 text-red-800',
  MITIGATED: 'bg-yellow-100 text-yellow-800',
  ACCEPTED: 'bg-green-100 text-green-800',
};

export const PlatformPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('sso');
  const [ssoProviders, setSsoProviders] = useState<any[]>([]);
  const [sodRules, setSodRules] = useState<any[]>([]);
  const [sodViolations, setSodViolations] = useState<any[]>([]);
  const [taxCodes, setTaxCodes] = useState<any[]>([]);
  const [retentionPolicies, setRetentionPolicies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showSsoModal, setShowSsoModal] = useState(false);
  const [showSodModal, setShowSodModal] = useState(false);
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [showRetentionModal, setShowRetentionModal] = useState(false);
  const [taxCompute, setTaxCompute] = useState<{ taxCodeId: string; amount: string }>({ taxCodeId: '', amount: '' });
  const [taxResult, setTaxResult] = useState<any>(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [sso, rules, violations, tax, retention] = await Promise.all([
        platformApi.getSsoProviders(),
        platformApi.getSodRules(),
        platformApi.getSodViolations(),
        platformApi.getTaxCodes(),
        platformApi.getRetentionPolicies(),
      ]);
      setSsoProviders(sso.data?.data || sso.data || []);
      setSodRules(rules.data?.data || rules.data || []);
      setSodViolations(violations.data?.data || violations.data || []);
      setTaxCodes(tax.data?.data || tax.data || []);
      setRetentionPolicies(retention.data?.data || retention.data || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleToggleSso = async (id: string) => {
    await platformApi.toggleSsoProvider(id);
    fetchAll();
  };

  const handleMitigate = async (id: string) => {
    const notes = prompt('Enter mitigation notes:');
    if (!notes) return;
    await platformApi.mitigateViolation(id, notes);
    fetchAll();
  };

  const handleComputeTax = async () => {
    if (!taxCompute.taxCodeId || !taxCompute.amount) return;
    const res = await platformApi.computeTax({ taxCodeId: taxCompute.taxCodeId, amount: parseFloat(taxCompute.amount) });
    setTaxResult(res.data?.data ?? res.data);
  };

  const handleSsoSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await platformApi.createSsoProvider({
      name: f.get('name'),
      protocol: f.get('protocol'),
      clientId: f.get('clientId'),
      clientSecret: f.get('clientSecret'),
      metadataUrl: f.get('metadataUrl'),
    });
    setShowSsoModal(false);
    fetchAll();
  };

  const handleSodSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await platformApi.createSodRule({
      name: f.get('name'),
      permissionA: f.get('permissionA'),
      permissionB: f.get('permissionB'),
      riskLevel: f.get('riskLevel'),
      description: f.get('description'),
    });
    setShowSodModal(false);
    fetchAll();
  };

  const handleTaxSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await platformApi.createTaxCode({
      code: f.get('code'),
      name: f.get('name'),
      type: f.get('type'),
      rate: parseFloat(f.get('rate') as string),
      effectiveFrom: f.get('effectiveFrom'),
    });
    setShowTaxModal(false);
    fetchAll();
  };

  const handleRetentionSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await platformApi.createRetentionPolicy({
      entityName: f.get('entityName'),
      retentionDays: parseInt(f.get('retentionDays') as string),
      action: f.get('action'),
      description: f.get('description'),
    });
    setShowRetentionModal(false);
    fetchAll();
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'sso', label: 'SSO Providers', icon: <Key className="h-4 w-4" /> },
    { key: 'sod', label: 'SoD & GRC', icon: <Shield className="h-4 w-4" /> },
    { key: 'tax', label: 'Tax Engine', icon: <FileText className="h-4 w-4" /> },
    { key: 'retention', label: 'Data Retention', icon: <Database className="h-4 w-4" /> },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Administration</h1>
          <p className="text-sm text-gray-500 mt-1">SSO, GRC/SoD Controls, Tax Engine, Data Governance</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500">SSO Providers</div>
          <div className="text-2xl font-bold text-blue-600">{ssoProviders.length}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500">SoD Rules</div>
          <div className="text-2xl font-bold text-purple-600">{sodRules.length}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500">Open Violations</div>
          <div className="text-2xl font-bold text-red-600">{sodViolations.filter((v: any) => v.status === 'OPEN').length}</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-500">Tax Codes</div>
          <div className="text-2xl font-bold text-green-600">{taxCodes.length}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 gap-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {loading && <div className="text-center py-8 text-gray-400">Loading...</div>}

      {/* SSO Providers Tab */}
      {activeTab === 'sso' && !loading && (
        <div className="bg-white rounded-lg border">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold">SSO Providers</h2>
            <button onClick={() => setShowSsoModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              <Plus className="h-3.5 w-3.5" /> Add Provider
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Protocol</th>
                <th className="px-4 py-2 text-left">Client ID</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ssoProviders.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3"><span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">{p.protocol}</span></td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.clientId}</td>
                  <td className="px-4 py-3">
                    {p.isActive
                      ? <span className="flex items-center gap-1 text-green-600"><CheckCircle className="h-3.5 w-3.5" /> Active</span>
                      : <span className="flex items-center gap-1 text-gray-400"><XCircle className="h-3.5 w-3.5" /> Inactive</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleToggleSso(p.id)} className="text-blue-600 hover:underline text-xs">
                      {p.isActive ? 'Disable' : 'Enable'}
                    </button>
                  </td>
                </tr>
              ))}
              {ssoProviders.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No SSO providers configured</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* SoD & GRC Tab */}
      {activeTab === 'sod' && !loading && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">Segregation of Duties Rules</h2>
              <button onClick={() => setShowSodModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                <Plus className="h-3.5 w-3.5" /> Add Rule
              </button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Permission A</th>
                  <th className="px-4 py-2 text-left">Permission B</th>
                  <th className="px-4 py-2 text-left">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sodRules.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 font-mono text-xs bg-gray-50 rounded">{r.permissionA}</td>
                    <td className="px-4 py-3 font-mono text-xs bg-gray-50 rounded">{r.permissionB}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${RISK_COLORS[r.riskLevel] || 'bg-gray-100 text-gray-700'}`}>{r.riskLevel}</span>
                    </td>
                  </tr>
                ))}
                {sodRules.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">No SoD rules defined</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white rounded-lg border">
            <div className="p-4 border-b">
              <h2 className="font-semibold">Violations</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="px-4 py-2 text-left">User</th>
                  <th className="px-4 py-2 text-left">Rule</th>
                  <th className="px-4 py-2 text-left">Detected</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sodViolations.map((v: any) => (
                  <tr key={v.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{v.userId}</td>
                    <td className="px-4 py-3 text-gray-600">{v.ruleId}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(v.detectedAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${VIOLATION_COLORS[v.status] || 'bg-gray-100 text-gray-700'}`}>{v.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      {v.status === 'OPEN' && (
                        <button onClick={() => handleMitigate(v.id)} className="text-blue-600 hover:underline text-xs">Mitigate</button>
                      )}
                    </td>
                  </tr>
                ))}
                {sodViolations.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No violations detected</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tax Engine Tab */}
      {activeTab === 'tax' && !loading && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">Tax Codes</h2>
              <button onClick={() => setShowTaxModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                <Plus className="h-3.5 w-3.5" /> Add Tax Code
              </button>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="px-4 py-2 text-left">Code</th>
                  <th className="px-4 py-2 text-left">Name</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Rate %</th>
                  <th className="px-4 py-2 text-left">Effective From</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {taxCodes.map((t: any) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-medium">{t.code}</td>
                    <td className="px-4 py-3">{t.name}</td>
                    <td className="px-4 py-3"><span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded text-xs">{t.type}</span></td>
                    <td className="px-4 py-3 font-semibold">{t.rate}%</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{t.effectiveFrom ? new Date(t.effectiveFrom).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-3">
                      {t.isActive
                        ? <span className="text-green-600 text-xs font-medium">Active</span>
                        : <span className="text-gray-400 text-xs">Inactive</span>
                      }
                    </td>
                  </tr>
                ))}
                {taxCodes.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">No tax codes defined</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Tax Calculator */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold mb-3">Tax Calculator</h3>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Tax Code</label>
                <select
                  value={taxCompute.taxCodeId}
                  onChange={e => setTaxCompute(p => ({ ...p, taxCodeId: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="">Select code...</option>
                  {taxCodes.map((t: any) => <option key={t.id} value={t.id}>{t.code} — {t.name} ({t.rate}%)</option>)}
                </select>
              </div>
              <div className="w-40">
                <label className="block text-xs text-gray-500 mb-1">Amount</label>
                <input
                  type="number"
                  value={taxCompute.amount}
                  onChange={e => setTaxCompute(p => ({ ...p, amount: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="0.00"
                />
              </div>
              <button onClick={handleComputeTax} className="flex items-center gap-1 px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700">
                <Play className="h-3.5 w-3.5" /> Compute
              </button>
            </div>
            {taxResult && (
              <div className="mt-3 p-3 bg-gray-50 rounded text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Base Amount:</span><span className="font-medium">{taxResult.baseAmount?.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Tax Rate:</span><span className="font-medium">{taxResult.rate}%</span></div>
                <div className="flex justify-between text-base font-semibold border-t pt-1"><span>Tax Amount:</span><span>{taxResult.taxAmount?.toFixed(2)}</span></div>
                <div className="flex justify-between text-blue-600 font-bold"><span>Total:</span><span>{taxResult.totalAmount?.toFixed(2)}</span></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Data Retention Tab */}
      {activeTab === 'retention' && !loading && (
        <div className="bg-white rounded-lg border">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold">Data Retention Policies</h2>
            <button onClick={() => setShowRetentionModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
              <Plus className="h-3.5 w-3.5" /> Add Policy
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="px-4 py-2 text-left">Entity</th>
                <th className="px-4 py-2 text-left">Retention (Days)</th>
                <th className="px-4 py-2 text-left">Action</th>
                <th className="px-4 py-2 text-left">Description</th>
                <th className="px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {retentionPolicies.map((p: any) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-medium">{p.entityName}</td>
                  <td className="px-4 py-3 font-semibold">{p.retentionDays}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      p.action === 'DELETE' ? 'bg-red-100 text-red-800' :
                      p.action === 'ARCHIVE' ? 'bg-blue-100 text-blue-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>{p.action}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{p.description}</td>
                  <td className="px-4 py-3">
                    {p.isActive
                      ? <span className="text-green-600 text-xs font-medium">Active</span>
                      : <span className="text-gray-400 text-xs">Inactive</span>
                    }
                  </td>
                </tr>
              ))}
              {retentionPolicies.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No retention policies defined</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* SSO Modal */}
      {showSsoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Add SSO Provider</h3>
            <form onSubmit={handleSsoSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input name="name" required className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. Okta, Azure AD" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Protocol</label>
                <select name="protocol" required className="w-full border rounded px-3 py-2 text-sm">
                  <option value="SAML">SAML</option>
                  <option value="OIDC">OIDC</option>
                  <option value="OAUTH2">OAuth2</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Client ID</label>
                <input name="clientId" required className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Client Secret</label>
                <input name="clientSecret" type="password" required className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Metadata URL</label>
                <input name="metadataUrl" className="w-full border rounded px-3 py-2 text-sm" placeholder="https://..." />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowSsoModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SoD Rule Modal */}
      {showSodModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Add SoD Rule</h3>
            <form onSubmit={handleSodSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rule Name</label>
                <input name="name" required className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Permission A</label>
                <input name="permissionA" required className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. finance:manage" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Permission B</label>
                <input name="permissionB" required className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. audit:manage" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Risk Level</label>
                <select name="riskLevel" required className="w-full border rounded px-3 py-2 text-sm">
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <textarea name="description" rows={2} className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowSodModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tax Code Modal */}
      {showTaxModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Add Tax Code</h3>
            <form onSubmit={handleTaxSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Code</label>
                <input name="code" required className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. GST18" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name</label>
                <input name="name" required className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. GST 18%" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Type</label>
                <select name="type" required className="w-full border rounded px-3 py-2 text-sm">
                  <option value="GST">GST</option>
                  <option value="VAT">VAT</option>
                  <option value="IGST">IGST</option>
                  <option value="SGST">SGST</option>
                  <option value="CGST">CGST</option>
                  <option value="TDS">TDS</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rate (%)</label>
                <input name="rate" type="number" step="0.01" required className="w-full border rounded px-3 py-2 text-sm" placeholder="18" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Effective From</label>
                <input name="effectiveFrom" type="date" required className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowTaxModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Data Retention Modal */}
      {showRetentionModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">Add Retention Policy</h3>
            <form onSubmit={handleRetentionSubmit} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Entity Name</label>
                <input name="entityName" required className="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. audit_logs, fin_journals" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Retention Period (Days)</label>
                <input name="retentionDays" type="number" min="1" required className="w-full border rounded px-3 py-2 text-sm" placeholder="365" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Action After Retention</label>
                <select name="action" required className="w-full border rounded px-3 py-2 text-sm">
                  <option value="ARCHIVE">Archive</option>
                  <option value="DELETE">Delete</option>
                  <option value="ANONYMIZE">Anonymize</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Description</label>
                <textarea name="description" rows={2} className="w-full border rounded px-3 py-2 text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowRetentionModal(false)} className="px-4 py-2 text-sm border rounded hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
