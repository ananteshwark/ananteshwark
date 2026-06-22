import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { useAuthStore } from './store/authStore';
import { apiClient } from './api/client';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import OnboardingPage from './pages/onboarding/OnboardingPage';
import DashboardPage from './pages/dashboard/DashboardPage';
import UsersPage from './pages/users/UsersPage';
import InviteUserPage from './pages/users/InviteUserPage';
import RolesPage from './pages/roles/RolesPage';
import WorkflowPage from './pages/workflow/WorkflowPage';
import NotificationsPage from './pages/notifications/NotificationsPage';
import AuditPage from './pages/audit/AuditPage';
import GeneralSettingsPage from './pages/settings/GeneralSettingsPage';
import ModulesSettingsPage from './pages/settings/ModulesSettingsPage';
import LocalizationPage from './pages/settings/LocalizationPage';
import FieldConfigPage from './pages/settings/FieldConfigPage';
import TaxCodesPage from './pages/settings/TaxCodesPage';
import EmailSettingsPage from './pages/settings/EmailSettingsPage';
import {
  ChartOfAccountsPage,
  JournalEntriesPage,
  VendorsPage,
  BillsPage,
  CustomersPage,
  InvoicesPage,
  FinanceReportsPage,
  FixedAssetsPage,
  CurrenciesPage,
  GrirPage,
  CostCenterReportPage,
  ProfitCentersPage,
  BankImportPage,
  PaymentRunPage,
  AdvancesPage,
  BudgetVsActualPage,
} from './pages/finance';
import {
  EmployeesPage,
  DepartmentsPage,
  AttendancePage,
  TimesheetPage,
  LeavePage,
  LeaveApprovalsPage,
  PositionsPage,
  TimeEvaluationPage,
  ExitManagementPage,
  DependentsNomineesPage,
} from './pages/hr';
import {
  PayComponentsPage,
  EmployeeSalaryPage,
  PayrollRunsPage,
  PayrollRunDetailPage,
  PayslipPage,
  PayslipsListPage,
  StatutoryPage,
  PayrollGlMappingsPage,
  RetroPayrollPage,
} from './pages/payroll';
import {
  RequisitionsPage,
  RFQPage,
  PurchaseOrdersPage,
  GRNPage,
  VendorInvoicesPage,
  ProcurementSettingsPage,
  InfoRecordsPage,
  ServiceEntrySheetPage,
  PurchaseReturnsPage,
} from './pages/procurement';
import VendorLoginPage from './pages/vendor/VendorLoginPage';
import VendorPortalPage from './pages/vendor/VendorPortalPage';
import {
  AtsPage,
  OnboardingPage as TalentOnboardingPage,
  LearningPage,
  GoalsPage,
  PerformancePage,
  AppraisalPage,
  SuccessionPage,
} from './pages/talent';
import HiringPage from './pages/hiring/HiringPage';
import { InventoryPage, StockValuationPage } from './pages/inventory';
import { ProjectsPage } from './pages/projects';
import { ExpensesPage } from './pages/expenses';
import { CrmPage } from './pages/crm';
import { SalesOrdersPage, PricingConditionsPage, CreditManagementPage, ATPDashboardPage } from './pages/sales';
import { ESSPage, MSSPage } from './pages/ess';
import { ContractsPage } from './pages/contracts';
import { ManufacturingPage, RoutingsPage, MrpPage, ProductionCostingPage } from './pages/manufacturing';
import { QualityPage } from './pages/quality';
import { MaintenancePage } from './pages/maintenance';
import { BenefitsPage } from './pages/benefits';
import { AnalyticsPage } from './pages/analytics';
import { PlatformPage } from './pages/platform';
import { LicensingPage } from './pages/licensing';
import { TenantsPage } from './pages/admin';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return !isAuthenticated ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

function SuperAdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  return user?.isSuperAdmin ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

