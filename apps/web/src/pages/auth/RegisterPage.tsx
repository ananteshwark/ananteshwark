import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { useRegister } from '../../api/hooks';
import { useAuthStore } from '../../store/authStore';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const registerMutation = useRegister();

  const [form, setForm] = useState({
    companyName: '',
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!form.companyName) newErrors.companyName = 'Company name is required';
    if (!form.firstName) newErrors.firstName = 'First name is required';
    if (!form.lastName) newErrors.lastName = 'Last name is required';
    if (!form.email) newErrors.email = 'Email is required';
    if (form.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    if (form.password !== form.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const data = await registerMutation.mutateAsync({
        companyName: form.companyName,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        password: form.password,
      });
      login(data.user, data.tenant || null, data.accessToken, data.refreshToken);
      navigate('/onboarding');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Registration failed');
    }
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [field]: e.target.value });

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="h-12 w-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">
            E
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Create your ERP</h1>
          <p className="text-sm text-gray-500 mt-1">Start your free trial today</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Company Name"
              type="text"
              name="companyName"
              placeholder="Acme Corporation"
              value={form.companyName}
              onChange={update('companyName')}
              error={errors.companyName}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="First Name"
                type="text"
                name="firstName"
                placeholder="John"
                value={form.firstName}
                onChange={update('firstName')}
                error={errors.firstName}
                required
              />
              <Input
                label="Last Name"
                type="text"
                name="lastName"
                placeholder="Doe"
                value={form.lastName}
                onChange={update('lastName')}
                error={errors.lastName}
                required
              />
            </div>
            <Input
              label="Work Email"
              type="email"
              name="email"
              placeholder="john@acme.com"
              value={form.email}
              onChange={update('email')}
              error={errors.email}
              required
            />
            <Input
              label="Password"
              type="password"
              name="password"
              placeholder="Min 8 characters"
              value={form.password}
              onChange={update('password')}
              error={errors.password}
              required
            />
            <Input
              label="Confirm Password"
              type="password"
              name="confirmPassword"
              placeholder="Repeat password"
              value={form.confirmPassword}
              onChange={update('confirmPassword')}
              error={errors.confirmPassword}
              required
            />

            <Button
              type="submit"
              className="w-full"
              loading={registerMutation.isPending}
            >
              Create Account
            </Button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Already have an account?{' '}
            <Link to="/login" className="text-blue-600 hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
