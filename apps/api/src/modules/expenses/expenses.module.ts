import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExpenseCategory } from './entities/expense-category.entity';
import { ExpenseClaim } from './entities/expense-claim.entity';
import { ExpenseLine } from './entities/expense-line.entity';
import { ExpensePolicy } from './entities/expense-policy.entity';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { RbacModule } from '../rbac/rbac.module';
import { GlModule } from '../finance/gl/gl.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ExpenseCategory, ExpenseClaim, ExpenseLine, ExpensePolicy]),
    RbacModule,
    GlModule,
  ],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
