import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GstEInvoice } from './entities/gst-einvoice.entity';
import { Invoice } from '../finance/ar/entities/invoice.entity';
import { InvoiceLine } from '../finance/ar/entities/invoice-line.entity';
import { Customer } from '../finance/ar/entities/customer.entity';
import { Bill } from '../finance/ap/entities/bill.entity';
import { GstService } from './gst.service';
import { GstController } from './gst.controller';
import { PeppolService } from './peppol.service';
import { PeppolController } from './peppol.controller';
import { IRP_TRANSPORT, SandboxIrpTransport } from './irp.transport';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([GstEInvoice, Invoice, InvoiceLine, Customer, Bill]),
    RbacModule,
  ],
  controllers: [GstController, PeppolController],
  providers: [
    GstService,
    PeppolService,
    // Swap this binding for a GSP/direct-API transport in production.
    { provide: IRP_TRANSPORT, useClass: SandboxIrpTransport },
  ],
  exports: [GstService, PeppolService],
})
export class ComplianceModule {}
