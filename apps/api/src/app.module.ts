import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule } from '@nestjs/throttler';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { DelegationModule } from './modules/delegation/delegation.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { HealthModule } from './modules/health/health.module';
import { FinanceModule } from './modules/finance/finance.module';
import { HrModule } from './modules/hr/hr.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { LdgModule } from './modules/payroll/ldg/ldg.module';
import { PayrollCostingModule } from './modules/payroll/costing/payroll-costing.module';
import { ProcurementModule } from './modules/procurement/procurement.module';
import { TalentModule } from './modules/talent/talent.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { CostingModule } from './modules/inventory/costing/costing.module';
import { GenealogyModule } from './modules/inventory/genealogy/genealogy.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { CrmModule } from './modules/crm/crm.module';
import { SalesModule } from './modules/sales/sales.module';
import { FulfillmentOrchestrationModule } from './modules/sales/fulfillment/fulfillment-orchestration.module';
import { PromisingModule } from './modules/sales/promising/promising.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { OpQualityModule } from './modules/manufacturing/op-quality/op-quality.module';
import { OpmModule } from './modules/manufacturing/opm/opm.module';
import { ContractsModule } from './modules/contracts/contracts.module';
import { ManufacturingModule } from './modules/manufacturing/manufacturing.module';
import { QualityModule } from './modules/quality/quality.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { CmmsModule } from './modules/maintenance/cmms/cmms.module';
import { BenefitsModule } from './modules/benefits/benefits.module';
import { BenefitsEnrollmentModule } from './modules/benefits/enrollment/benefits-enrollment.module';
import { CompWorkbenchModule } from './modules/benefits/comp-workbench/comp-workbench.module';
import { MeritModule } from './modules/compensation/merit/merit.module';
import { SkillsModule } from './modules/hr/skills/skills.module';
import { HeadcountModule } from './modules/hr/headcount/headcount.module';
import { OtlModule } from './modules/hr/otl/otl.module';
import { SourcingModule } from './modules/procurement/sourcing/sourcing.module';
import { SupplierQualificationModule } from './modules/procurement/supplier-qualification/supplier-qualification.module';
import { SpendAnalysisModule } from './modules/procurement/spend-analysis/spend-analysis.module';
import { ClmModule } from './modules/contracts/clm/clm.module';
import { ForecastingModule } from './modules/crm/forecasting/forecasting.module';
import { TerritoriesModule } from './modules/crm/territories/territories.module';
import { CpqModule } from './modules/sales/cpq/cpq.module';
import { CtoModule } from './modules/sales/cto/cto.module';
import { IncentiveModule } from './modules/sales/incentive/incentive.module';
import { ServiceDeskModule } from './modules/crm/service-desk/service-desk.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { ProjectBillingModule } from './modules/projects/billing/project-billing.module';
import { ProjectResourcesModule } from './modules/projects/resources/resources.module';
import { EvmModule } from './modules/projects/evm/evm.module';
import { CapitalModule } from './modules/projects/capital/capital.module';
import { BiModule } from './modules/analytics/bi/bi.module';
import { PeopleAnalyticsModule } from './modules/analytics/people/people-analytics.module';
import { PredictiveModule } from './modules/analytics/predictive/predictive.module';
import { BpmModule } from './modules/workflow/bpm/bpm.module';
import { MobileModule } from './modules/mobile/mobile.module';
import { SyncModule } from './modules/sync/sync.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { AssistantModule } from './modules/assistant/assistant.module';
import { PrivacyModule } from './modules/privacy/privacy.module';
import { SecurityModule } from './modules/security/security.module';
import { IntegrationFrameworkModule } from './modules/integration/integration.module';
import { I18nModule } from './modules/localization/i18n/i18n.module';
import { GrcModule } from './modules/grc/grc.module';
import { ExtensibilityModule } from './modules/extensibility/extensibility.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PlatformModule } from './modules/platform/platform.module';
import { FormsModule } from './modules/platform/forms/forms.module';
import { CollaborationModule } from './modules/collaboration/collaboration.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { ActionPlanningModule } from './modules/action-planning/action-planning.module';
import { StudioModule } from './modules/studio/studio.module';
import { LocalizationPacksModule } from './modules/localization/localization-packs.module';
import { LicensingModule } from './modules/licensing/licensing.module';
import { AdminModule } from './modules/admin/admin.module';
import { SettingsModule } from './modules/settings/field-config.module';
import { PicklistModule } from './modules/settings/picklists/picklist.module';
import { SequenceModule } from './common/sequence/sequence.module';
import { AutomationModule } from './modules/automation/automation.module';
import { EngagementModule } from './modules/engagement/engagement.module';
import { HelpdeskModule } from './modules/helpdesk/helpdesk.module';
import { TravelModule } from './modules/travel/travel.module';
import { LettersModule } from './modules/letters/letters.module';
import { BgvModule } from './modules/bgv/bgv.module';
import { DmsModule } from './modules/dms/dms.module';
import { EmailModule } from './modules/email/email.module';
import { SearchModule } from './modules/search/search.module';
import { CustomFieldsModule } from './modules/platform/custom-fields/custom-fields.module';
import { WebhooksModule } from './modules/platform/webhooks/webhooks.module';
import { SsoModule } from './modules/platform/sso/sso.module';
import { QrModule } from './modules/platform/qr/qr.module';
import { EdiModule } from './modules/platform/edi/edi.module';
import { PlanningModule } from './modules/planning/planning.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { LandedCostModule } from './modules/procurement/landed-cost/landed-cost.module';
import { RosterModule } from './modules/hr/roster/roster.module';
import { AiModule } from './modules/ai/ai.module';
import { AiCareerModule } from './modules/ai/career/ai-career.module';
import { AiExpenseModule } from './modules/ai/expense/ai-expense.module';
import { AiRecruitingModule } from './modules/ai/recruiting/ai-recruiting.module';
import { AiSurveyModule } from './modules/ai/survey/ai-survey.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { MetricsModule } from './common/metrics/metrics.module';
import { LeasesModule } from './common/leases/leases.module';
import { IdempotencyModule } from './common/idempotency/idempotency.module';
import { JobsModule } from './common/jobs/jobs.module';
import { getDatabaseConfig } from './config/database.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    TenantsModule,
    AuthModule,
    UsersModule,
    RbacModule,
    WorkflowModule,
    DelegationModule,
    NotificationsModule,
    AuditModule,
    HealthModule,
    FinanceModule,
    HrModule,
    PayrollModule,
    LdgModule,
    PayrollCostingModule,
    ProcurementModule,
    TalentModule,
    InventoryModule,
    CostingModule,
    GenealogyModule,
    ProjectsModule,
    ExpensesModule,
    CrmModule,
    SalesModule,
    FulfillmentOrchestrationModule,
    PromisingModule,
    LogisticsModule,
    OpQualityModule,
    OpmModule,
    ContractsModule,
    ManufacturingModule,
    QualityModule,
    MaintenanceModule,
    CmmsModule,
    BenefitsModule,
    BenefitsEnrollmentModule,
    CompWorkbenchModule,
    MeritModule,
    SkillsModule,
    HeadcountModule,
    OtlModule,
    SourcingModule,
    SupplierQualificationModule,
    SpendAnalysisModule,
    ClmModule,
    ForecastingModule,
    TerritoriesModule,
    CpqModule,
    CtoModule,
    IncentiveModule,
    ServiceDeskModule,
    MarketingModule,
    ProjectBillingModule,
    ProjectResourcesModule,
    EvmModule,
    CapitalModule,
    BiModule,
    PeopleAnalyticsModule,
    PredictiveModule,
    BpmModule,
    MobileModule,
    SyncModule,
    MarketplaceModule,
    AssistantModule,
    PrivacyModule,
    SecurityModule,
    IntegrationFrameworkModule,
    I18nModule,
    GrcModule,
    ExtensibilityModule,
    AnalyticsModule,
    PlatformModule,
    FormsModule,
    CollaborationModule,
    KnowledgeModule,
    ActionPlanningModule,
    StudioModule,
    LocalizationPacksModule,
    LicensingModule,
    AdminModule,
    SettingsModule,
    PicklistModule,
    SequenceModule,
    MetricsModule,
    LeasesModule,
    IdempotencyModule,
    JobsModule,
    AutomationModule,
    EngagementModule,
    HelpdeskModule,
    TravelModule,
    LettersModule,
    BgvModule,
    ComplianceModule,
    LandedCostModule,
    RosterModule,
    AiModule,
    AiCareerModule,
    AiExpenseModule,
    AiRecruitingModule,
    AiSurveyModule,
    DmsModule,
    EmailModule,
    SearchModule,
    CustomFieldsModule,
    WebhooksModule,
    SsoModule,
    QrModule,
    EdiModule,
    PlanningModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {
  configure(consumer: MiddlewareConsumer) {
    // Hardening + tracing run on every route, including health and auth.
    consumer.apply(SecurityHeadersMiddleware, RequestContextMiddleware).forRoutes('*');
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.GET },
        { path: 'health/ready', method: RequestMethod.GET },
        { path: 'health/live', method: RequestMethod.GET },
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/register', method: RequestMethod.POST },
        { path: 'auth/forgot-password', method: RequestMethod.POST },
        { path: 'auth/reset-password', method: RequestMethod.POST },
      )
      .forRoutes('*');
  }
}
