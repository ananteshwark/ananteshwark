import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Search } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { DataTable, Pagination } from '../../components/ui/Table';
import { PageSpinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useUsers, useDeactivateUser } from '../../api/hooks';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  active: 'success',
  inactive: 'error',
  invited: 'warning',
  locked: 'error',
};

export default function UsersPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const deactivate = useDeactivateUser();

  const { data, isLoading } = useUsers({ page, limit: 20, search: search || undefined });

  const handleDeactivate = async (userId: string) => {
    if (!confirm('Deactivate this user?')) return;
    try {
      await deactivate.mutateAsync(userId);
      toast.success('User deactivated');
    } catch {
      toast.error('Failed to deactivate user');
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'User',
      render: (_: any, row: any) => (
        <div className="flex items-center gap-3">
          <Avatar name={`${row.firstName} ${row.lastName}`} size="sm" />
          <div>
            <p className="font-medium text-gray-900">{row.firstName} {row.lastName}</p>
            <p className="text-xs text-gray-500">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => (
        <Badge variant={STATUS_VARIANT[value] || 'default'}>
          {value}
        </Badge>
      ),
    },
    {
      key: 'lastLoginAt',
      header: 'Last Login',
      render: (value: string) => value ? format(new Date(value), 'MMM d, yyyy') : 'Never',
    },
    {
      key: 'createdAt',
      header: 'Joined',
      render: (value: string) => format(new Date(value), 'MMM d, yyyy'),
    },
    {
      key: 'actions',
      header: '',
      render: (_: any, row: any) => (
        <div className="flex items-center gap-2">
          {row.status === 'active' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleDeactivate(row.id)}
            >
              Deactivate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Users"
        description="Manage users and their access"
        actions={
          <Button
            onClick={() => navigate('/users/invite')}
            leftIcon={<UserPlus className="h-4 w-4" />}
          >
            Invite User
          </Button>
        }
      />

      <Card>
        <div className="p-4 border-b border-gray-100">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {isLoading ? (
          <PageSpinner />
        ) : !data?.items?.length ? (
          <EmptyState
            title="No users found"
            description="Invite team members to get started"
            action={{ label: 'Invite User', onClick: () => navigate('/users/invite') }}
          />
        ) : (
          <>
            <DataTable columns={columns} data={data.items} />
            <Pagination
              page={page}
              totalPages={data.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}
