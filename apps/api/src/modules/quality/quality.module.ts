import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InspectionPlan } from './entities/inspection-plan.entity';
import { InspectionLot } from './entities/inspection-lot.entity';
import { NonConformance } from './entities/non-conformance.entity';
import { QualityService } from './quality.service';
import { QualityController } from './quality.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InspectionPlan, InspectionLot, NonConformance]),
    RbacModule,
  ],
  controllers: [QualityController],
  providers: [QualityService],
  exports: [QualityService],
})
export class QualityModule {}
