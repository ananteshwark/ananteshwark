import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useLogin } from '../../api/hooks';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/authStore';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const loginMutation = useLogin();

  const [form, setForm] = useState({
    email: '',
    password: '',
  });
  // Step two of an MFA-enforced login: server returned a challenge token
  // instead of a session, so we collect the authenticator code.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  const completeLogin = (data: any) => {
    login(data.user, data.tenant || null, data.accessToken, data.refreshToken);
    navigate('/dashboard');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Tenant is resolved automatically from the user's account.
      const data = await loginMutation.mutateAsync({
        email: form.email,
        password: form.password,
      });
      if (data.mfaRequired) {
        setMfaToken(data.mfaToken);
        return;
      }
      completeLogin(data);
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Login failed');
    }
  };

  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    try {
      const res = await apiClient.post('/auth/mfa/verify', { mfaToken, code: mfaCode });
      completeLogin(res.data?.data ?? res.data);
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Invalid code');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">
            E
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
          <p className="text-sm text-gray-500 mt-1">
            {mfaToken ? 'Two-factor authentication' : 'Sign in to your ERP account'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          {mfaToken ? (
            <form onSubmit={handleVerifyMfa} className="space-y-4">
              <p className="text-sm text-gray-600">
                Enter the 6-digit code from your authenticator app.
              </p>
              <Input
                label="Authentication code"
                type="text"
                name="mfaCode"
                placeholder="123456"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                autoFocus
                required
              />
              <Button type="submit" className="w-full" loading={verifying} disabled={mfaCode.length !== 6}>
                Verify
              </Button>
              <button
                type="button"
                onClick={() => { setMfaToken(null); setMfaCode(''); }}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
              >
                Back to sign in
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Email"
                  type="email"
                  name="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
                <Input
                  label="Password"
                  type="password"
                  name="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />

                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" className="rounded border-gray-300" />
                    Remember me
                  </label>
                  <Link to="/forgot-password" className="text-sm text-blue-600 hover:underline">
                    Forgot password?
                  </Link>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  loading={loginMutation.isPending}
                >
                  Sign in
                </Button>
              </form>

              <p className="text-center text-sm text-gray-500 mt-4">
                Don't have an account?{' '}
                <Link to="/register" className="text-blue-600 hover:underline font-medium">
                  Create one
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
