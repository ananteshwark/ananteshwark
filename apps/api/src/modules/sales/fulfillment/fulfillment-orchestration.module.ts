import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SupplyLink } from './entities/supply-link.entity';
import { SalesOrder } from '../entities/sales-order.entity';
import { SalesOrderLine } from '../entities/sales-order-line.entity';
import { FulfillmentOrchestrationService } from './fulfillment-orchestration.service';
import { FulfillmentOrchestrationController } from './fulfillment-orchestration.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SupplyLink, SalesOrder, SalesOrderLine]),
    RbacModule,
  ],
  controllers: [FulfillmentOrchestrationController],
  providers: [FulfillmentOrchestrationService],
  exports: [FulfillmentOrchestrationService],
})
export class FulfillmentOrchestrationModule {}
