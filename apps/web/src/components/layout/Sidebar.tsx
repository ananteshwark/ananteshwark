import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  LayoutDashboard,
  Sparkles,
  Users,
  Shield,
  GitBranch,
  Smartphone,
  Bot,
  UserCog,
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
  QrCode,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useMyPermissions } from '../../api/hooks';
import { LanguageSelector } from '../i18n/LanguageSelector';

interface NavItem {
  label: string;
  icon: React.ReactNode;
  path?: string;
  children?: { label: string; path: string; end?: boolean }[];
  module?: string;
  superAdmin?: boolean;
}

type SectionKey = 'workspace' | 'modules' | 'admin';

// Sidebar is split into an employee-facing workspace, the operational
// business modules, and an admin/configuration area. The admin section is
// only shown to users with administrative permissions.
const SECTIONS: { key: SectionKey; title: string; adminOnly?: boolean }[] = [
  { key: 'workspace', title: 'My Workspace' },
  { key: 'modules', title: 'Modules' },
  { key: 'admin', title: 'Administration', adminOnly: true },
];

const WORKSPACE_LABELS = new Set(['Dashboard', 'My Portal', 'Expenses', 'Delegations', 'Notifications', 'Assistant', 'QR Scanner', 'Mobile']);
const ADMIN_LABELS = new Set(['Users', 'Roles & Permissions', 'Workflows', 'Audit Log', 'Platform', 'Licensing', 'Tenant Management', 'Settings']);

const sectionOf = (item: NavItem): SectionKey =>
  ADMIN_LABELS.has(item.label) ? 'admin' : WORKSPACE_LABELS.has(item.label) ? 'workspace' : 'modules';

