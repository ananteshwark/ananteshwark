import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RbacModule } from '../rbac/rbac.module';
import { EmailModule } from '../email/email.module';
import { ReportsService } from './reports.service';
import { ReportSchedulesService } from './report-schedules.service';
import { ReportsController } from './reports.controller';
import { ReportView } from './entities/report-view.entity';
import { ReportSchedule } from './entities/report-schedule.entity';

// Only ReportView/ReportSchedule need forFeature; the engine resolves
// repositories for catalog entities via the DataSource, which already
// registers every entity through the app's entity glob.
@Module({
  imports: [TypeOrmModule.forFeature([ReportView, ReportSchedule]), RbacModule, EmailModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportSchedulesService],
  exports: [ReportsService, ReportSchedulesService],
})
export class ReportsModule {}
