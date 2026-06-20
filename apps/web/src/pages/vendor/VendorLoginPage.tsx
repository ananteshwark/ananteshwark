import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { vendorPortalApi } from '../../api/procurement';
import { Building2 } from 'lucide-react';

export default function VendorLoginPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ tenantId: '', portalEmail: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await vendorPortalApi.login(form);
      const data = res.data?.data ?? res.data;
      sessionStorage.setItem('vendor_token', data.accessToken);
      sessionStorage.setItem('vendor_tenant', form.tenantId);
      sessionStorage.setItem('vendor_name', data.vendorName || '');
      navigate('/vendor/portal');
    } catch (e: any) {
      setError(e.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center text-white mb-3">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Vendor Portal</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to view RFQs, POs, and submit invoices</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Organization ID</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.tenantId} onChange={(e) => setForm((f) => ({ ...f, tenantId: e.target.value }))} placeholder="Provided by the buyer" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.portalEmail} onChange={(e) => setForm((f) => ({ ...f, portalEmail: e.target.value }))} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required />
          </div>
          <button type="submit" disabled={loading} className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
