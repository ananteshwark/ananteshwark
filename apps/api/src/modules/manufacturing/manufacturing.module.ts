import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bom, BomLine } from './entities/bom.entity';
import { WorkCenter } from './entities/work-center.entity';
import { ProductionOrder, MaterialIssuance } from './entities/production-order.entity';
import { Routing } from './entities/routing.entity';
import { RoutingOperation } from './entities/routing-operation.entity';
import { PlannedOrder } from './entities/planned-order.entity';
import { ProductionConfirmation } from './entities/production-confirmation.entity';
import { CostingRun } from './entities/costing-run.entity';
import { CapacitySlot } from './entities/capacity-slot.entity';
import { Item } from '../inventory/entities/item.entity';
import { StockBalance } from '../inventory/entities/stock-balance.entity';
import { SalesOrder } from '../sales/entities/sales-order.entity';
import { SalesOrderLine } from '../sales/entities/sales-order-line.entity';
import { ManufacturingService } from './manufacturing.service';
import { MrpService } from './mrp.service';
import { FcsService } from './fcs.service';
import { ManufacturingController } from './manufacturing.controller';
import { GlModule } from '../finance/gl/gl.module';
import { ControllingModule } from '../finance/controlling/controlling.module';
import { InventoryModule } from '../inventory/inventory.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Bom, BomLine, WorkCenter, ProductionOrder, MaterialIssuance,
      Routing, RoutingOperation, PlannedOrder, ProductionConfirmation, CostingRun,
      CapacitySlot, Item, StockBalance, SalesOrder, SalesOrderLine,
    ]),
    GlModule,
    ControllingModule,
    InventoryModule,
    RbacModule,
  ],
  controllers: [ManufacturingController],
  providers: [ManufacturingService, MrpService, FcsService],
  exports: [ManufacturingService, MrpService, FcsService],
})
export class ManufacturingModule {}
