import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BudgetLine } from './entities/budget-line.entity';
import { Account } from '../gl/entities/account.entity';
import { CostCenter } from '../gl/entities/cost-center.entity';
import { JournalLine } from '../gl/entities/journal-line.entity';
import { PurchaseOrder } from '../../procurement/po/entities/purchase-order.entity';
import { PoLine } from '../../procurement/po/entities/po-line.entity';
import { BudgetService } from './budget.service';
import { BudgetController } from './budget.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BudgetLine,
      Account,
      CostCenter,
      JournalLine,
      PurchaseOrder,
      PoLine,
    ]),
    RbacModule,
  ],
  controllers: [BudgetController],
  providers: [BudgetService],
  exports: [BudgetService],
})
export class BudgetModule {}
