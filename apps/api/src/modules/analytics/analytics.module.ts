import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportDefinition } from './entities/report-definition.entity';
import { ReportSchedule } from './entities/report-schedule.entity';
import { Budget } from './entities/budget.entity';
import { KpiDefinition } from './entities/kpi-definition.entity';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { CrossAnalyticsService } from './cross-analytics.service';
import { CrossAnalyticsController } from './cross-analytics.controller';
import { SavedQuery } from './semantic/saved-query.entity';
import { SemanticService } from './semantic/semantic.service';
import { SemanticController } from './semantic/semantic.controller';
import { RbacModule } from '../rbac/rbac.module';
// Cross-module entities aggregated by CrossAnalyticsService (read-only)
import { Employee } from '../hr/employees/entities/employee.entity';
import { JobPosting } from '../talent/ats/entities/job-posting.entity';
import { JobOffer } from '../talent/ats/entities/job-offer.entity';
import { PurchaseOrder } from '../procurement/po/entities/purchase-order.entity';
import { Bill } from '../finance/ap/entities/bill.entity';
import { Invoice } from '../finance/ar/entities/invoice.entity';
import { CustomerReceipt } from '../finance/ar/entities/customer-receipt.entity';
import { SalesOrder } from '../sales/entities/sales-order.entity';
import { Account } from '../finance/gl/entities/account.entity';
import { JournalLine } from '../finance/gl/entities/journal-line.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReportDefinition,
      ReportSchedule,
      Budget,
      KpiDefinition,
      SavedQuery,
      // cross-module (read-only)
      Employee,
      JobPosting,
      JobOffer,
      PurchaseOrder,
      Bill,
      Invoice,
      CustomerReceipt,
      SalesOrder,
      Account,
      JournalLine,
    ]),
    RbacModule,
  ],
  controllers: [AnalyticsController, CrossAnalyticsController, SemanticController],
  providers: [AnalyticsService, CrossAnalyticsService, SemanticService],
  exports: [AnalyticsService, CrossAnalyticsService, SemanticService],
})
export class AnalyticsModule {}
