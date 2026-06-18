import React from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { PageSpinner } from '../../components/ui/Spinner';
import { EmptyState } from '../../components/ui/EmptyState';
import { useNotifications, useMarkAsRead, useMarkAllAsRead } from '../../api/hooks';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

export default function NotificationsPage() {
  const { data, isLoading } = useNotifications({ page: 1, limit: 50 });
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();

  const notifications = data?.items || [];

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead.mutateAsync();
      toast.success('All notifications marked as read');
    } catch {
      toast.error('Failed to mark notifications as read');
    }
  };

  const handleMarkRead = async (id: string) => {
    await markAsRead.mutateAsync(id);
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Stay up to date with activity in your organization"
        actions={
          notifications.some((n: any) => !n.isRead) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleMarkAllRead}
              leftIcon={<CheckCheck className="h-4 w-4" />}
              loading={markAllAsRead.isPending}
            >
              Mark all read
            </Button>
          )
        }
      />

      <Card>
        {isLoading ? (
          <PageSpinner />
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={<Bell className="h-10 w-10" />}
            title="No notifications"
            description="You're all caught up!"
          />
        ) : (
          <div className="divide-y divide-gray-100">
            {notifications.map((notif: any) => (
              <div
                key={notif.id}
                className={`flex items-start gap-4 p-4 hover:bg-gray-50 transition-colors ${!notif.isRead ? 'bg-blue-50/30' : ''}`}
              >
                <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${!notif.isRead ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  <Bell className={`h-4 w-4 ${!notif.isRead ? 'text-blue-600' : 'text-gray-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${!notif.isRead ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'}`}>
                      {notif.title}
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                      </span>
                      {!notif.isRead && (
                        <div className="h-2 w-2 bg-blue-500 rounded-full" />
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">{notif.body}</p>
                  {!notif.isRead && (
                    <button
                      onClick={() => handleMarkRead(notif.id)}
                      className="text-xs text-blue-600 hover:underline mt-1"
                    >
                      Mark as read
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
