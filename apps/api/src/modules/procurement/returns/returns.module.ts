import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseReturn } from './entities/purchase-return.entity';
import { PurchaseReturnLine } from './entities/purchase-return-line.entity';
import { ReturnsService } from './returns.service';
import { ReturnsController } from './returns.controller';
import { RbacModule } from '../../rbac/rbac.module';
import { InventoryModule } from '../../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseReturn, PurchaseReturnLine]),
    RbacModule,
    InventoryModule,
  ],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
