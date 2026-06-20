import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesOrder } from './entities/sales-order.entity';
import { SalesOrderLine } from './entities/sales-order-line.entity';
import { PriceList, PriceListItem } from './entities/price-list.entity';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { ArModule } from '../finance/ar/ar.module';
import { GlModule } from '../finance/gl/gl.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SalesOrder, SalesOrderLine, PriceList, PriceListItem]),
    ArModule,
    GlModule,
    RbacModule,
  ],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
