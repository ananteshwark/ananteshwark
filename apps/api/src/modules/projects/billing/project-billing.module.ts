import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectBudget } from './entities/project-budget.entity';
import { ProjectBudgetLine } from './entities/project-budget-line.entity';
import { BillingRate } from './entities/billing-rate.entity';
import { RevenueRecognitionEntry } from './entities/revenue-recognition.entity';
import { ProjectTimeEntry } from '../entities/project-time-entry.entity';
import { ProjectExpense } from '../entities/project-expense.entity';
import { ProjectBillingService } from './project-billing.service';
import { ProjectBillingController } from './project-billing.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectBudget, ProjectBudgetLine, BillingRate, RevenueRecognitionEntry, ProjectTimeEntry, ProjectExpense]),
    RbacModule,
  ],
  controllers: [ProjectBillingController],
  providers: [ProjectBillingService],
  exports: [ProjectBillingService],
})
export class ProjectBillingModule {}
