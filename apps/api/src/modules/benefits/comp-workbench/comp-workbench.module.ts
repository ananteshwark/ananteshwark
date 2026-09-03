import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompBudget } from './entities/comp-budget.entity';
import { CompAward } from './entities/comp-award.entity';
import { CompWorkbenchService } from './comp-workbench.service';
import { CompWorkbenchController } from './comp-workbench.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CompBudget, CompAward]),
    RbacModule,
  ],
  controllers: [CompWorkbenchController],
  providers: [CompWorkbenchService],
  exports: [CompWorkbenchService],
})
export class CompWorkbenchModule {}
