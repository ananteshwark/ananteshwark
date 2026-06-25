import { Module } from '@nestjs/common';
import { RequisitionModule } from './requisition/requisition.module';
import { RfqModule } from './rfq/rfq.module';
import { PoModule } from './po/po.module';
import { GrnModule } from './grn/grn.module';
import { WorkflowConfigModule } from './workflow/workflow-config.module';
import { DoaModule } from './doa/doa.module';
import { VendorInvoiceModule } from './vendor-invoice/vendor-invoice.module';
import { VendorPortalModule } from './vendor-portal/vendor-portal.module';
import { InfoRecordModule } from './info-record/info-record.module';
import { ServiceEntryModule } from './service-entry/service-entry.module';
import { ReturnsModule } from './returns/returns.module';
import { OutlineAgreementModule } from './outline-agreement/outline-agreement.module';
import { SourceDeterminationModule } from './source-determination/source-determination.module';

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
    InfoRecordModule,
    ServiceEntryModule,
    ReturnsModule,
    OutlineAgreementModule,
    SourceDeterminationModule,
  ],
})
export class ProcurementModule {}
