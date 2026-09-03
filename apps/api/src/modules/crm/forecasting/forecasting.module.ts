import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ForecastCategoryAssignment } from './entities/forecast-category.entity';
import { ForecastOverride } from './entities/forecast-override.entity';
import { ForecastSnapshot } from './entities/forecast-snapshot.entity';
import { CrmOpportunity } from '../entities/crm-opportunity.entity';
import { ForecastingService } from './forecasting.service';
import { ForecastingController } from './forecasting.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ForecastCategoryAssignment, ForecastOverride, ForecastSnapshot, CrmOpportunity]),
    RbacModule,
  ],
  controllers: [ForecastingController],
  providers: [ForecastingService],
  exports: [ForecastingService],
})
export class ForecastingModule {}
