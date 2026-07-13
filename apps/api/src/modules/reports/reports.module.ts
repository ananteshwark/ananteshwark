import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RbacModule } from '../rbac/rbac.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportView } from './entities/report-view.entity';

// Only ReportView needs forFeature; the engine resolves repositories for
// catalog entities via the DataSource, which already registers every
// entity through the app's entity glob.
@Module({
  imports: [TypeOrmModule.forFeature([ReportView]), RbacModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
