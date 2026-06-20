import { Module } from '@nestjs/common';
import { RequisitionModule } from './requisition/requisition.module';
import { RfqModule } from './rfq/rfq.module';
import { PoModule } from './po/po.module';
import { GrnModule } from './grn/grn.module';
import { WorkflowConfigModule } from './workflow/workflow-config.module';
import { DoaModule } from './doa/doa.module';
import { VendorInvoiceModule } from './vendor-invoice/vendor-invoice.module';
import { VendorPortalModule } from './vendor-portal/vendor-portal.module';

@Module({
  imports: [
    RequisitionModule,
    RfqModule,
    PoModule,
    GrnModule,
    WorkflowConfigModule,
    DoaModule,
    VendorInvoiceModule,
    VendorPortalModule,
  ],
})
export class ProcurementModule {}
