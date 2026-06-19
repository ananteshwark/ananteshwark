import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PoLine } from './entities/po-line.entity';
import { PoService } from './po.service';
import { PoController } from './po.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseOrder, PoLine]),
    RbacModule,
  ],
  controllers: [PoController],
  providers: [PoService],
  exports: [PoService],
})
export class PoModule {}
