import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SourcingRule } from './entities/sourcing-rule.entity';
import { StockBalance } from '../../inventory/entities/stock-balance.entity';
import { PurchaseOrder } from '../../procurement/po/entities/purchase-order.entity';
import { PoLine } from '../../procurement/po/entities/po-line.entity';
import { PromisingService } from './promising.service';
import { PromisingController } from './promising.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SourcingRule, StockBalance, PurchaseOrder, PoLine]),
    RbacModule,
  ],
  controllers: [PromisingController],
  providers: [PromisingService],
  exports: [PromisingService],
})
export class PromisingModule {}
