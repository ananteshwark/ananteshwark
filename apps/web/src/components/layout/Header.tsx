import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Search, ChevronDown, LogOut, User, Settings, Menu } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useNotificationStore } from '../../store/notificationStore';
import { Avatar } from '../ui/Avatar';
import { useUnreadCount } from '../../api/hooks';
import { useTranslation } from 'react-i18next';

interface HeaderProps {
  onMenuToggle?: () => void;
}

export const Header = ({ onMenuToggle }: HeaderProps) => {
  const { user, logout } = useAuthStore();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const { data: unreadData } = useUnreadCount();
  const unreadCount = unreadData?.count || 0;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const fullName = user ? `${user.firstName} ${user.lastName}` : '';

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
        {/* Search placeholder */}
        <div className="hidden md:flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-1.5 w-64">
          <Search className="h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('common.search', 'Search...')}
            className="bg-transparent text-sm outline-none flex-1 placeholder-gray-400"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Language switcher */}
        <button
          onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'hi' : 'en')}
          className="text-xs font-medium text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
        >
          {i18n.language === 'en' ? 'EN' : 'HI'}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => { setShowNotifications(!showNotifications); setShowUserMenu(false); }}
            className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 h-4 w-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {showNotifications && (
            <div className="absolute right-0 mt-1 w-80 bg-white rounded-xl border border-gray-200 shadow-lg z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="font-semibold text-sm">Notifications</p>
              </div>
              <div className="p-4 text-center text-sm text-gray-500">
                <button
                  onClick={() => { navigate('/notifications'); setShowNotifications(false); }}
                  className="text-blue-600 hover:underline"
                >
                  View all notifications
                </button>
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => { setShowUserMenu(!showUserMenu); setShowNotifications(false); }}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Avatar name={fullName} size="sm" />
            <span className="hidden md:block text-sm font-medium text-gray-700">{fullName}</span>
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </button>
          {showUserMenu && (
            <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl border border-gray-200 shadow-lg z-50 py-1">
              <button
                onClick={() => { navigate('/users/me'); setShowUserMenu(false); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <User className="h-4 w-4" />
                Profile
              </button>
              <button
                onClick={() => { navigate('/settings/general'); setShowUserMenu(false); }}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
