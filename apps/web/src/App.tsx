import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { useAuthStore } from './store/authStore';
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
import {
  ChartOfAccountsPage,
  JournalEntriesPage,
  VendorsPage,
  BillsPage,
  CustomersPage,
  InvoicesPage,
  FinanceReportsPage,
  FixedAssetsPage,
} from './pages/finance';
import {
  EmployeesPage,
  DepartmentsPage,
  AttendancePage,
  TimesheetPage,
  LeavePage,
  LeaveApprovalsPage,
} from './pages/hr';
import {
  PayComponentsPage,
  EmployeeSalaryPage,
  PayrollRunsPage,
  PayrollRunDetailPage,
  PayslipPage,
  StatutoryPage,
} from './pages/payroll';
import {
  RequisitionsPage,
  RFQPage,
  PurchaseOrdersPage,
  GRNPage,
} from './pages/procurement';
import {
  AtsPage,
  OnboardingPage as TalentOnboardingPage,
  LearningPage,
  GoalsPage,
  PerformancePage,
  AppraisalPage,
  SuccessionPage,
} from './pages/talent';
import { InventoryPage } from './pages/inventory';
import { ProjectsPage } from './pages/projects';
import { ExpensesPage } from './pages/expenses';
import { CrmPage } from './pages/crm';
import { SalesOrdersPage } from './pages/sales';
import { ESSPage, MSSPage } from './pages/ess';
import { ContractsPage } from './pages/contracts';
import { ManufacturingPage } from './pages/manufacturing';
import { QualityPage } from './pages/quality';
import { MaintenancePage } from './pages/maintenance';
import { BenefitsPage } from './pages/benefits';
import { AnalyticsPage } from './pages/analytics';
import { PlatformPage } from './pages/platform';
import { LicensingPage } from './pages/licensing';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  return !isAuthenticated ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/onboarding" element={<PrivateRoute><OnboardingPage /></PrivateRoute>} />
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
        <Route path="hr/employees" element={<EmployeesPage />} />
        <Route path="hr/departments" element={<DepartmentsPage />} />
        <Route path="hr/attendance" element={<AttendancePage />} />
        <Route path="hr/timesheets" element={<TimesheetPage />} />
        <Route path="hr/leave" element={<LeavePage />} />
        <Route path="hr/leave/approvals" element={<LeaveApprovalsPage />} />
        <Route path="finance/accounts" element={<ChartOfAccountsPage />} />
        <Route path="finance/journals" element={<JournalEntriesPage />} />
        <Route path="finance/vendors" element={<VendorsPage />} />
        <Route path="finance/bills" element={<BillsPage />} />
        <Route path="finance/customers" element={<CustomersPage />} />
        <Route path="finance/invoices" element={<InvoicesPage />} />
        <Route path="finance/reports" element={<FinanceReportsPage />} />
        <Route path="finance/fixed-assets" element={<FixedAssetsPage />} />
        <Route path="payroll/components" element={<PayComponentsPage />} />
        <Route path="payroll/salaries" element={<EmployeeSalaryPage />} />
        <Route path="payroll/runs" element={<PayrollRunsPage />} />
        <Route path="payroll/runs/:id" element={<PayrollRunDetailPage />} />
        <Route path="payroll/payslips/:id" element={<PayslipPage />} />
        <Route path="payroll/statutory" element={<StatutoryPage />} />
        <Route path="procurement/requisitions" element={<RequisitionsPage />} />
        <Route path="procurement/rfq" element={<RFQPage />} />
        <Route path="procurement/purchase-orders" element={<PurchaseOrdersPage />} />
        <Route path="procurement/grn" element={<GRNPage />} />
        <Route path="talent/ats" element={<AtsPage />} />
        <Route path="talent/onboarding" element={<TalentOnboardingPage />} />
        <Route path="talent/learning" element={<LearningPage />} />
        <Route path="talent/goals" element={<GoalsPage />} />
        <Route path="talent/performance" element={<PerformancePage />} />
        <Route path="talent/appraisal" element={<AppraisalPage />} />
        <Route path="talent/succession" element={<SuccessionPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="crm" element={<CrmPage />} />
        <Route path="sales/orders" element={<SalesOrdersPage />} />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="manufacturing" element={<ManufacturingPage />} />
        <Route path="quality" element={<QualityPage />} />
        <Route path="maintenance" element={<MaintenancePage />} />
        <Route path="benefits" element={<BenefitsPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="platform" element={<PlatformPage />} />
        <Route path="licensing" element={<LicensingPage />} />
        <Route path="ess" element={<ESSPage />} />
        <Route path="mss" element={<MSSPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
