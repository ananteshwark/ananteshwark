import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubjectArea } from './entities/subject-area.entity';
import { SavedReport } from './entities/saved-report.entity';
import { ReportSchedule } from './entities/report-schedule.entity';
import { KpiTile } from './entities/kpi-tile.entity';
import { BiService } from './bi.service';
import { BiController } from './bi.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SubjectArea, SavedReport, ReportSchedule, KpiTile]),
    RbacModule,
  ],
  controllers: [BiController],
  providers: [BiService],
  exports: [BiService],
})
export class BiModule {}
