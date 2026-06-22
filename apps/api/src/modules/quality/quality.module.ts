import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InspectionPlan } from './entities/inspection-plan.entity';
import { InspectionLot } from './entities/inspection-lot.entity';
import { NonConformance } from './entities/non-conformance.entity';
import { QualityCharacteristic } from './entities/quality-characteristic.entity';
import { InspectionResult } from './entities/inspection-result.entity';
import { QualityService } from './quality.service';
import { QualityController } from './quality.controller';
import { QmResultsService } from './qm-results.service';
import { QmResultsController } from './qm-results.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InspectionPlan, InspectionLot, NonConformance, QualityCharacteristic, InspectionResult]),
    RbacModule,
  ],
  controllers: [QualityController, QmResultsController],
  providers: [QualityService, QmResultsService],
  exports: [QualityService, QmResultsService],
})
export class QualityModule {}
