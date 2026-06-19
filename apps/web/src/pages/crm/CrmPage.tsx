import { useState, useEffect } from 'react';
import { crmApi } from '../../api/crm';

type Tab = 'contacts' | 'pipeline' | 'activities' | 'quotes';

const STAGES = ['QUALIFICATION', 'NEEDS_ANALYSIS', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST'];

export default function CrmPage() {
  const [activeTab, setActiveTab] = useState<Tab>('contacts');
  const [contacts, setContacts] = useState<any[]>([]);
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [contactForm, setContactForm] = useState({ firstName: '', lastName: '', email: '', source: 'WEBSITE', status: 'LEAD' });
  const [search, setSearch] = useState('');

  const fetchAll = () => {
    setLoading(true);
    Promise.all([
      crmApi.getContacts().catch(() => ({ data: [] })),
      crmApi.getOpportunities().catch(() => ({ data: [] })),
      crmApi.getActivities().catch(() => ({ data: [] })),
      crmApi.getQuotes().catch(() => ({ data: [] })),
    ]).then(([c, o, a, q]) => {
      const extract = (r: any) => r.data?.data?.items || r.data?.items || r.data || [];
      setContacts(Array.isArray(extract(c)) ? extract(c) : []);
      setOpportunities(Array.isArray(extract(o)) ? extract(o) : []);
      setActivities(Array.isArray(extract(a)) ? extract(a) : []);
      setQuotes(Array.isArray(extract(q)) ? extract(q) : []);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const handleCreateContact = async () => {
    try {
      await crmApi.createContact(contactForm);
      setShowNewContact(false);
      setContactForm({ firstName: '', lastName: '', email: '', source: 'WEBSITE', status: 'LEAD' });
      fetchAll();
    } catch { alert('Failed to create contact'); }
  };

  const statusColor = (s: string) => {
    if (s === 'CUSTOMER') return 'bg-green-100 text-green-800';
    if (s === 'PROSPECT') return 'bg-blue-100 text-blue-800';
    if (s === 'LEAD') return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-700';
  };

  const stageColor = (s: string) => {
    if (s === 'CLOSED_WON') return 'bg-green-100 border-green-200';
    if (s === 'CLOSED_LOST') return 'bg-red-50 border-red-200';
    return 'bg-white border-gray-200';
  };

  const filteredContacts = contacts.filter((c: any) =>
    !search || `${c.firstName} ${c.lastName} ${c.email} ${c.company || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  const tabs: { key: Tab; label: string }[] = [
    { key: 'contacts', label: 'Contacts' },
    { key: 'pipeline', label: 'Pipeline' },
    { key: 'activities', label: 'Activities' },
    { key: 'quotes', label: 'Quotes' },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">CRM</h1>
        {activeTab === 'contacts' && (
          <button onClick={() => setShowNewContact(true)} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            + New Contact
          </button>
        )}
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-4">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${activeTab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {loading && <p className="text-gray-500 text-sm">Loading…</p>}

      {!loading && activeTab === 'contacts' && (
        <div>
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…" className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-72 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {['Name', 'Email', 'Company', 'Source', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredContacts.map((c: any) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.firstName} {c.lastName}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{c.company || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{c.source}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColor(c.status)}`}>{c.status}</span>
                    </td>
                  </tr>
                ))}
                {filteredContacts.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No contacts found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && activeTab === 'pipeline' && (
        <div className="overflow-x-auto">
          <div className="flex gap-4 min-w-max">
            {STAGES.map((stage) => {
              const stagOps = opportunities.filter((o: any) => o.stage === stage);
              const total = stagOps.reduce((s: number, o: any) => s + Number(o.value || 0), 0);
              return (
                <div key={stage} className="w-64 flex-shrink-0">
                  <div className="mb-2">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase">{stage.replace('_', ' ')}</h3>
                    <p className="text-sm text-gray-700 font-medium">₹{total.toLocaleString()} · {stagOps.length}</p>
                  </div>
                  <div className="space-y-2">
                    {stagOps.map((o: any) => (
                      <div key={o.id} className={`p-3 rounded-lg border ${stageColor(o.stage)}`}>
                        <p className="text-sm font-medium text-gray-900 truncate">{o.title}</p>
                        <p className="text-xs text-gray-500 mt-1">{o.company || '—'}</p>
                        <div className="flex justify-between items-center mt-2">
                          <span className="text-xs font-semibold text-blue-700">₹{Number(o.value || 0).toLocaleString()}</span>
                          <span className="text-xs text-gray-400">{o.probability}%</span>
                        </div>
                      </div>
                    ))}
                    {stagOps.length === 0 && (
                      <div className="p-3 rounded-lg border border-dashed border-gray-200 text-center text-xs text-gray-400">No opportunities</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && activeTab === 'activities' && (
        <div className="space-y-3">
          {activities.map((a: any) => (
            <div key={a.id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-start gap-3">
              <span className={`mt-0.5 px-2 py-0.5 rounded text-xs font-medium ${a.type === 'CALL' ? 'bg-blue-100 text-blue-700' : a.type === 'MEETING' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                {a.type}
              </span>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{a.subject}</p>
                {a.description && <p className="text-xs text-gray-500 mt-1">{a.description}</p>}
                <p className="text-xs text-gray-400 mt-1">{a.activityDate}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${a.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                {a.status}
              </span>
            </div>
          ))}
          {activities.length === 0 && (
            <div className="text-center py-16 text-gray-400">No activities logged yet.</div>
          )}
        </div>
      )}

      {!loading && activeTab === 'quotes' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['Quote #', 'Title', 'Date', 'Total', 'Status'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quotes.map((q: any) => (
                <tr key={q.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-700">{q.quoteNumber}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{q.title}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{q.quoteDate}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{q.currency} {Number(q.total || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${q.status === 'ACCEPTED' ? 'bg-green-100 text-green-800' : q.status === 'SENT' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
                      {q.status}
                    </span>
                  </td>
                </tr>
              ))}
              {quotes.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No quotes yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showNewContact && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">New Contact</h2>
            <div className="space-y-4">
              {[
                { label: 'First Name', key: 'firstName' },
                { label: 'Last Name', key: 'lastName' },
                { label: 'Email', key: 'email' },
              ].map((f) => (
                <div key={f.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                  <input value={(contactForm as any)[f.key]} onChange={(e) => setContactForm({ ...contactForm, [f.key]: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source</label>
                <select value={contactForm.source} onChange={(e) => setContactForm({ ...contactForm, source: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {['WEBSITE', 'REFERRAL', 'EVENT', 'SOCIAL', 'COLD_CALL', 'OTHER'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleCreateContact} className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Create</button>
              <button onClick={() => setShowNewContact(false)} className="flex-1 px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
