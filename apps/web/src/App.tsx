
import { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PwaInstallPrompt } from './components/pwa/PwaInstallPrompt';
import { AppLayout } from './components/layout/AppLayout';
import { useAuthStore } from './store/authStore';
import { apiClient } from './api/client';

// Route components are code-split: each page (or page barrel) becomes its own
// chunk fetched on navigation, instead of one ~2.3 MB bundle every user
// downloads up front to reach a single screen.
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const OnboardingPage = lazy(() => import('./pages/onboarding/OnboardingPage'));
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage'));
const UsersPage = lazy(() => import('./pages/users/UsersPage'));
const InviteUserPage = lazy(() => import('./pages/users/InviteUserPage'));
const RolesPage = lazy(() => import('./pages/roles/RolesPage'));
const WorkflowPage = lazy(() => import('./pages/workflow/WorkflowPage'));
const BpmPage = lazy(() => import('./pages/workflow/BpmPage'));
const AutomationPage = lazy(() => import('./pages/workflows/AutomationPage'));
const AnomaliesPage = lazy(() => import('./pages/analytics/AnomaliesPage'));
const FeedPage = lazy(() => import('./pages/engagement/FeedPage'));
const RecognitionPage = lazy(() => import('./pages/engagement/RecognitionPage'));
const SurveysPage = lazy(() => import('./pages/engagement/SurveysPage'));
const HelpdeskPage = lazy(() => import('./pages/helpdesk/HelpdeskPage'));
const TravelPage = lazy(() => import('./pages/travel/TravelPage'));
const LettersPage = lazy(() => import('./pages/letters/LettersPage'));
const BgvPage = lazy(() => import('./pages/talent/BgvPage'));
const MobilePage = lazy(() => import('./pages/mobile/MobilePage'));
const AssistantPage = lazy(() => import('./pages/assistant/AssistantPage'));
const PrivacyPage = lazy(() => import('./pages/privacy/PrivacyPage'));
const SecurityPage = lazy(() => import('./pages/security/SecurityPage'));
const IntegrationPage = lazy(() => import('./pages/integration/IntegrationPage'));
const I18nPage = lazy(() => import('./pages/localization/I18nPage'));
const GrcPage = lazy(() => import('./pages/grc/GrcPage'));
const ExtensibilityPage = lazy(() => import('./pages/extensibility/ExtensibilityPage'));
const MarketplacePage = lazy(() => import('./pages/settings/MarketplacePage'));
const DelegationPage = lazy(() => import('./pages/delegation/DelegationPage'));
const NotificationsPage = lazy(() => import('./pages/notifications/NotificationsPage'));
const AuditPage = lazy(() => import('./pages/audit/AuditPage'));
const GeneralSettingsPage = lazy(() => import('./pages/settings/GeneralSettingsPage'));
const ModulesSettingsPage = lazy(() => import('./pages/settings/ModulesSettingsPage'));
const LocalizationPage = lazy(() => import('./pages/settings/LocalizationPage'));
const FieldConfigPage = lazy(() => import('./pages/settings/FieldConfigPage'));
const PicklistsPage = lazy(() => import('./pages/settings/PicklistsPage'));
const CustomFieldsPage = lazy(() => import('./pages/settings/CustomFieldsPage'));
const WebhooksPage = lazy(() => import('./pages/settings/WebhooksPage'));
const SsoSettingsPage = lazy(() => import('./pages/settings/SsoSettingsPage'));
const QrScannerPage = lazy(() => import('./pages/qr/QrScannerPage'));
const EdiPage = lazy(() => import('./pages/settings/EdiPage'));
const TaxCodesPage = lazy(() => import('./pages/settings/TaxCodesPage'));
const EmailSettingsPage = lazy(() => import('./pages/settings/EmailSettingsPage'));
const ChartOfAccountsPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.ChartOfAccountsPage })));
const JournalEntriesPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.JournalEntriesPage })));
const VendorsPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.VendorsPage })));
const BillsPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.BillsPage })));
const CustomersPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.CustomersPage })));
const InvoicesPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.InvoicesPage })));
const FinanceReportsPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.FinanceReportsPage })));
const FixedAssetsPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.FixedAssetsPage })));
const CurrenciesPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.CurrenciesPage })));
const GrirPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.GrirPage })));
const CostCenterReportPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.CostCenterReportPage })));
const ProfitCentersPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.ProfitCentersPage })));
const BankImportPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.BankImportPage })));
const PaymentRunPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.PaymentRunPage })));
const AdvancesPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.AdvancesPage })));
const IntercompanyPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.IntercompanyPage })));
const BudgetVsActualPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.BudgetVsActualPage })));
const InternalOrdersPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.InternalOrdersPage })));
const PeriodCloseCockpitPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.PeriodCloseCockpitPage })));
const TreasuryPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.TreasuryPage })));
const SubledgerAccountingPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.SubledgerAccountingPage })));
const CoaStructurePage = lazy(() => import('./pages/finance').then((m) => ({ default: m.CoaStructurePage })));
const WithholdingTaxPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.WithholdingTaxPage })));
const CollectionsPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.CollectionsPage })));
const LockboxPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.LockboxPage })));
const TaxEnginePage = lazy(() => import('./pages/finance').then((m) => ({ default: m.TaxEnginePage })));
const EncumbrancePage = lazy(() => import('./pages/finance').then((m) => ({ default: m.EncumbrancePage })));
const CashForecastPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.CashForecastPage })));
const CloseManagementPage = lazy(() => import('./pages/finance').then((m) => ({ default: m.CloseManagementPage })));
const ConsolidationPage = lazy(() => import('./pages/finance/ConsolidationPage'));
const ActivityCostingPage = lazy(() => import('./pages/finance/ActivityCostingPage'));
const ParallelLedgersPage = lazy(() => import('./pages/finance/ParallelLedgersPage'));
const CashDiscountsPage = lazy(() => import('./pages/finance/CashDiscountsPage'));
const RevenueRecognitionPage = lazy(() => import('./pages/finance/RevenueRecognitionPage'));
const LeasesPage = lazy(() => import('./pages/finance/LeasesPage'));
const EmployeesPage = lazy(() => import('./pages/hr').then((m) => ({ default: m.EmployeesPage })));
const DepartmentsPage = lazy(() => import('./pages/hr').then((m) => ({ default: m.DepartmentsPage })));
const AttendancePage = lazy(() => import('./pages/hr').then((m) => ({ default: m.AttendancePage })));
const TimesheetPage = lazy(() => import('./pages/hr').then((m) => ({ default: m.TimesheetPage })));
const LeavePage = lazy(() => import('./pages/hr').then((m) => ({ default: m.LeavePage })));
const LeaveApprovalsPage = lazy(() => import('./pages/hr').then((m) => ({ default: m.LeaveApprovalsPage })));
const PositionsPage = lazy(() => import('./pages/hr').then((m) => ({ default: m.PositionsPage })));
const TimeEvaluationPage = lazy(() => import('./pages/hr').then((m) => ({ default: m.TimeEvaluationPage })));
const ExitManagementPage = lazy(() => import('./pages/hr').then((m) => ({ default: m.ExitManagementPage })));
const DependentsNomineesPage = lazy(() => import('./pages/hr').then((m) => ({ default: m.DependentsNomineesPage })));
const SkillsPage = lazy(() => import('./pages/hr').then((m) => ({ default: m.SkillsPage })));
const HeadcountPage = lazy(() => import('./pages/hr').then((m) => ({ default: m.HeadcountPage })));
const TimeLaborPage = lazy(() => import('./pages/hr').then((m) => ({ default: m.TimeLaborPage })));
const PayComponentsPage = lazy(() => import('./pages/payroll').then((m) => ({ default: m.PayComponentsPage })));
const EmployeeSalaryPage = lazy(() => import('./pages/payroll').then((m) => ({ default: m.EmployeeSalaryPage })));
const PayrollRunsPage = lazy(() => import('./pages/payroll').then((m) => ({ default: m.PayrollRunsPage })));
const PayrollRunDetailPage = lazy(() => import('./pages/payroll').then((m) => ({ default: m.PayrollRunDetailPage })));
const PayslipPage = lazy(() => import('./pages/payroll').then((m) => ({ default: m.PayslipPage })));
const PayslipsListPage = lazy(() => import('./pages/payroll').then((m) => ({ default: m.PayslipsListPage })));
const StatutoryPage = lazy(() => import('./pages/payroll').then((m) => ({ default: m.StatutoryPage })));
const PayrollGlMappingsPage = lazy(() => import('./pages/payroll').then((m) => ({ default: m.PayrollGlMappingsPage })));
const RetroPayrollPage = lazy(() => import('./pages/payroll').then((m) => ({ default: m.RetroPayrollPage })));
const BankFilesPage = lazy(() => import('./pages/payroll').then((m) => ({ default: m.BankFilesPage })));
const StatutoryFormsPage = lazy(() => import('./pages/payroll').then((m) => ({ default: m.StatutoryFormsPage })));
const LdgPage = lazy(() => import('./pages/payroll/LdgPage'));
const PayrollCostingPage = lazy(() => import('./pages/payroll/PayrollCostingPage'));
const RequisitionsPage = lazy(() => import('./pages/procurement').then((m) => ({ default: m.RequisitionsPage })));
const RFQPage = lazy(() => import('./pages/procurement').then((m) => ({ default: m.RFQPage })));
const PurchaseOrdersPage = lazy(() => import('./pages/procurement').then((m) => ({ default: m.PurchaseOrdersPage })));
const GRNPage = lazy(() => import('./pages/procurement').then((m) => ({ default: m.GRNPage })));
const VendorInvoicesPage = lazy(() => import('./pages/procurement').then((m) => ({ default: m.VendorInvoicesPage })));
const ProcurementSettingsPage = lazy(() => import('./pages/procurement').then((m) => ({ default: m.ProcurementSettingsPage })));
const InfoRecordsPage = lazy(() => import('./pages/procurement').then((m) => ({ default: m.InfoRecordsPage })));
const ServiceEntrySheetPage = lazy(() => import('./pages/procurement').then((m) => ({ default: m.ServiceEntrySheetPage })));
const PurchaseReturnsPage = lazy(() => import('./pages/procurement').then((m) => ({ default: m.PurchaseReturnsPage })));
const ToleranceSettingsPage = lazy(() => import('./pages/procurement').then((m) => ({ default: m.ToleranceSettingsPage })));
const OutlineAgreementsPage = lazy(() => import('./pages/procurement').then((m) => ({ default: m.OutlineAgreementsPage })));
const SourceDeterminationPage = lazy(() => import('./pages/procurement').then((m) => ({ default: m.SourceDeterminationPage })));
const SourcingPage = lazy(() => import('./pages/procurement').then((m) => ({ default: m.SourcingPage })));
const SupplierQualificationPage = lazy(() => import('./pages/procurement').then((m) => ({ default: m.SupplierQualificationPage })));
const SpendAnalysisPage = lazy(() => import('./pages/procurement').then((m) => ({ default: m.SpendAnalysisPage })));
const VendorLoginPage = lazy(() => import('./pages/vendor/VendorLoginPage'));
const VendorPortalPage = lazy(() => import('./pages/vendor/VendorPortalPage'));
const AtsPage = lazy(() => import('./pages/talent').then((m) => ({ default: m.AtsPage })));
const TalentOnboardingPage = lazy(() => import('./pages/talent').then((m) => ({ default: m.OnboardingPage })));
const LearningPage = lazy(() => import('./pages/talent').then((m) => ({ default: m.LearningPage })));
const GoalsPage = lazy(() => import('./pages/talent').then((m) => ({ default: m.GoalsPage })));
const PerformancePage = lazy(() => import('./pages/talent').then((m) => ({ default: m.PerformancePage })));
const AppraisalPage = lazy(() => import('./pages/talent').then((m) => ({ default: m.AppraisalPage })));
const SuccessionPage = lazy(() => import('./pages/talent').then((m) => ({ default: m.SuccessionPage })));
const HiringPage = lazy(() => import('./pages/hiring/HiringPage'));
const InventoryPage = lazy(() => import('./pages/inventory').then((m) => ({ default: m.InventoryPage })));
const StockValuationPage = lazy(() => import('./pages/inventory').then((m) => ({ default: m.StockValuationPage })));
const SpecialProcurementPage = lazy(() => import('./pages/inventory').then((m) => ({ default: m.SpecialProcurementPage })));
const WmsPage = lazy(() => import('./pages/inventory').then((m) => ({ default: m.WmsPage })));
const MultiOrgPage = lazy(() => import('./pages/inventory').then((m) => ({ default: m.MultiOrgPage })));
const CostingPage = lazy(() => import('./pages/inventory').then((m) => ({ default: m.CostingPage })));
const GenealogyPage = lazy(() => import('./pages/inventory').then((m) => ({ default: m.GenealogyPage })));
const TransportationPage = lazy(() => import('./pages/logistics/TransportationPage'));
const ProjectsPage = lazy(() => import('./pages/projects').then((m) => ({ default: m.ProjectsPage })));
const ProjectBillingPage = lazy(() => import('./pages/projects').then((m) => ({ default: m.ProjectBillingPage })));
const ResourcesPage = lazy(() => import('./pages/projects').then((m) => ({ default: m.ResourcesPage })));
const EvmPage = lazy(() => import('./pages/projects').then((m) => ({ default: m.EvmPage })));
const CapitalPage = lazy(() => import('./pages/projects').then((m) => ({ default: m.CapitalPage })));
const ExpensesPage = lazy(() => import('./pages/expenses').then((m) => ({ default: m.ExpensesPage })));
const CrmPage = lazy(() => import('./pages/crm').then((m) => ({ default: m.CrmPage })));
const ServiceTicketsPage = lazy(() => import('./pages/crm').then((m) => ({ default: m.ServiceTicketsPage })));
const SlaPoliciesPage = lazy(() => import('./pages/crm').then((m) => ({ default: m.SlaPoliciesPage })));
const Customer360Page = lazy(() => import('./pages/crm').then((m) => ({ default: m.Customer360Page })));
const ForecastingPage = lazy(() => import('./pages/crm').then((m) => ({ default: m.ForecastingPage })));
const TerritoriesPage = lazy(() => import('./pages/crm').then((m) => ({ default: m.TerritoriesPage })));
const ServiceDeskPage = lazy(() => import('./pages/crm').then((m) => ({ default: m.ServiceDeskPage })));
const MarketingPage = lazy(() => import('./pages/marketing').then((m) => ({ default: m.MarketingPage })));
const SalesOrdersPage = lazy(() => import('./pages/sales').then((m) => ({ default: m.SalesOrdersPage })));
const PricingConditionsPage = lazy(() => import('./pages/sales').then((m) => ({ default: m.PricingConditionsPage })));
const CreditManagementPage = lazy(() => import('./pages/sales').then((m) => ({ default: m.CreditManagementPage })));
const ATPDashboardPage = lazy(() => import('./pages/sales').then((m) => ({ default: m.ATPDashboardPage })));
const ReturnsPage = lazy(() => import('./pages/sales').then((m) => ({ default: m.ReturnsPage })));
const DeliveriesPage = lazy(() => import('./pages/sales').then((m) => ({ default: m.DeliveriesPage })));
const BillingPlansPage = lazy(() => import('./pages/sales').then((m) => ({ default: m.BillingPlansPage })));
const FulfillmentPage = lazy(() => import('./pages/sales').then((m) => ({ default: m.FulfillmentPage })));
const PromisingPage = lazy(() => import('./pages/sales').then((m) => ({ default: m.PromisingPage })));
const CpqPage = lazy(() => import('./pages/sales').then((m) => ({ default: m.CpqPage })));
const CtoPage = lazy(() => import('./pages/sales').then((m) => ({ default: m.CtoPage })));
const IncentivePage = lazy(() => import('./pages/sales').then((m) => ({ default: m.IncentivePage })));
const ESSPage = lazy(() => import('./pages/ess').then((m) => ({ default: m.ESSPage })));
const MSSPage = lazy(() => import('./pages/ess').then((m) => ({ default: m.MSSPage })));
const ContractsPage = lazy(() => import('./pages/contracts').then((m) => ({ default: m.ContractsPage })));
const ClmPage = lazy(() => import('./pages/contracts').then((m) => ({ default: m.ClmPage })));
const ManufacturingPage = lazy(() => import('./pages/manufacturing').then((m) => ({ default: m.ManufacturingPage })));
const RoutingsPage = lazy(() => import('./pages/manufacturing').then((m) => ({ default: m.RoutingsPage })));
const MrpPage = lazy(() => import('./pages/manufacturing').then((m) => ({ default: m.MrpPage })));
const ProductionCostingPage = lazy(() => import('./pages/manufacturing').then((m) => ({ default: m.ProductionCostingPage })));
const FcsPage = lazy(() => import('./pages/manufacturing').then((m) => ({ default: m.FcsPage })));
const CrpPage = lazy(() => import('./pages/manufacturing').then((m) => ({ default: m.CrpPage })));
const OpQualityPage = lazy(() => import('./pages/manufacturing/OpQualityPage'));
const ProcessMfgPage = lazy(() => import('./pages/manufacturing/ProcessMfgPage'));
const DemandPlanningPage = lazy(() => import('./pages/planning/DemandPlanningPage'));
const QualityPage = lazy(() => import('./pages/quality').then((m) => ({ default: m.QualityPage })));
const CharacteristicsPage = lazy(() => import('./pages/quality').then((m) => ({ default: m.CharacteristicsPage })));
const ResultsRecordingPage = lazy(() => import('./pages/quality').then((m) => ({ default: m.ResultsRecordingPage })));
const MaintenancePage = lazy(() => import('./pages/maintenance').then((m) => ({ default: m.MaintenancePage })));
const FunctionalLocationsPage = lazy(() => import('./pages/maintenance').then((m) => ({ default: m.FunctionalLocationsPage })));
const CounterReadingsPage = lazy(() => import('./pages/maintenance').then((m) => ({ default: m.CounterReadingsPage })));
const CmmsPage = lazy(() => import('./pages/maintenance/CmmsPage'));
const BenefitsPage = lazy(() => import('./pages/benefits').then((m) => ({ default: m.BenefitsPage })));
const BenefitsEnrollmentPage = lazy(() => import('./pages/benefits/BenefitsEnrollmentPage'));
const CompWorkbenchPage = lazy(() => import('./pages/benefits/CompWorkbenchPage'));
const AnalyticsPage = lazy(() => import('./pages/analytics').then((m) => ({ default: m.AnalyticsPage })));
const CrossAnalyticsPage = lazy(() => import('./pages/analytics').then((m) => ({ default: m.CrossAnalyticsPage })));
const BiPage = lazy(() => import('./pages/analytics').then((m) => ({ default: m.BiPage })));
const PlatformPage = lazy(() => import('./pages/platform').then((m) => ({ default: m.PlatformPage })));
const LicensingPage = lazy(() => import('./pages/licensing').then((m) => ({ default: m.LicensingPage })));
const TenantsPage = lazy(() => import('./pages/admin').then((m) => ({ default: m.TenantsPage })));
const MeritPage = lazy(() => import('./pages/compensation/MeritPage'));
const KnowledgePage = lazy(() => import('./pages/knowledge/KnowledgePage'));
const JourneysPage = lazy(() => import('./pages/hr/JourneysPage'));
const AlumniPage = lazy(() => import('./pages/hr/AlumniPage'));
const CareerPage = lazy(() => import('./pages/talent/CareerPage'));
const StudioPage = lazy(() => import('./pages/studio/StudioPage'));
const AiSuitePage = lazy(() => import('./pages/ai/AiSuitePage'));
const RewardsPage = lazy(() => import('./pages/engagement/RewardsPage'));
const I9Page = lazy(() => import('./pages/hr/I9Page'));
const VisitorsPage = lazy(() => import('./pages/platform/VisitorsPage'));
const AcademyPage = lazy(() => import('./pages/talent/AcademyPage'));
const ReportsPage = lazy(() => import('./pages/reports/ReportsPage'));

