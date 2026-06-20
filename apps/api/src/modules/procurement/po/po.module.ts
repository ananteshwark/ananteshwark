import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PurchaseOrder } from './entities/purchase-order.entity';
import { PoLine } from './entities/po-line.entity';
import { ApprovalMatrix } from '../entities/approval-matrix.entity';
import { PoService } from './po.service';
import { PoController } from './po.controller';
import { RbacModule } from '../../rbac/rbac.module';
import { DoaModule } from '../doa/doa.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseOrder, PoLine, ApprovalMatrix]),
    RbacModule,
    DoaModule,
  ],
  controllers: [PoController],
  providers: [PoService],
  exports: [PoService],
})
export class PoModule {}
