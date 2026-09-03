import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReviewCycle } from './entities/review-cycle.entity';
import { ReviewForm } from './entities/review-form.entity';
import { CalibrationSession } from './entities/calibration-session.entity';
import { PerformanceService } from './performance.service';
import { PerformanceController } from './performance.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([ReviewCycle, ReviewForm, CalibrationSession]), RbacModule],
  controllers: [PerformanceController],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
