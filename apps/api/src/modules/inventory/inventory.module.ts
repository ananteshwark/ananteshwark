import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { ItemCategory } from './entities/item-category.entity';
import { Item } from './entities/item.entity';
import { StockLedger } from './entities/stock-ledger.entity';
import { StockBalance } from './entities/stock-balance.entity';
import { StockAdjustment } from './entities/stock-adjustment.entity';
import { InventoryService } from './inventory.service';
import {
  WarehouseController,
  ItemController,
  StockController,
  AdjustmentController,
} from './inventory.controller';
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
    ]),
    RbacModule,
  ],
  controllers: [WarehouseController, ItemController, StockController, AdjustmentController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
