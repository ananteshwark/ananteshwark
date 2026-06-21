import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Users,
  Shield,
  GitBranch,
  Bell,
  ClipboardList,
  Settings,
  ChevronDown,
  ChevronRight,
  Building2,
  UserCheck,
  Calculator,
  ShoppingCart,
  Percent,
  X,
  Menu,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path?: string;
  children?: { label: string; path: string }[];
  module?: string;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, path: '/dashboard' },
  {
    label: 'HR',
    icon: <UserCheck className="h-4 w-4" />,
    module: 'hr',
    children: [
      { label: 'Employees', path: '/hr/employees' },
      { label: 'Attendance', path: '/hr/attendance' },
      { label: 'Leave', path: '/hr/leave' },
    ],
  },
  {
    label: 'Finance',
    icon: <Calculator className="h-4 w-4" />,
    module: 'finance',
    children: [
      { label: 'General Ledger', path: '/finance/gl' },
      { label: 'Accounts Receivable', path: '/finance/ar' },
      { label: 'Accounts Payable', path: '/finance/ap' },
    ],
  },
  {
    label: 'Payroll',
    icon: <Building2 className="h-4 w-4" />,
    module: 'payroll',
    children: [
      { label: 'Payroll Runs', path: '/payroll/runs' },
      { label: 'Payslips', path: '/payroll/payslips' },
    ],
  },
  {
    label: 'Procurement',
    icon: <ShoppingCart className="h-4 w-4" />,
    module: 'procurement',
    children: [
      { label: 'Purchase Orders', path: '/procurement/po' },
    ],
  },
  { label: 'Users', icon: <Users className="h-4 w-4" />, path: '/users' },
  { label: 'Roles & Permissions', icon: <Shield className="h-4 w-4" />, path: '/roles' },
  { label: 'Workflows', icon: <GitBranch className="h-4 w-4" />, path: '/workflows' },
  { label: 'Notifications', icon: <Bell className="h-4 w-4" />, path: '/notifications' },
  { label: 'Audit Log', icon: <ClipboardList className="h-4 w-4" />, path: '/audit' },
  {
    label: 'Settings',
    icon: <Settings className="h-4 w-4" />,
    children: [
      { label: 'General', path: '/settings/general' },
      { label: 'Modules', path: '/settings/modules' },
      { label: 'Tax Codes', path: '/settings/tax-codes' },
    ],
  },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export const Sidebar = ({ collapsed = false, onToggle }: SidebarProps) => {
  const [expandedItems, setExpandedItems] = useState<string[]>(['Settings']);
  const { tenant } = useAuthStore();
  const enabledModules = tenant?.settings?.enabledModules || [];
  const location = useLocation();

  const toggleItem = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label],
    );
  };

  const isItemVisible = (item: NavItem) => {
    if (!item.module) return true;
    return enabledModules.includes(item.module);
  };

  return (
    <div
      className={clsx(
        'flex flex-col bg-gray-900 text-gray-100 h-full transition-all duration-300',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-700">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              E
            </div>
            <span className="font-semibold text-white">Enterprise ERP</span>
          </div>
        )}
        {collapsed && (
          <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm mx-auto">
            E
          </div>
        )}
      </div>

      {/* Tenant name */}
      {!collapsed && tenant && (
        <div className="px-4 py-2 text-xs text-gray-400 border-b border-gray-700 truncate">
          {tenant.name}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {navItems.filter(isItemVisible).map((item) => {
          if (item.children) {
            const isExpanded = expandedItems.includes(item.label);
            const isActive = item.children.some(c => location.pathname.startsWith(c.path));

            return (
              <div key={item.label}>
                <button
                  onClick={() => !collapsed && toggleItem(item.label)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                    isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white',
                  )}
                >
                  {item.icon}
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">{item.label}</span>
                      {isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                    </>
                  )}
                </button>
                {!collapsed && isExpanded && (
                  <div className="ml-7 mt-0.5 space-y-0.5">
                    {item.children.map((child) => (
                      <NavLink
                        key={child.path}
                        to={child.path}
                        className={({ isActive }) =>
                          clsx(
                            'block px-3 py-1.5 rounded-lg text-sm transition-colors',
                            isActive
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-400 hover:bg-gray-700 hover:text-white',
                          )
                        }
                      >
                        {child.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          }

          return (
            <NavLink
              key={item.path}
              to={item.path!}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-gray-700 hover:text-white',
                )
              }
            >
              {item.icon}
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};
