import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { ItemCategory } from './entities/item-category.entity';
import { Item } from './entities/item.entity';
import { StockLedger } from './entities/stock-ledger.entity';
import { StockBalance } from './entities/stock-balance.entity';
import { StockAdjustment } from './entities/stock-adjustment.entity';
import { BinLocation } from './entities/bin-location.entity';
import { LotSerial } from './entities/lot-serial.entity';
import { UomConversion } from './entities/uom-conversion.entity';
import { CycleCount, CycleCountLine } from './entities/cycle-count.entity';
import { Rma } from './entities/rma.entity';
import { InventoryService } from './inventory.service';
import {
  WarehouseController,
  ItemController,
  StockController,
  AdjustmentController,
} from './inventory.controller';
import { InventoryV2Controller } from './inventory-v2.controller';
import { InventoryV2Service } from './inventory-v2.service';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Warehouse,
      ItemCategory,
      Item,
      StockLedger,
      StockBalance,
      StockAdjustment,
      BinLocation,
      LotSerial,
      UomConversion,
      CycleCount,
      CycleCountLine,
      Rma,
    ]),
    RbacModule,
  ],
  controllers: [WarehouseController, ItemController, StockController, AdjustmentController, InventoryV2Controller],
  providers: [InventoryService, InventoryV2Service],
  exports: [InventoryService, InventoryV2Service],
})
export class InventoryModule {}
