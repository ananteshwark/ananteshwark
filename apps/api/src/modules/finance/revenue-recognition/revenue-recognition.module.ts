import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RevenueContract } from './entities/revenue-contract.entity';
import { PerformanceObligation } from './entities/performance-obligation.entity';
import { RevenueSchedule } from './entities/revenue-schedule.entity';
import { Account } from '../gl/entities/account.entity';
import { RevenueRecognitionService } from './revenue-recognition.service';
import { RevenueRecognitionController } from './revenue-recognition.controller';
import { GlModule } from '../gl/gl.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RevenueContract,
      PerformanceObligation,
      RevenueSchedule,
      Account,
    ]),
    GlModule,
    RbacModule,
  ],
  controllers: [RevenueRecognitionController],
  providers: [RevenueRecognitionService],
  exports: [RevenueRecognitionService],
})
export class RevenueRecognitionModule {}
