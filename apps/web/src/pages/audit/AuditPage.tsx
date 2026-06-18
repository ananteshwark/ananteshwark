import React, { useState } from 'react';
import { ClipboardList, ChevronDown, ChevronRight } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Badge } from '../../components/ui/Badge';
import { PageSpinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { DataTable, Pagination } from '../../components/ui/Table';
import { useAuditLogs } from '../../api/hooks';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { format } from 'date-fns';

const ACTION_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
  POST: 'success',
  PATCH: 'warning',
  PUT: 'warning',
  DELETE: 'error',
  GET: 'default',
};

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState({
    resourceType: '',
    action: '',
    startDate: '',
    endDate: '',
  });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const { data, isLoading } = useAuditLogs({
    page,
    limit: 20,
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
  });

  const logs = data?.items || [];

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Immutable record of all system actions"
      />

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <Select
          name="resourceType"
          placeholder="Resource Type"
          options={[
            { value: 'users', label: 'Users' },
            { value: 'tenants', label: 'Tenants' },
            { value: 'roles', label: 'Roles' },
            { value: 'workflows', label: 'Workflows' },
          ]}
          value={filters.resourceType}
          onChange={e => setFilters({ ...filters, resourceType: e.target.value })}
        />
        <Select
          name="action"
          placeholder="Action"
          options={[
            { value: 'POST', label: 'Create (POST)' },
            { value: 'PATCH', label: 'Update (PATCH)' },
            { value: 'PUT', label: 'Replace (PUT)' },
            { value: 'DELETE', label: 'Delete (DELETE)' },
          ]}
          value={filters.action}
          onChange={e => setFilters({ ...filters, action: e.target.value })}
        />
        <Input
          type="date"
          name="startDate"
          placeholder="Start Date"
          value={filters.startDate}
          onChange={e => setFilters({ ...filters, startDate: e.target.value })}
        />
        <Input
          type="date"
          name="endDate"
          placeholder="End Date"
          value={filters.endDate}
          onChange={e => setFilters({ ...filters, endDate: e.target.value })}
        />
      </div>

      <Card>
        {isLoading ? (
          <PageSpinner />
        ) : logs.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-10 w-10" />}
            title="No audit logs found"
            description="Audit logs will appear here as users interact with the system"
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map((log: any) => (
              <div key={log.id}>
                <div
                  className="flex items-center gap-4 p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                >
                  <div className="text-gray-400">
                    {expandedRow === log.id
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />
                    }
                  </div>
                  <div className="flex-1 grid grid-cols-5 gap-4 items-center text-sm">
                    <div>
                      <p className="font-medium text-gray-900">{log.userEmail || 'System'}</p>
                    </div>
                    <div>
                      <Badge variant={ACTION_VARIANTS[log.action] || 'default'}>
                        {log.action}
                      </Badge>
                    </div>
                    <div className="text-gray-600">{log.resourceType}</div>
                    <div className="text-gray-500 truncate">{log.resourceId || '-'}</div>
                    <div className="text-gray-400 text-xs">
                      {format(new Date(log.createdAt), 'MMM d, HH:mm')}
                    </div>
                  </div>
                </div>
                {expandedRow === log.id && (
                  <div className="px-12 pb-4 bg-gray-50 border-b border-gray-100">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {log.newValues && (
                        <div>
                          <p className="font-medium text-gray-700 mb-1">New Values</p>
                          <pre className="text-xs bg-white border border-gray-200 rounded p-2 overflow-auto max-h-32">
                            {JSON.stringify(log.newValues, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.oldValues && (
                        <div>
                          <p className="font-medium text-gray-700 mb-1">Old Values</p>
                          <pre className="text-xs bg-white border border-gray-200 rounded p-2 overflow-auto max-h-32">
                            {JSON.stringify(log.oldValues, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                    {log.ipAddress && (
                      <p className="text-xs text-gray-500 mt-2">IP: {log.ipAddress}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {data && (
          <Pagination
            page={page}
            totalPages={data.totalPages}
            onPageChange={setPage}
          />
        )}
      </Card>
    </div>
  );
}