export default function App() {
  const { isAuthenticated, setUser, setTenant } = useAuthStore();

  // Refresh the current user + tenant on app load so server-side changes
  // (e.g. super-admin grant, plan/module updates) propagate without a re-login.
  useEffect(() => {
    if (!isAuthenticated) return;
    apiClient
      .get('/auth/me')
      .then((res) => {
        const data = res.data?.data ?? res.data;
        if (data?.user) setUser(data.user);
        if (data?.tenant) setTenant(data.tenant);
      })
      .catch(() => {
        /* 401s are handled by the client interceptor; ignore other errors */
      });
  }, [isAuthenticated, setUser, setTenant]);

  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/onboarding" element={<PrivateRoute><OnboardingPage /></PrivateRoute>} />
      <Route path="/vendor/login" element={<VendorLoginPage />} />
      <Route path="/vendor/portal" element={<VendorPortalPage />} />
      <Route path="/" element={<PrivateRoute><AppLayout /></PrivateRoute>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="users/invite" element={<InviteUserPage />} />
        <Route path="roles" element={<RolesPage />} />
        <Route path="workflows" element={<WorkflowPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="settings/general" element={<GeneralSettingsPage />} />
        <Route path="settings/modules" element={<ModulesSettingsPage />} />
        <Route path="settings/localization" element={<LocalizationPage />} />
        <Route path="settings/field-config" element={<FieldConfigPage />} />
        <Route path="settings/tax-codes" element={<TaxCodesPage />} />
        <Route path="settings/email" element={<EmailSettingsPage />} />
        <Route path="hr/employees" element={<EmployeesPage />} />
        <Route path="hr/departments" element={<DepartmentsPage />} />
        <Route path="hr/positions" element={<PositionsPage />} />
        <Route path="hr/attendance" element={<AttendancePage />} />
        <Route path="hr/time-evaluation" element={<TimeEvaluationPage />} />
        <Route path="hr/timesheets" element={<TimesheetPage />} />
        <Route path="hr/leave" element={<LeavePage />} />
        <Route path="hr/leave/approvals" element={<LeaveApprovalsPage />} />
        <Route path="hr/exits" element={<ExitManagementPage />} />
        <Route path="hr/dependents" element={<DependentsNomineesPage />} />
        <Route path="finance/accounts" element={<ChartOfAccountsPage />} />
        <Route path="finance/journals" element={<JournalEntriesPage />} />
        <Route path="finance/vendors" element={<VendorsPage />} />
        <Route path="finance/bills" element={<BillsPage />} />
        <Route path="finance/customers" element={<CustomersPage />} />
        <Route path="finance/invoices" element={<InvoicesPage />} />
        <Route path="finance/reports" element={<FinanceReportsPage />} />
        <Route path="finance/fixed-assets" element={<FixedAssetsPage />} />
        <Route path="finance/currencies" element={<CurrenciesPage />} />
        <Route path="finance/grir" element={<GrirPage />} />
        <Route path="finance/cost-center-report" element={<CostCenterReportPage />} />
        <Route path="finance/profit-centers" element={<ProfitCentersPage />} />
        <Route path="finance/bank-import" element={<BankImportPage />} />
        <Route path="finance/payment-runs" element={<PaymentRunPage />} />
        <Route path="finance/advances" element={<AdvancesPage />} />
        <Route path="finance/budget" element={<BudgetVsActualPage />} />
        <Route path="payroll/components" element={<PayComponentsPage />} />
        <Route path="payroll/salaries" element={<EmployeeSalaryPage />} />
        <Route path="payroll/runs" element={<PayrollRunsPage />} />
        <Route path="payroll/runs/:id" element={<PayrollRunDetailPage />} />
        <Route path="payroll/payslips" element={<PayslipsListPage />} />
        <Route path="payroll/payslips/:id" element={<PayslipPage />} />
        <Route path="payroll/statutory" element={<StatutoryPage />} />
        <Route path="payroll/gl-mappings" element={<PayrollGlMappingsPage />} />
        <Route path="payroll/retro" element={<RetroPayrollPage />} />
        <Route path="procurement/requisitions" element={<RequisitionsPage />} />
        <Route path="procurement/rfq" element={<RFQPage />} />
        <Route path="procurement/purchase-orders" element={<PurchaseOrdersPage />} />
        <Route path="procurement/grn" element={<GRNPage />} />
        <Route path="procurement/vendor-invoices" element={<VendorInvoicesPage />} />
        <Route path="procurement/settings" element={<ProcurementSettingsPage />} />
        <Route path="procurement/info-records" element={<InfoRecordsPage />} />
        <Route path="procurement/service-entries" element={<ServiceEntrySheetPage />} />
        <Route path="procurement/returns" element={<PurchaseReturnsPage />} />
        <Route path="talent/hiring" element={<HiringPage />} />
        <Route path="talent/ats" element={<AtsPage />} />
        <Route path="talent/onboarding" element={<TalentOnboardingPage />} />
        <Route path="talent/learning" element={<LearningPage />} />
        <Route path="talent/goals" element={<GoalsPage />} />
        <Route path="talent/performance" element={<PerformancePage />} />
        <Route path="talent/appraisal" element={<AppraisalPage />} />
        <Route path="talent/succession" element={<SuccessionPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/valuation" element={<StockValuationPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="crm" element={<CrmPage />} />
        <Route path="sales/orders" element={<SalesOrdersPage />} />
        <Route path="sales/pricing" element={<PricingConditionsPage />} />
        <Route path="sales/credit" element={<CreditManagementPage />} />
        <Route path="sales/atp" element={<ATPDashboardPage />} />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="manufacturing" element={<ManufacturingPage />} />
        <Route path="manufacturing/routings" element={<RoutingsPage />} />
        <Route path="manufacturing/mrp" element={<MrpPage />} />
        <Route path="manufacturing/costing" element={<ProductionCostingPage />} />
        <Route path="quality" element={<QualityPage />} />
        <Route path="maintenance" element={<MaintenancePage />} />
        <Route path="benefits" element={<BenefitsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="platform" element={<PlatformPage />} />
        <Route path="licensing" element={<LicensingPage />} />
        <Route path="admin/tenants" element={<SuperAdminRoute><TenantsPage /></SuperAdminRoute>} />
        <Route path="ess" element={<ESSPage />} />
        <Route path="mss" element={<MSSPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
