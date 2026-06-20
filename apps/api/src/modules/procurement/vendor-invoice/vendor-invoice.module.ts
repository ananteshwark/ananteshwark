import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VendorInvoice } from './entities/vendor-invoice.entity';
import { VendorInvoiceLine } from './entities/vendor-invoice-line.entity';
import { PurchaseOrder } from '../po/entities/purchase-order.entity';
import { PoLine } from '../po/entities/po-line.entity';
import { Grn } from '../grn/entities/grn.entity';
import { GrnLine } from '../grn/entities/grn-line.entity';
import { VendorInvoiceService } from './vendor-invoice.service';
import { VendorInvoiceController } from './vendor-invoice.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([VendorInvoice, VendorInvoiceLine, PurchaseOrder, PoLine, Grn, GrnLine]),
    RbacModule,
  ],
  controllers: [VendorInvoiceController],
  providers: [VendorInvoiceService],
  exports: [VendorInvoiceService],
})
export class VendorInvoiceModule {}
