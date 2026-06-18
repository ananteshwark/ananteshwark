import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useLogin } from '../../api/hooks';
import { useAuthStore } from '../../store/authStore';

export default function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const loginMutation = useLogin();

  const [form, setForm] = useState({
    email: '',
    password: '',
    tenantSlug: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = await loginMutation.mutateAsync({
        email: form.email,
        password: form.password,
        tenantSlug: form.tenantSlug || undefined,
      });
      login(data.user, data.tenant || null, data.accessToken, data.refreshToken);
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Login failed');
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
          <p className="text-sm text-gray-500 mt-1">Sign in to your ERP account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
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
            <Input
              label="Tenant Slug (optional)"
              type="text"
              name="tenantSlug"
              placeholder="your-company"
              value={form.tenantSlug}
              onChange={(e) => setForm({ ...form, tenantSlug: e.target.value })}
              helperText="Leave blank to auto-detect from domain"
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
        </div>
      </div>
    </div>
  );
}
