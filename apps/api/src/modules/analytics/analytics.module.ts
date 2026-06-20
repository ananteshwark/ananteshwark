import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportDefinition } from './entities/report-definition.entity';
import { ReportSchedule } from './entities/report-schedule.entity';
import { Budget } from './entities/budget.entity';
import { KpiDefinition } from './entities/kpi-definition.entity';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReportDefinition, ReportSchedule, Budget, KpiDefinition]),
    RbacModule,
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