// Any of these permissions marks a user as an administrator for nav purposes.
const ADMIN_MARKERS = ['admin:manage', 'settings:manage', 'settings:modules:read', 'rbac:roles:read', 'users:users:read'];

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
      { label: 'Skills & Intelligence', path: '/hr/skills' },
      { label: 'Headcount Budgeting', path: '/hr/headcount' },
      { label: 'Time & Labor', path: '/hr/time-labor' },
    ],
  },
  {
    label: 'Employee Experience',
    icon: <Sparkles className="h-4 w-4" />,
    module: 'hr',
    children: [
      { label: 'Company Feed', path: '/engagement/feed' },
      { label: 'Recognition', path: '/engagement/recognition' },
      { label: 'Surveys & Pulse', path: '/engagement/surveys' },
      { label: 'HR Helpdesk', path: '/engagement/helpdesk' },
      { label: 'HR Letters', path: '/engagement/letters' },
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
      { label: 'Budget vs Actual', path: '/finance/budget' },
      { label: 'Internal Orders', path: '/finance/internal-orders' },
      { label: 'Activity-Based Costing', path: '/finance/activity-costing' },
      { label: 'Period Close Cockpit', path: '/finance/period-close' },
      { label: 'Treasury', path: '/finance/treasury' },
      { label: 'Intercompany', path: '/finance/intercompany' },
      { label: 'Consolidation', path: '/finance/consolidation' },
      { label: 'Parallel Ledgers', path: '/finance/parallel-ledgers' },
      { label: 'Cash Discounts', path: '/finance/cash-discounts' },
      { label: 'Revenue Recognition', path: '/finance/revenue-recognition' },
      { label: 'Lease Accounting', path: '/finance/leases' },
      { label: 'Subledger Accounting', path: '/finance/subledger-accounting' },
      { label: 'COA Structure', path: '/finance/coa-structure' },
      { label: 'Withholding Tax', path: '/finance/withholding-tax' },
      { label: 'Collections', path: '/finance/collections' },
      { label: 'AR Lockbox', path: '/finance/lockbox' },
      { label: 'Tax Engine', path: '/finance/tax-engine' },
      { label: 'Encumbrance', path: '/finance/encumbrance' },
      { label: 'Cash Forecast', path: '/finance/cash-forecast' },
      { label: 'Close Management', path: '/finance/close-management' },
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
      { label: 'Pay Components', path: '/payroll/components' },
      { label: 'Employee Salaries', path: '/payroll/salaries' },
      { label: 'Statutory', path: '/payroll/statutory' },
      { label: 'Retro Payroll', path: '/payroll/retro' },
      { label: 'Legislative Data Groups', path: '/payroll/ldg' },
      { label: 'Payroll Costing', path: '/payroll/costing' },
      { label: 'Statutory Forms', path: '/payroll/statutory-forms' },
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
      { label: 'Strategic Sourcing', path: '/procurement/sourcing' },
      { label: 'Supplier Qualification', path: '/procurement/supplier-qualification' },
      { label: 'Spend Analysis', path: '/procurement/spend-analysis' },
      { label: 'Purchase Orders', path: '/procurement/purchase-orders' },
      { label: 'Goods Receipts', path: '/procurement/grn' },
      { label: 'Vendor Invoices', path: '/procurement/vendor-invoices' },
      { label: 'Info Records', path: '/procurement/info-records' },
      { label: 'Service Entries', path: '/procurement/service-entries' },
      { label: 'Returns to Vendor', path: '/procurement/returns' },
      { label: 'Tolerance Settings', path: '/procurement/tolerance' },
      { label: 'Outline Agreements', path: '/procurement/outline-agreements' },
      { label: 'Source Determination', path: '/procurement/source-determination' },
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
      { label: 'Background Verification', path: '/talent/bgv' },
    ],
  },
  {
    label: 'Inventory',
    icon: <Package className="h-4 w-4" />,
    module: 'inventory',
    children: [
      { label: 'Overview', path: '/inventory' },
      { label: 'Stock Valuation', path: '/inventory/valuation' },
      { label: 'Multi-Org', path: '/inventory/multi-org' },
      { label: 'Cost Accounting', path: '/inventory/costing' },
      { label: 'Lot Genealogy', path: '/inventory/genealogy' },
      { label: 'Special Procurement', path: '/inventory/special-procurement' },
      { label: 'Warehouse Mgmt (WMS)', path: '/inventory/wms' },
      { label: 'Transportation', path: '/logistics/transportation' },
    ],
  },
  {
    label: 'Projects', icon: <FolderOpen className="h-4 w-4" />, module: 'projects',
    children: [
      { label: 'Projects', path: '/projects', end: true },
      { label: 'Billing & Revenue', path: '/projects/billing' },
      { label: 'Resource Management', path: '/projects/resources' },
      { label: 'Earned Value (EVM)', path: '/projects/evm' },
      { label: 'Capital & CIP', path: '/projects/capital' },
    ],
  },
  {
    label: 'Expenses', icon: <Receipt className="h-4 w-4" />, module: 'expenses',
    children: [
      { label: 'Expense Claims', path: '/expenses' },
      { label: 'Travel Requests', path: '/expenses/travel' },
    ],
  },
  {
    label: 'CRM',
    icon: <Users2 className="h-4 w-4" />,
    module: 'crm',
    children: [
      { label: 'Overview', path: '/crm', end: true },
      { label: 'Customer 360', path: '/crm/customer-360' },
      { label: 'Service Tickets', path: '/crm/tickets' },
      { label: 'SLA Policies', path: '/crm/sla' },
      { label: 'Sales Forecasting', path: '/crm/forecasting' },
      { label: 'Territories & Quotas', path: '/crm/territories' },
      { label: 'Service Desk', path: '/crm/service-desk' },
    ],
  },
  {
    label: 'Marketing', icon: <Target className="h-4 w-4" />, module: 'crm',
    children: [
      { label: 'Automation', path: '/marketing' },
    ],
  },
  {
    label: 'Sales',
    icon: <TrendingUp className="h-4 w-4" />,
    module: 'sales',
    children: [
      { label: 'Sales Orders', path: '/sales/orders' },
      { label: 'Billing Plans', path: '/sales/billing-plans' },
      { label: 'Pricing', path: '/sales/pricing' },
      { label: 'Credit Management', path: '/sales/credit' },
      { label: 'ATP Dashboard', path: '/sales/atp' },
      { label: 'Returns & Credit Notes', path: '/sales/returns' },
      { label: 'Deliveries', path: '/sales/deliveries' },
      { label: 'Fulfillment', path: '/sales/fulfillment' },
      { label: 'Order Promising', path: '/sales/promising' },
      { label: 'CPQ', path: '/sales/cpq' },
      { label: 'Configure-to-Order', path: '/sales/cto' },
      { label: 'Incentive Comp', path: '/sales/incentive' },
    ],
  },
  {
    label: 'Contracts', icon: <FileText className="h-4 w-4" />, module: 'contracts',
    children: [
      { label: 'Contracts', path: '/contracts' },
      { label: 'Lifecycle (CLM)', path: '/contracts/clm' },
    ],
  },
  {
    label: 'Manufacturing',
    icon: <Package className="h-4 w-4" />,
    module: 'manufacturing',
    children: [
      { label: 'Overview', path: '/manufacturing', end: true },
      { label: 'Routings', path: '/manufacturing/routings' },
      { label: 'Flow / Repetitive (FCS)', path: '/manufacturing/fcs' },
      { label: 'Demand Planning', path: '/planning/demand' },
      { label: 'MRP', path: '/manufacturing/mrp' },
      { label: 'Capacity Planning', path: '/manufacturing/crp' },
      { label: 'Quality at Operations', path: '/manufacturing/op-quality' },
      { label: 'Process Manufacturing', path: '/manufacturing/process' },
      { label: 'Costing', path: '/manufacturing/costing' },
    ],
  },
  {
    label: 'Quality',
    icon: <ClipboardCheck className="h-4 w-4" />,
    module: 'quality',
    children: [
      { label: 'Overview', path: '/quality', end: true },
      { label: 'Characteristics', path: '/quality/characteristics' },
      { label: 'Results Recording', path: '/quality/results' },
    ],
  },
  {
    label: 'Maintenance',
    icon: <Wrench className="h-4 w-4" />,
    module: 'maintenance',
    children: [
      { label: 'Overview', path: '/maintenance', end: true },
      { label: 'Functional Locations', path: '/maintenance/functional-locations' },
      { label: 'Counter Readings', path: '/maintenance/counter-readings' },
      { label: 'CMMS (Parts/Warranty)', path: '/maintenance/cmms' },
    ],
  },
  {
    label: 'Benefits', icon: <HeartHandshake className="h-4 w-4" />, module: 'benefits',
    children: [
      { label: 'Overview', path: '/benefits' },
      { label: 'Enrollment & Life Events', path: '/benefits/enrollment' },
      { label: 'Compensation Workbench', path: '/benefits/comp-workbench' },
    ],
  },
  {
    label: 'Analytics',
    icon: <BarChart2 className="h-4 w-4" />,
    module: 'analytics',
    children: [
      { label: 'Overview', path: '/analytics', end: true },
      { label: 'Cross-Module KPIs', path: '/analytics/cross' },
      { label: 'AI Anomalies', path: '/analytics/anomalies' },
      { label: 'Report Builder (BI)', path: '/analytics/bi' },
    ],
  },
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
  {
    label: 'Users', icon: <Users className="h-4 w-4" />,
    children: [
      { label: 'All Users', path: '/users', end: true },
      { label: 'Invite User', path: '/users/invite' },
    ],
  },
  { label: 'Roles & Permissions', icon: <Shield className="h-4 w-4" />, path: '/roles' },
  {
    label: 'Workflows', icon: <GitBranch className="h-4 w-4" />,
    children: [
      { label: 'Workflows', path: '/workflows', end: true },
      { label: 'BPM Engine', path: '/workflows/bpm' },
      { label: 'Automation', path: '/workflows/automation' },
    ],
  },
  { label: 'Mobile', icon: <Smartphone className="h-4 w-4" />, path: '/mobile' },
  { label: 'Assistant', icon: <Bot className="h-4 w-4" />, path: '/assistant' },
  { label: 'Delegations', icon: <UserCog className="h-4 w-4" />, path: '/delegations' },
  { label: 'Notifications', icon: <Bell className="h-4 w-4" />, path: '/notifications' },
  { label: 'Audit Log', icon: <ClipboardList className="h-4 w-4" />, path: '/audit' },
  {
    label: 'QR Scanner',
    icon: <QrCode className="h-4 w-4" />,
    path: '/qr/scanner',
  },
  {
    label: 'Settings',
    icon: <Settings className="h-4 w-4" />,
    children: [
      { label: 'General', path: '/settings/general' },
      { label: 'Modules', path: '/settings/modules' },
      { label: 'Dropdown Options', path: '/settings/picklists' },
      { label: 'Localization', path: '/settings/localization' },
      { label: 'Field Configuration', path: '/settings/field-config' },
      { label: 'Custom Fields', path: '/settings/custom-fields' },
      { label: 'Webhooks', path: '/settings/webhooks' },
      { label: 'SSO', path: '/settings/sso' },
      { label: 'EDI Integration', path: '/settings/edi' },
      { label: 'Data Privacy & GDPR', path: '/settings/privacy' },
      { label: 'Security Hardening', path: '/settings/security' },
      { label: 'Integration Framework', path: '/settings/integration' },
      { label: 'Languages (i18n)', path: '/settings/i18n' },
      { label: 'Audit & GRC', path: '/settings/grc' },
      { label: 'Extensibility', path: '/settings/extensibility' },
      { label: 'Marketplace', path: '/settings/marketplace' },
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
  const { data: myPermissions } = useMyPermissions();
  // Modules the super admin assigned on the license. When known, a tenant user
  // is never shown a module outside this set, even if tenant settings drifted.
  const licensedModules = tenant?.licensedModules;
  // Modules active for this tenant. Default active: a tenant that has never
  // customized runs every licensed module, so fall back to the licensed set.
  const enabledModules = tenant?.settings?.enabledModules ?? licensedModules ?? [];
  const location = useLocation();

  const isAdmin = !!user?.isSuperAdmin || ADMIN_MARKERS.some((p) => (myPermissions ?? []).includes(p));

  const toggleItem = (label: string) => {
    setExpandedItems((prev) =>
      prev.includes(label) ? prev.filter((i) => i !== label) : [...prev, label],
    );
  };

  const isItemVisible = (item: NavItem) => {
    if (item.superAdmin && !user?.isSuperAdmin) return false;
    if (!item.module) return true;
    if (!enabledModules.includes(item.module)) return false;
    // Tenant users only see modules the platform assigned on the license.
    if (!user?.isSuperAdmin && Array.isArray(licensedModules) && !licensedModules.includes(item.module)) {
      return false;
    }
    return true;
  };

  const renderItem = (item: NavItem) => {
    if (item.children) {
      const isExpanded = expandedItems.includes(item.label);
      const isActive = item.children.some((c) => location.pathname.startsWith(c.path));

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
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
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
                      isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white',
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
            isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white',
          )
        }
      >
        {item.icon}
        {!collapsed && <span>{item.label}</span>}
      </NavLink>
    );
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
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-2">
        {SECTIONS.map((section) => {
          if (section.adminOnly && !isAdmin) return null;
          const items = navItems.filter((it) => sectionOf(it) === section.key).filter(isItemVisible);
          if (items.length === 0) return null;
          return (
            <div key={section.key} className="space-y-0.5">
              {!collapsed && (
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {section.title}
                </p>
              )}
              {collapsed && section.key !== 'workspace' && <div className="mx-3 my-2 border-t border-gray-700" />}
              {items.map(renderItem)}
            </div>
          );
        })}
      </nav>

      {/* Language selector at bottom */}
      <div className="border-t border-gray-700 px-3 py-3">
        <LanguageSelector compact={collapsed} />
      </div>
    </div>
  );
};
