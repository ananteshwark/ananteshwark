import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesOrder } from './entities/sales-order.entity';
import { SalesOrderLine } from './entities/sales-order-line.entity';
import { PriceList, PriceListItem } from './entities/price-list.entity';
import { PricingCondition } from './entities/pricing-condition.entity';
import { Customer } from '../finance/ar/entities/customer.entity';
import { Invoice } from '../finance/ar/entities/invoice.entity';
import { StockBalance } from '../inventory/entities/stock-balance.entity';
import { ReturnOrder } from './entities/return-order.entity';
import { ReturnOrderLine } from './entities/return-order-line.entity';
import { CreditNote } from './entities/credit-note.entity';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { PricingService } from './pricing.service';
import { CreditService } from './credit.service';
import { AtpService } from './atp.service';
import { ReturnsCreditService } from './returns-credit.service';
import { PricingController } from './pricing.controller';
import { ReturnsCreditController } from './returns-credit.controller';
import { ArModule } from '../finance/ar/ar.module';
import { GlModule } from '../finance/gl/gl.module';
import { RbacModule } from '../rbac/rbac.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesOrder, SalesOrderLine, PriceList, PriceListItem,
      PricingCondition, Customer, Invoice, StockBalance,
      ReturnOrder, ReturnOrderLine, CreditNote,
    ]),
    ArModule,
    GlModule,
    RbacModule,
    InventoryModule,
  ],
  controllers: [SalesController, PricingController, ReturnsCreditController],
  providers: [SalesService, PricingService, CreditService, AtpService, ReturnsCreditService],
  exports: [SalesService, PricingService, CreditService, AtpService, ReturnsCreditService],
})
export class SalesModule {}
