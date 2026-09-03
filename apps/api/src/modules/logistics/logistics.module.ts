import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Carrier } from './entities/carrier.entity';
import { FreightRate } from './entities/freight-rate.entity';
import { ShipmentPlan } from './entities/shipment-plan.entity';
import { LogisticsService } from './logistics.service';
import { LogisticsController } from './logistics.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Carrier, FreightRate, ShipmentPlan]),
    RbacModule,
  ],
  controllers: [LogisticsController],
  providers: [LogisticsService],
  exports: [LogisticsService],
})
export class LogisticsModule {}
