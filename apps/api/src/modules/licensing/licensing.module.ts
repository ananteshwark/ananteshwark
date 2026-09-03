import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RbacModule } from '../rbac/rbac.module';
import { LicensingController } from './licensing.controller';
import { LicensingService } from './licensing.service';
import { LicenseEnforcementService } from './license-enforcement.service';
import { LicenseEnforcementInterceptor } from './license-enforcement.interceptor';
import { LicensePlan } from './entities/license-plan.entity';
import { PricingTier } from './entities/pricing-tier.entity';
import { LicenseContract } from './entities/license-contract.entity';
import { ModuleLicense } from './entities/module-license.entity';
import { EmployeeModuleAssignment } from './entities/employee-module-assignment.entity';
import { ConsumptionRecord } from './entities/consumption-record.entity';
import { UsageSnapshot } from './entities/usage-snapshot.entity';
import { LicenseInvoice } from './entities/license-invoice.entity';
import { InvoiceLineItem } from './entities/invoice-line-item.entity';
import { LicenseAuditLog } from './entities/license-audit-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LicensePlan,
      PricingTier,
      LicenseContract,
      ModuleLicense,
      EmployeeModuleAssignment,
      ConsumptionRecord,
      UsageSnapshot,
      LicenseInvoice,
      InvoiceLineItem,
      LicenseAuditLog,
    ]),
    RbacModule,
  ],
  controllers: [LicensingController],
  providers: [
    LicensingService,
    LicenseEnforcementService,
    // Global on purpose: enforcement must cover every module's routes, and an
    // interceptor (unlike a global guard) runs after JwtAuthGuard so the
    // tenant is known. Unauthenticated and core routes pass through.
    { provide: APP_INTERCEPTOR, useClass: LicenseEnforcementInterceptor },
  ],
  exports: [LicensingService, LicenseEnforcementService],
})
export class LicensingModule {}
