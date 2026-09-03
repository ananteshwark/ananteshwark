import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseRequisition } from './entities/purchase-requisition.entity';
import { RequisitionLine } from './entities/requisition-line.entity';
import { RequisitionService } from './requisition.service';
import { RequisitionController } from './requisition.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseRequisition, RequisitionLine]),
    RbacModule,
  ],
  controllers: [RequisitionController],
  providers: [RequisitionService],
  exports: [RequisitionService],
})
export class RequisitionModule {}
