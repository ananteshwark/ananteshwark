import { Module } from '@nestjs/common';
import { RequisitionModule } from './requisition/requisition.module';
import { RfqModule } from './rfq/rfq.module';
import { PoModule } from './po/po.module';
import { GrnModule } from './grn/grn.module';

@Module({ imports: [RequisitionModule, RfqModule, PoModule, GrnModule] })
export class ProcurementModule {}
