import React, { useState } from 'react';
import { Shield, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { PageSpinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useRoles, usePermissions, useCreateRole } from '../../api/hooks';
import toast from 'react-hot-toast';

export default function RolesPage() {
  const { data: roles, isLoading: rolesLoading } = useRoles();
  const { data: permissions } = usePermissions();
  const createRole = useCreateRole();

  const [showModal, setShowModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<any>(null);
  const [newRole, setNewRole] = useState({ name: '', description: '', permissions: [] as string[] });

  const togglePermission = (perm: string) => {
    setNewRole(r => ({
      ...r,
      permissions: r.permissions.includes(perm)
        ? r.permissions.filter(p => p !== perm)
        : [...r.permissions, perm],
    }));
  };

  const handleCreate = async () => {
    try {
      await createRole.mutateAsync(newRole);
      toast.success('Role created');
      setShowModal(false);
      setNewRole({ name: '', description: '', permissions: [] });
    } catch {
      toast.error('Failed to create role');
    }
  };

  const modulePermissions = permissions as Record<string, string[]> | undefined;

  return (
    <div>
      <PageHeader
        title="Roles & Permissions"
        description="Manage access control roles for your organization"
        actions={
          <Button onClick={() => setShowModal(true)} leftIcon={<Plus className="h-4 w-4" />}>
            Create Role
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rolesLoading ? (
          <PageSpinner />
        ) : !Array.isArray(roles) || roles.length === 0 ? (
          <div className="col-span-3">
            <EmptyState
              icon={<Shield className="h-10 w-10" />}
              title="No roles found"
              description="Create roles to manage user permissions"
              action={{ label: 'Create Role', onClick: () => setShowModal(true) }}
            />
          </div>
        ) : (
          (roles as any[]).map((role) => (
            <Card key={role.id} className="cursor-pointer hover:border-blue-200 transition-colors"
              onClick={() => setSelectedRole(selectedRole?.id === role.id ? null : role)}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{role.name}</h3>
                    {role.description && <p className="text-xs text-gray-500 mt-0.5">{role.description}</p>}
                  </div>
                  {role.isSystemRole && <Badge variant="info">System</Badge>}
                </div>
                <p className="text-xs text-gray-500">
                  {role.permissions?.length || 0} permissions
                </p>
                {selectedRole?.id === role.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex flex-wrap gap-1">
                      {role.permissions?.slice(0, 8).map((p: string) => (
                        <span key={p} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          {p}
                        </span>
                      ))}
                      {role.permissions?.length > 8 && (
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                          +{role.permissions.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Create New Role" size="lg">
        <div className="p-6 space-y-4">
          <Input
            label="Role Name"
            placeholder="e.g. Project Manager"
            value={newRole.name}
            onChange={e => setNewRole({ ...newRole, name: e.target.value })}
          />
          <Input
            label="Description"
            placeholder="What can this role do?"
            value={newRole.description}
            onChange={e => setNewRole({ ...newRole, description: e.target.value })}
          />
          {modulePermissions && (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              <p className="text-sm font-medium text-gray-700">Permissions</p>
              {Object.entries(modulePermissions).map(([module, perms]) => (
                <div key={module}>
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-1">{module}</p>
                  <div className="space-y-1">
                    {perms.map((perm: string) => (
                      <label key={perm} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newRole.permissions.includes(perm)}
                          onChange={() => togglePermission(perm)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-gray-700">{perm}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button onClick={handleCreate} loading={createRole.isPending} className="flex-1">
              Create Role
            </Button>
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
