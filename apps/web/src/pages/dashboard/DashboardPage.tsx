import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, GitBranch, Bell, ClipboardList, TrendingUp, UserCheck, DollarSign, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { useAuthStore } from '../../store/authStore';
import { usePendingApprovals, useUsers, useUnreadCount } from '../../api/hooks';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';

const KPICard = ({ title, value, icon, trend, color }: {
  title: string; value: string | number; icon: React.ReactNode; trend?: string; color: string;
}) => (
  <Card>
    <CardContent className="py-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 font-medium">{title}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
          {trend && <p className="text-xs text-green-600 mt-1">{trend}</p>}
        </div>
        <div className={`h-10 w-10 rounded-xl ${color} flex items-center justify-center text-white`}>
          {icon}
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function DashboardPage() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { data: usersData } = useUsers({ page: 1, limit: 1 });
  const { data: pendingApprovals } = usePendingApprovals();
  const { data: unreadData } = useUnreadCount();

  const totalUsers = usersData?.total || 0;
  const pendingCount = Array.isArray(pendingApprovals) ? pendingApprovals.length : 0;
  const unreadCount = unreadData?.count || 0;

  return (
    <div>
      <PageHeader
        title={`Good morning, ${user?.firstName || 'User'}!`}
        description="Here's what's happening in your organization"
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          title="Total Users"
          value={totalUsers}
          icon={<Users className="h-5 w-5" />}
          color="bg-blue-500"
        />
        <KPICard
          title="Pending Approvals"
          value={pendingCount}
          icon={<GitBranch className="h-5 w-5" />}
          color="bg-amber-500"
        />
        <KPICard
          title="Unread Notifications"
          value={unreadCount}
          icon={<Bell className="h-5 w-5" />}
          color="bg-purple-500"
        />
        <KPICard
          title="System Status"
          value="Online"
          icon={<Activity className="h-5 w-5" />}
          trend="All systems operational"
          color="bg-green-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Approvals */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>My Pending Approvals</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => navigate('/workflows')}>
                View all
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {!pendingApprovals || !Array.isArray(pendingApprovals) || pendingApprovals.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <GitBranch className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No pending approvals</p>
              </div>
            ) : (
              <div className="space-y-3">
                {(pendingApprovals as any[]).slice(0, 5).map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{item.subjectType}</p>
                      <p className="text-xs text-gray-500">Step: {item.currentStep}</p>
                    </div>
                    <Badge variant="warning">Pending</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Invite User', icon: <UserCheck className="h-5 w-5" />, path: '/users/invite', color: 'text-blue-600 bg-blue-50' },
                { label: 'View Workflows', icon: <GitBranch className="h-5 w-5" />, path: '/workflows', color: 'text-purple-600 bg-purple-50' },
                { label: 'Audit Logs', icon: <ClipboardList className="h-5 w-5" />, path: '/audit', color: 'text-gray-600 bg-gray-50' },
                { label: 'Notifications', icon: <Bell className="h-5 w-5" />, path: '/notifications', color: 'text-amber-600 bg-amber-50' },
              ].map((action) => (
                <button
                  key={action.path}
                  onClick={() => navigate(action.path)}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all"
                >
                  <div className={`h-10 w-10 rounded-lg ${action.color} flex items-center justify-center`}>
                    {action.icon}
                  </div>
                  <span className="text-sm font-medium text-gray-700">{action.label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
