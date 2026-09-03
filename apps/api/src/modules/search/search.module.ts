import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SearchService } from './search.service';
import { SearchController } from './search.controller';
import { Employee } from '../hr/employees/entities/employee.entity';
import { Vendor } from '../finance/ap/entities/vendor.entity';
import { Bill } from '../finance/ap/entities/bill.entity';
import { Customer } from '../finance/ar/entities/customer.entity';
import { Invoice } from '../finance/ar/entities/invoice.entity';
import { PurchaseOrder } from '../procurement/po/entities/purchase-order.entity';
import { ServiceTicket } from '../crm/entities/service-ticket.entity';
import { Item } from '../inventory/entities/item.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Employee,
      Vendor,
      Bill,
      Customer,
      Invoice,
      PurchaseOrder,
      ServiceTicket,
      Item,
    ]),
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
