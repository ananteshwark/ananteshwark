import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PoLine } from './entities/po-line.entity';
import { ApprovalMatrix } from '../entities/approval-matrix.entity';
import { PoService } from './po.service';
import { PoController } from './po.controller';
import { RbacModule } from '../../rbac/rbac.module';
import { DoaModule } from '../doa/doa.module';
import { InfoRecordModule } from '../info-record/info-record.module';
import { BudgetModule } from '../../finance/budget/budget.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseOrder, PoLine, ApprovalMatrix]),
    RbacModule,
    DoaModule,
    InfoRecordModule,
    BudgetModule,
  ],
  controllers: [PoController],
  providers: [PoService],
  exports: [PoService],
})
export class PoModule {}
