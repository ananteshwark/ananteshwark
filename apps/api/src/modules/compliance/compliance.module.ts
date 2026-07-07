import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GstEInvoice } from './entities/gst-einvoice.entity';
import { Invoice } from '../finance/ar/entities/invoice.entity';
import { InvoiceLine } from '../finance/ar/entities/invoice-line.entity';
import { Customer } from '../finance/ar/entities/customer.entity';
import { Bill } from '../finance/ap/entities/bill.entity';
import { GstService } from './gst.service';
import { GstController } from './gst.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GstEInvoice, Invoice, InvoiceLine, Customer, Bill]),
    RbacModule,
  ],
  controllers: [GstController],
  providers: [GstService],
  exports: [GstService],
})
export class ComplianceModule {}
