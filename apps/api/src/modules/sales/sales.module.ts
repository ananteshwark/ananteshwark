import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesOrder } from './entities/sales-order.entity';
import { SalesOrderLine } from './entities/sales-order-line.entity';
import { PriceList, PriceListItem } from './entities/price-list.entity';
import { PricingCondition } from './entities/pricing-condition.entity';
import { Customer } from '../finance/ar/entities/customer.entity';
import { Invoice } from '../finance/ar/entities/invoice.entity';
import { StockBalance } from '../inventory/entities/stock-balance.entity';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { PricingService } from './pricing.service';
import { CreditService } from './credit.service';
import { AtpService } from './atp.service';
import { PricingController } from './pricing.controller';
import { ArModule } from '../finance/ar/ar.module';
import { GlModule } from '../finance/gl/gl.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SalesOrder, SalesOrderLine, PriceList, PriceListItem,
      PricingCondition, Customer, Invoice, StockBalance,
    ]),
    ArModule,
    GlModule,
    RbacModule,
  ],
  controllers: [SalesController, PricingController],
  providers: [SalesService, PricingService, CreditService, AtpService],
  exports: [SalesService, PricingService, CreditService, AtpService],
})
export class SalesModule {}
