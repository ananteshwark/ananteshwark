import { useState, useEffect } from 'react';
import { Plus, X, KeyRound } from 'lucide-react';
import { financeApi } from '../../api/finance';
import { procurementApi } from '../../api/procurement';

interface Vendor {
  id: string;
  code: string;
  name: string;
  email?: string;
  phone?: string;
  currency: string;
  isActive: boolean;
  paymentTerms: number;
}

const defaultForm = {
  code: '',
  name: '',
  email: '',
  phone: '',
  currency: 'USD',
  paymentTerms: 30,
};

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [portalVendor, setPortalVendor] = useState<Vendor | null>(null);
  const [portalForm, setPortalForm] = useState({ portalEmail: '', password: '' });
  const [portalState, setPortalState] = useState<{ submitting: boolean; error: string | null; done: boolean }>({ submitting: false, error: null, done: false });

  const fetchVendors = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await financeApi.getVendors();
      setVendors(res.data?.data?.items ?? res.data?.data ?? res.data ?? []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);
    try {
      await financeApi.createVendor({
        ...form,
        email: form.email || undefined,
        phone: form.phone || undefined,
        paymentTerms: Number(form.paymentTerms),
      });
      setShowModal(false);
      setForm(defaultForm);
      fetchVendors();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Failed to create vendor');
    } finally {
      setSubmitting(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setForm(defaultForm);
    setFormError(null);
  };

  const openPortal = (vendor: Vendor) => {
    setPortalVendor(vendor);
    setPortalForm({ portalEmail: vendor.email ?? '', password: '' });
    setPortalState({ submitting: false, error: null, done: false });
  };

  const handlePortalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!portalVendor) return;
    setPortalState({ submitting: true, error: null, done: false });
    try {
      await procurementApi.enableVendorPortal(portalVendor.id, {
        portalEmail: portalForm.portalEmail,
        password: portalForm.password,
      });
      setPortalState({ submitting: false, error: null, done: true });
    } catch (err: any) {
      setPortalState({ submitting: false, error: err?.response?.data?.message ?? 'Failed to enable portal access', done: false });
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Vendors</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Vendor
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Currency</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {vendors.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No vendors found</td>
                </tr>
              )}
              {vendors.map((vendor) => (
                <tr key={vendor.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono text-gray-900">{vendor.code}</td>
                  <td className="px-4 py-3 text-sm text-gray-900">{vendor.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{vendor.email ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">{vendor.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{vendor.currency}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${vendor.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'}`}>
                      {vendor.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => openPortal(vendor)}
                      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100"
                    >
                      <KeyRound className="w-3.5 h-3.5" /> Portal Access
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">New Vendor</h2>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
                <input
                  type="text"
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. VEND-001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Vendor name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email (optional)</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="vendor@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone (optional)</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="+1 555 000 0000"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Currency</label>
                  <input
                    type="text"
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="USD"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms (days)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.paymentTerms}
                    onChange={(e) => setForm({ ...form, paymentTerms: Number(e.target.value) })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create Vendor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Portal Access Modal */}
      {portalVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">Enable Portal Access — {portalVendor.name}</h2>
              <button onClick={() => setPortalVendor(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            {portalState.done ? (
              <div className="px-6 py-6 space-y-4">
                <p className="text-sm text-green-700 bg-green-50 rounded-lg p-3">
                  Portal access enabled. Share these details with the vendor along with your Organization ID.
                </p>
                <div className="text-sm space-y-1">
                  <div><span className="text-gray-500">Login URL:</span> <span className="font-mono">/vendor/login</span></div>
                  <div><span className="text-gray-500">Email:</span> <span className="font-mono">{portalForm.portalEmail}</span></div>
                </div>
                <div className="flex justify-end">
                  <button onClick={() => setPortalVendor(null)} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={handlePortalSubmit} className="px-6 py-4 space-y-4">
                {portalState.error && <p className="text-sm text-red-600">{portalState.error}</p>}
                <p className="text-xs text-gray-500">
                  Set credentials the vendor will use to log into the self-service portal to view RFQs, purchase orders, submit invoices, and track payment status.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Portal Email</label>
                  <input
                    type="email"
                    required
                    value={portalForm.portalEmail}
                    onChange={(e) => setPortalForm({ ...portalForm, portalEmail: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="vendor@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={portalForm.password}
                    onChange={(e) => setPortalForm({ ...portalForm, password: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Min 6 characters"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setPortalVendor(null)} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
                  <button type="submit" disabled={portalState.submitting} className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                    {portalState.submitting ? 'Enabling...' : 'Enable Access'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
