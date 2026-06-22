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
  Briefcase,
  Target,
  Package,
  FolderOpen,
  Receipt,
  Users2,
  TrendingUp,
  FileText,
  ClipboardCheck,
  Wrench,
  HeartHandshake,
  BarChart2,
  X,
  Menu,
  Key,
  SlidersHorizontal,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path?: string;
  children?: { label: string; path: string; end?: boolean }[];
  module?: string;
  superAdmin?: boolean;
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, path: '/dashboard' },
  {
    label: 'HR',
    icon: <UserCheck className="h-4 w-4" />,
    module: 'hr',
    children: [
      { label: 'Employees', path: '/hr/employees' },
      { label: 'Organization', path: '/hr/departments' },
      { label: 'Positions', path: '/hr/positions' },
      { label: 'Attendance', path: '/hr/attendance' },
      { label: 'Time Evaluation', path: '/hr/time-evaluation' },
      { label: 'Timesheets', path: '/hr/timesheets' },
      { label: 'Leave', path: '/hr/leave' },
      { label: 'Leave Approvals', path: '/hr/leave/approvals' },
      { label: 'Exit Management', path: '/hr/exits' },
      { label: 'Dependents & Nominees', path: '/hr/dependents' },
    ],
  },
  {
    label: 'Finance',
    icon: <Calculator className="h-4 w-4" />,
    module: 'finance',
    children: [
      { label: 'Chart of Accounts', path: '/finance/accounts' },
      { label: 'Journal Entries', path: '/finance/journals' },
      { label: 'Vendors', path: '/finance/vendors' },
      { label: 'Bills', path: '/finance/bills' },
      { label: 'Customers', path: '/finance/customers' },
      { label: 'Invoices', path: '/finance/invoices' },
      { label: 'Fixed Assets', path: '/finance/fixed-assets' },
      { label: 'Currencies', path: '/finance/currencies' },
      { label: 'GR/IR Reconciliation', path: '/finance/grir' },
      { label: 'Cost Centers', path: '/finance/cost-center-report' },
      { label: 'Profit Centers', path: '/finance/profit-centers' },
      { label: 'Bank Import', path: '/finance/bank-import' },
      { label: 'Payment Run', path: '/finance/payment-runs' },
      { label: 'Advances', path: '/finance/advances' },
      { label: 'Reports', path: '/finance/reports' },
    ],
  },
  {
    label: 'Payroll',
    icon: <Building2 className="h-4 w-4" />,
    module: 'payroll',
    children: [
      { label: 'Payroll Runs', path: '/payroll/runs' },
      { label: 'Payslips', path: '/payroll/payslips' },
      { label: 'Retro Payroll', path: '/payroll/retro' },
      { label: 'GL Mappings', path: '/payroll/gl-mappings' },
    ],
  },
  {
    label: 'Procurement',
    icon: <ShoppingCart className="h-4 w-4" />,
    module: 'procurement',
    children: [
      { label: 'Requisitions', path: '/procurement/requisitions' },
      { label: 'RFQ', path: '/procurement/rfq' },
      { label: 'Purchase Orders', path: '/procurement/purchase-orders' },
      { label: 'Goods Receipts', path: '/procurement/grn' },
      { label: 'Vendor Invoices', path: '/procurement/vendor-invoices' },
      { label: 'Info Records', path: '/procurement/info-records' },
      { label: 'Service Entries', path: '/procurement/service-entries' },
      { label: 'Returns to Vendor', path: '/procurement/returns' },
      { label: 'Settings', path: '/procurement/settings' },
    ],
  },
  {
    label: 'Talent',
    icon: <Briefcase className="h-4 w-4" />,
    module: 'talent',
    children: [
      { label: 'Hiring', path: '/talent/hiring' },
      { label: 'ATS', path: '/talent/ats' },
      { label: 'Onboarding', path: '/talent/onboarding' },
      { label: 'Learning', path: '/talent/learning' },
      { label: 'Goals & OKRs', path: '/talent/goals' },
      { label: 'Performance', path: '/talent/performance' },
      { label: 'Appraisal', path: '/talent/appraisal' },
      { label: 'Succession', path: '/talent/succession' },
    ],
  },
  {
    label: 'Inventory',
    icon: <Package className="h-4 w-4" />,
    module: 'inventory',
    children: [
      { label: 'Overview', path: '/inventory' },
      { label: 'Stock Valuation', path: '/inventory/valuation' },
    ],
  },
  { label: 'Projects', icon: <FolderOpen className="h-4 w-4" />, path: '/projects', module: 'projects' },
  { label: 'Expenses', icon: <Receipt className="h-4 w-4" />, path: '/expenses', module: 'expenses' },
  { label: 'CRM', icon: <Users2 className="h-4 w-4" />, path: '/crm', module: 'crm' },
  {
    label: 'Sales',
    icon: <TrendingUp className="h-4 w-4" />,
    module: 'sales',
    children: [
      { label: 'Sales Orders', path: '/sales/orders' },
      { label: 'Pricing', path: '/sales/pricing' },
      { label: 'Credit Management', path: '/sales/credit' },
      { label: 'ATP Dashboard', path: '/sales/atp' },
    ],
  },
  { label: 'Contracts', icon: <FileText className="h-4 w-4" />, path: '/contracts', module: 'contracts' },
  {
    label: 'Manufacturing',
    icon: <Package className="h-4 w-4" />,
    module: 'manufacturing',
    children: [
      { label: 'Overview', path: '/manufacturing', end: true },
      { label: 'Routings', path: '/manufacturing/routings' },
      { label: 'MRP', path: '/manufacturing/mrp' },
      { label: 'Costing', path: '/manufacturing/costing' },
    ],
  },
  { label: 'Quality', icon: <ClipboardCheck className="h-4 w-4" />, path: '/quality', module: 'quality' },
  { label: 'Maintenance', icon: <Wrench className="h-4 w-4" />, path: '/maintenance', module: 'maintenance' },
  { label: 'Benefits', icon: <HeartHandshake className="h-4 w-4" />, path: '/benefits', module: 'benefits' },
  { label: 'Analytics', icon: <BarChart2 className="h-4 w-4" />, path: '/analytics', module: 'analytics' },
  { label: 'Platform', icon: <Shield className="h-4 w-4" />, path: '/platform', module: 'platform' },
  { label: 'Licensing', icon: <Key className="h-4 w-4" />, path: '/licensing', module: 'licensing' },
  { label: 'Tenant Management', icon: <Building2 className="h-4 w-4" />, path: '/admin/tenants', superAdmin: true },
  {
    label: 'My Portal',
    icon: <UserCheck className="h-4 w-4" />,
    children: [
      { label: 'Employee Self-Service', path: '/ess' },
      { label: 'Manager Self-Service', path: '/mss' },
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
      { label: 'Localization', path: '/settings/localization' },
      { label: 'Field Configuration', path: '/settings/field-config' },
      { label: 'Tax Codes', path: '/settings/tax-codes' },
      { label: 'Email Settings', path: '/settings/email' },
    ],
  },
];

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export const Sidebar = ({ collapsed = false, onToggle }: SidebarProps) => {
  const [expandedItems, setExpandedItems] = useState<string[]>(['Settings']);
  const { tenant, user } = useAuthStore();
  const enabledModules = tenant?.settings?.enabledModules || [];
  const location = useLocation();

  const toggleItem = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label],
    );
  };

  const isItemVisible = (item: NavItem) => {
    if (item.superAdmin && !user?.isSuperAdmin) return false;
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
                        end={child.end}
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
