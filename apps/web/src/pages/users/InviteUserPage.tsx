import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { useInviteUser, useRoles } from '../../api/hooks';

export default function InviteUserPage() {
  const navigate = useNavigate();
  const inviteUser = useInviteUser();
  const { data: roles } = useRoles();

  const [form, setForm] = useState({
    email: '',
    firstName: '',
    lastName: '',
    roleId: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await inviteUser.mutateAsync({
        email: form.email,
        firstName: form.firstName,
        lastName: form.lastName,
        roleIds: form.roleId ? [form.roleId] : undefined,
      });
      toast.success('Invitation sent successfully');
      navigate('/users');
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Failed to send invitation');
    }
  };

  const roleOptions = Array.isArray(roles)
    ? roles.map((r: any) => ({ value: r.id, label: r.name }))
    : [];

  return (
    <div className="max-w-lg">
      <PageHeader
        title="Invite User"
        description="Send an invitation to join your organization"
        actions={
          <Button variant="secondary" onClick={() => navigate('/users')}>
            Cancel
          </Button>
        }
      />

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name"
                name="firstName"
                placeholder="John"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                required
              />
              <Input
                label="Last Name"
                name="lastName"
                placeholder="Doe"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                required
              />
            </div>
            <Input
              label="Email Address"
              type="email"
              name="email"
              placeholder="john@company.com"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <Select
              label="Role (optional)"
              name="roleId"
              options={roleOptions}
              placeholder="Select a role"
              value={form.roleId}
              onChange={(e) => setForm({ ...form, roleId: e.target.value })}
            />

            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={inviteUser.isPending} className="flex-1">
                Send Invitation
              </Button>
              <Button type="button" variant="secondary" onClick={() => navigate('/users')}>
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
