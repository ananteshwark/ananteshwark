import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

// No forFeature: the engine resolves repositories for catalog entities via
// the DataSource, which already registers every entity through the app's
// entity glob.
@Module({
  imports: [RbacModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
