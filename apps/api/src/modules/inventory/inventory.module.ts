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
import { FifoLayer } from './entities/fifo-layer.entity';
import { SubcontractOrder } from './entities/subcontract-order.entity';
import { ConsignmentStock } from './entities/consignment-stock.entity';
import { StockTransferOrder } from './entities/stock-transfer-order.entity';
import { BatchCharacteristic } from './entities/batch-characteristic.entity';
import { BinStock } from './entities/bin-stock.entity';
import { WarehouseTask } from './entities/warehouse-task.entity';
import { InventoryService } from './inventory.service';
import {
  WarehouseController,
  CategoryController,
  ItemController,
  StockController,
  AdjustmentController,
} from './inventory.controller';
import { InventoryV2Controller } from './inventory-v2.controller';
import { InventoryV2Service } from './inventory-v2.service';
import { SpecialProcurementController } from './special-procurement.controller';
import { SpecialProcurementService } from './special-procurement.service';
import { WmsService } from './wms.service';
import { WmsController } from './wms.controller';
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
      FifoLayer,
      SubcontractOrder,
      ConsignmentStock,
      StockTransferOrder,
      BatchCharacteristic,
      BinStock,
      WarehouseTask,
    ]),
    RbacModule,
  ],
  controllers: [WarehouseController, CategoryController, ItemController, StockController, AdjustmentController, InventoryV2Controller, SpecialProcurementController, WmsController],
  providers: [InventoryService, InventoryV2Service, SpecialProcurementService, WmsService],
  exports: [InventoryService, InventoryV2Service, SpecialProcurementService, WmsService],
})
export class InventoryModule {}
