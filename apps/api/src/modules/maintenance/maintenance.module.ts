import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Equipment } from './entities/equipment.entity';
import { MaintenancePlan } from './entities/maintenance-plan.entity';
import { MaintenanceOrder } from './entities/maintenance-order.entity';
import { BreakdownNotification } from './entities/breakdown-notification.entity';
import { FunctionalLocation } from './entities/functional-location.entity';
import { CounterReading } from './entities/counter-reading.entity';
import { MaintenanceService } from './maintenance.service';
import { MaintenanceController } from './maintenance.controller';
import { FunctionalLocationService } from './functional-location.service';
import { FunctionalLocationController } from './functional-location.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Equipment, MaintenancePlan, MaintenanceOrder, BreakdownNotification,
      FunctionalLocation, CounterReading,
    ]),
    RbacModule,
  ],
  controllers: [MaintenanceController, FunctionalLocationController],
  providers: [MaintenanceService, FunctionalLocationService],
  exports: [MaintenanceService, FunctionalLocationService],
})
export class MaintenanceModule {}
