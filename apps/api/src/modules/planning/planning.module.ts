import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DemandForecast } from './entities/demand-forecast.entity';
import { ForecastPeriod } from './entities/forecast-period.entity';
import { SalesOrderLine } from '../sales/entities/sales-order-line.entity';
import { Item } from '../inventory/entities/item.entity';
import { DemandPlanningService } from './demand-planning.service';
import { DemandPlanningController } from './demand-planning.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DemandForecast, ForecastPeriod, SalesOrderLine, Item]),
    RbacModule,
  ],
  controllers: [DemandPlanningController],
  providers: [DemandPlanningService],
  exports: [DemandPlanningService],
})
export class PlanningModule {}