/** Shown while a lazily-loaded route chunk is fetched. */
function RouteFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center" role="status" aria-live="polite">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

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
    <>
    <PwaInstallPrompt />
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
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
        <Route path="workflows/bpm" element={<BpmPage />} />
        <Route path="workflows/automation" element={<AutomationPage />} />
        <Route path="mobile" element={<MobilePage />} />
        <Route path="assistant" element={<AssistantPage />} />
        <Route path="delegations" element={<DelegationPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="settings/general" element={<GeneralSettingsPage />} />
        <Route path="settings/modules" element={<ModulesSettingsPage />} />
        <Route path="settings/localization" element={<LocalizationPage />} />
        <Route path="settings/field-config" element={<FieldConfigPage />} />
        <Route path="settings/picklists" element={<PicklistsPage />} />
        <Route path="settings/custom-fields" element={<CustomFieldsPage />} />
        <Route path="settings/webhooks" element={<WebhooksPage />} />
        <Route path="settings/sso" element={<SsoSettingsPage />} />
        <Route path="qr/scanner" element={<QrScannerPage />} />
        <Route path="settings/edi" element={<EdiPage />} />
        <Route path="settings/privacy" element={<PrivacyPage />} />
        <Route path="settings/security" element={<SecurityPage />} />
        <Route path="settings/integration" element={<IntegrationPage />} />
        <Route path="settings/i18n" element={<I18nPage />} />
        <Route path="settings/grc" element={<GrcPage />} />
        <Route path="settings/extensibility" element={<ExtensibilityPage />} />
        <Route path="settings/marketplace" element={<MarketplacePage />} />
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
        <Route path="hr/skills" element={<SkillsPage />} />
        <Route path="hr/headcount" element={<HeadcountPage />} />
        <Route path="engagement/feed" element={<FeedPage />} />
        <Route path="engagement/recognition" element={<RecognitionPage />} />
        <Route path="engagement/surveys" element={<SurveysPage />} />
        <Route path="engagement/helpdesk" element={<HelpdeskPage />} />
        <Route path="engagement/letters" element={<LettersPage />} />
        <Route path="hr/time-labor" element={<TimeLaborPage />} />
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
        <Route path="finance/internal-orders" element={<InternalOrdersPage />} />
        <Route path="finance/period-close" element={<PeriodCloseCockpitPage />} />
        <Route path="finance/treasury" element={<TreasuryPage />} />
        <Route path="finance/bank-import" element={<BankImportPage />} />
        <Route path="finance/payment-runs" element={<PaymentRunPage />} />
        <Route path="finance/advances" element={<AdvancesPage />} />
        <Route path="finance/budget" element={<BudgetVsActualPage />} />
        <Route path="finance/intercompany" element={<IntercompanyPage />} />
        <Route path="finance/consolidation" element={<ConsolidationPage />} />
        <Route path="finance/activity-costing" element={<ActivityCostingPage />} />
        <Route path="finance/parallel-ledgers" element={<ParallelLedgersPage />} />
        <Route path="finance/cash-discounts" element={<CashDiscountsPage />} />
        <Route path="finance/revenue-recognition" element={<RevenueRecognitionPage />} />
        <Route path="finance/subledger-accounting" element={<SubledgerAccountingPage />} />
        <Route path="finance/coa-structure" element={<CoaStructurePage />} />
        <Route path="finance/withholding-tax" element={<WithholdingTaxPage />} />
        <Route path="finance/collections" element={<CollectionsPage />} />
        <Route path="finance/lockbox" element={<LockboxPage />} />
        <Route path="finance/tax-engine" element={<TaxEnginePage />} />
        <Route path="finance/encumbrance" element={<EncumbrancePage />} />
        <Route path="finance/cash-forecast" element={<CashForecastPage />} />
        <Route path="finance/close-management" element={<CloseManagementPage />} />
        <Route path="finance/leases" element={<LeasesPage />} />
        <Route path="payroll/components" element={<PayComponentsPage />} />
        <Route path="payroll/salaries" element={<EmployeeSalaryPage />} />
        <Route path="payroll/runs" element={<PayrollRunsPage />} />
        <Route path="payroll/runs/:id" element={<PayrollRunDetailPage />} />
        <Route path="payroll/runs/:id/bank-files" element={<BankFilesPage />} />
        <Route path="payroll/payslips" element={<PayslipsListPage />} />
        <Route path="payroll/payslips/:id" element={<PayslipPage />} />
        <Route path="payroll/statutory" element={<StatutoryPage />} />
        <Route path="payroll/statutory-forms" element={<StatutoryFormsPage />} />
        <Route path="payroll/gl-mappings" element={<PayrollGlMappingsPage />} />
        <Route path="payroll/retro" element={<RetroPayrollPage />} />
        <Route path="payroll/ldg" element={<LdgPage />} />
        <Route path="payroll/costing" element={<PayrollCostingPage />} />
        <Route path="procurement/requisitions" element={<RequisitionsPage />} />
        <Route path="procurement/rfq" element={<RFQPage />} />
        <Route path="procurement/purchase-orders" element={<PurchaseOrdersPage />} />
        <Route path="procurement/grn" element={<GRNPage />} />
        <Route path="procurement/vendor-invoices" element={<VendorInvoicesPage />} />
        <Route path="procurement/settings" element={<ProcurementSettingsPage />} />
        <Route path="procurement/info-records" element={<InfoRecordsPage />} />
        <Route path="procurement/service-entries" element={<ServiceEntrySheetPage />} />
        <Route path="procurement/returns" element={<PurchaseReturnsPage />} />
        <Route path="procurement/tolerance" element={<ToleranceSettingsPage />} />
        <Route path="procurement/outline-agreements" element={<OutlineAgreementsPage />} />
        <Route path="procurement/source-determination" element={<SourceDeterminationPage />} />
        <Route path="procurement/sourcing" element={<SourcingPage />} />
        <Route path="procurement/supplier-qualification" element={<SupplierQualificationPage />} />
        <Route path="procurement/spend-analysis" element={<SpendAnalysisPage />} />
        <Route path="talent/hiring" element={<HiringPage />} />
        <Route path="talent/ats" element={<AtsPage />} />
        <Route path="talent/onboarding" element={<TalentOnboardingPage />} />
        <Route path="talent/learning" element={<LearningPage />} />
        <Route path="talent/goals" element={<GoalsPage />} />
        <Route path="talent/performance" element={<PerformancePage />} />
        <Route path="talent/appraisal" element={<AppraisalPage />} />
        <Route path="talent/succession" element={<SuccessionPage />} />
        <Route path="talent/bgv" element={<BgvPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/valuation" element={<StockValuationPage />} />
        <Route path="inventory/special-procurement" element={<SpecialProcurementPage />} />
        <Route path="inventory/wms" element={<WmsPage />} />
        <Route path="inventory/multi-org" element={<MultiOrgPage />} />
        <Route path="inventory/costing" element={<CostingPage />} />
        <Route path="inventory/genealogy" element={<GenealogyPage />} />
        <Route path="logistics/transportation" element={<TransportationPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/billing" element={<ProjectBillingPage />} />
        <Route path="projects/resources" element={<ResourcesPage />} />
        <Route path="projects/evm" element={<EvmPage />} />
        <Route path="projects/capital" element={<CapitalPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="expenses/travel" element={<TravelPage />} />
        <Route path="crm" element={<CrmPage />} />
        <Route path="crm/tickets" element={<ServiceTicketsPage />} />
        <Route path="crm/sla" element={<SlaPoliciesPage />} />
        <Route path="crm/customer-360" element={<Customer360Page />} />
        <Route path="crm/forecasting" element={<ForecastingPage />} />
        <Route path="crm/territories" element={<TerritoriesPage />} />
        <Route path="crm/service-desk" element={<ServiceDeskPage />} />
        <Route path="marketing" element={<MarketingPage />} />
        <Route path="sales/orders" element={<SalesOrdersPage />} />
        <Route path="sales/pricing" element={<PricingConditionsPage />} />
        <Route path="sales/credit" element={<CreditManagementPage />} />
        <Route path="sales/atp" element={<ATPDashboardPage />} />
        <Route path="sales/fulfillment" element={<FulfillmentPage />} />
        <Route path="sales/promising" element={<PromisingPage />} />
        <Route path="sales/returns" element={<ReturnsPage />} />
        <Route path="sales/deliveries" element={<DeliveriesPage />} />
        <Route path="sales/billing-plans" element={<BillingPlansPage />} />
        <Route path="sales/cpq" element={<CpqPage />} />
        <Route path="sales/cto" element={<CtoPage />} />
        <Route path="sales/incentive" element={<IncentivePage />} />
        <Route path="contracts" element={<ContractsPage />} />
        <Route path="contracts/clm" element={<ClmPage />} />
        <Route path="manufacturing" element={<ManufacturingPage />} />
        <Route path="manufacturing/routings" element={<RoutingsPage />} />
        <Route path="planning/demand" element={<DemandPlanningPage />} />
        <Route path="manufacturing/mrp" element={<MrpPage />} />
        <Route path="manufacturing/costing" element={<ProductionCostingPage />} />
        <Route path="manufacturing/fcs" element={<FcsPage />} />
        <Route path="manufacturing/crp" element={<CrpPage />} />
        <Route path="manufacturing/op-quality" element={<OpQualityPage />} />
        <Route path="manufacturing/process" element={<ProcessMfgPage />} />
        <Route path="quality" element={<QualityPage />} />
        <Route path="quality/characteristics" element={<CharacteristicsPage />} />
        <Route path="quality/results" element={<ResultsRecordingPage />} />
        <Route path="maintenance" element={<MaintenancePage />} />
        <Route path="maintenance/functional-locations" element={<FunctionalLocationsPage />} />
        <Route path="maintenance/counter-readings" element={<CounterReadingsPage />} />
        <Route path="maintenance/cmms" element={<CmmsPage />} />
        <Route path="benefits" element={<BenefitsPage />} />
        <Route path="benefits/enrollment" element={<BenefitsEnrollmentPage />} />
        <Route path="benefits/comp-workbench" element={<CompWorkbenchPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="analytics/cross" element={<CrossAnalyticsPage />} />
        <Route path="analytics/anomalies" element={<AnomaliesPage />} />
        <Route path="analytics/bi" element={<BiPage />} />
        <Route path="platform" element={<PlatformPage />} />
        <Route path="licensing" element={<LicensingPage />} />
        <Route path="compensation/merit" element={<MeritPage />} />
        <Route path="knowledge" element={<KnowledgePage />} />
        <Route path="hr/journeys" element={<JourneysPage />} />
        <Route path="hr/alumni" element={<AlumniPage />} />
        <Route path="talent/career" element={<CareerPage />} />
        <Route path="studio" element={<StudioPage />} />
        <Route path="ai" element={<AiSuitePage />} />
        <Route path="engagement/rewards" element={<RewardsPage />} />
        <Route path="hr/i9" element={<I9Page />} />
        <Route path="platform/visitors" element={<VisitorsPage />} />
        <Route path="talent/academy" element={<AcademyPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="admin/tenants" element={<SuperAdminRoute><TenantsPage /></SuperAdminRoute>} />
        <Route path="ess" element={<ESSPage />} />
        <Route path="mss" element={<MSSPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
    </Suspense>
    </>
  );
}
