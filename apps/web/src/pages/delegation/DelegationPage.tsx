import React, { useEffect, useMemo, useState } from 'react';
import { UserCog, ArrowRight, Info, Plus, Ban, Pencil } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PageSpinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Input, Textarea } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { delegationsApi } from '../../api/delegations';
import { apiClient } from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const SCOPES = ['ALL', 'HR', 'FINANCE', 'PROCUREMENT'];

interface UserOption {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Delegation {
  id: string;
  delegatorUserId: string;
  delegateeUserId: string;
  fromDate: string;
  toDate: string;
  scope: string;
  reason: string | null;
  isActive: boolean;
  createdAt: string;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function DelegationPage() {
  const currentUser = useAuthStore((s) => s.user);
  const [delegations, setDelegations] = useState<Delegation[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [active, setActive] = useState<{ inbound: Delegation[]; outbound: Delegation[] }>({
    inbound: [],
    outbound: [],
  });
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState({
    delegateeUserId: '',
    fromDate: todayStr(),
    toDate: todayStr(),
    scope: 'ALL',
    reason: '',
  });

  const userMap = useMemo(() => {
    const m: Record<string, UserOption> = {};
    users.forEach((u) => { m[u.id] = u; });
    return m;
  }, [users]);

  const userName = (id: string) => {
    const u = userMap[id];
    return u ? `${u.firstName} ${u.lastName}` : id;
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [delRes, activeRes, usersRes] = await Promise.all([
        delegationsApi.list(),
        delegationsApi.active(),
        apiClient.get('/users', { params: { limit: 200 } }),
      ]);
      setDelegations((delRes.data?.data ?? delRes.data) || []);
      const a = activeRes.data?.data ?? activeRes.data;
      setActive({ inbound: a?.inbound ?? [], outbound: a?.outbound ?? [] });
      const usersBody = usersRes.data?.data ?? usersRes.data;
      setUsers(usersBody?.items ?? usersBody ?? []);
    } catch {
      toast.error('Failed to load delegations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const openModal = () => {
    setEditingId(null);
    setForm({
      delegateeUserId: '',
      fromDate: todayStr(),
      toDate: todayStr(),
      scope: 'ALL',
      reason: '',
    });
    setModalOpen(true);
  };

  const openEdit = (d: Delegation) => {
    setEditingId(d.id);
    setForm({
      delegateeUserId: d.delegateeUserId,
      fromDate: d.fromDate.slice(0, 10),
      toDate: d.toDate.slice(0, 10),
      scope: d.scope,
      reason: d.reason ?? '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.delegateeUserId) {
      toast.error('Select a delegatee');
      return;
    }
    if (form.toDate < form.fromDate) {
      toast.error('End date must be on or after the start date');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        delegateeUserId: form.delegateeUserId,
        fromDate: form.fromDate,
        toDate: form.toDate,
        scope: form.scope,
        reason: form.reason || undefined,
      };
      if (editingId) {
        await delegationsApi.update(editingId, payload);
        toast.success('Delegation updated');
      } else {
        await delegationsApi.create(payload);
        toast.success('Delegation created');
      }
      setModalOpen(false);
      setEditingId(null);
      await loadAll();
    } catch {
      toast.error(editingId ? 'Failed to update delegation' : 'Failed to create delegation');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await delegationsApi.revoke(id);
      toast.success('Delegation revoked');
      await loadAll();
    } catch {
      toast.error('Failed to revoke delegation');
    }
  };

  const userOptions = users
    .filter((u) => u.id !== currentUser?.id)
    .map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName} (${u.email})` }));

  const hasActive = active.inbound.length > 0 || active.outbound.length > 0;

  return (
    <div>
      <PageHeader
        title="Delegations"
        description="Delegate your approval authority to another user for a date range and scope"
        actions={
          <Button onClick={openModal} leftIcon={<Plus className="h-4 w-4" />}>
            New Delegation
          </Button>
        }
      />

      {hasActive && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div className="space-y-1">
            {active.outbound.length > 0 && (
              <p>
                You have delegated your approval authority to{' '}
                <strong>{active.outbound.map((d) => userName(d.delegateeUserId)).join(', ')}</strong>.
              </p>
            )}
            {active.inbound.length > 0 && (
              <p>
                You are currently acting as approver on behalf of{' '}
                <strong>{active.inbound.map((d) => userName(d.delegatorUserId)).join(', ')}</strong>.
              </p>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <PageSpinner />
      ) : delegations.length === 0 ? (
        <EmptyState
          icon={<UserCog className="h-10 w-10" />}
          title="No delegations"
          description="Create a delegation to hand off approval authority while someone is away"
        />
      ) : (
        <div className="space-y-3">
          {delegations.map((d) => (
            <Card key={d.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">{userName(d.delegatorUserId)}</span>
                      <ArrowRight className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-gray-900">{userName(d.delegateeUserId)}</span>
                      <Badge variant="default">{d.scope}</Badge>
                      <Badge variant={d.isActive ? 'success' : 'default'}>
                        {d.isActive ? 'Active' : 'Revoked'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500">
                      {format(new Date(d.fromDate), 'MMM d, yyyy')} &ndash;{' '}
                      {format(new Date(d.toDate), 'MMM d, yyyy')}
                    </p>
                    {d.reason && <p className="mt-1 text-xs text-gray-400">{d.reason}</p>}
                  </div>
                  {d.isActive && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => openEdit(d)}
                        leftIcon={<Pencil className="h-4 w-4" />}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRevoke(d.id)}
                        leftIcon={<Ban className="h-4 w-4" />}
                      >
                        Revoke
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Edit Delegation' : 'New Delegation'}>
        <div className="space-y-4 p-6">
          <Select
            label="Delegatee"
            placeholder="Select a user"
            options={userOptions}
            value={form.delegateeUserId}
            onChange={(e) => setForm({ ...form, delegateeUserId: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="From"
              type="date"
              value={form.fromDate}
              onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
            />
            <Input
              label="To"
              type="date"
              value={form.toDate}
              onChange={(e) => setForm({ ...form, toDate: e.target.value })}
            />
          </div>
          <Select
            label="Scope"
            options={SCOPES.map((s) => ({ value: s, label: s }))}
            value={form.scope}
            onChange={(e) => setForm({ ...form, scope: e.target.value })}
          />
          <Textarea
            label="Reason (optional)"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            placeholder="e.g. Out of office"
          />
          <div className="flex gap-3">
            <Button className="flex-1" onClick={handleSave} loading={saving}>
              {editingId ? 'Save Changes' : 'Create'}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
