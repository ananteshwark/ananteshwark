import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeritPlan } from './entities/merit-plan.entity';
import { MeritBudgetNode } from './entities/merit-budget.entity';
import { MeritLine } from './entities/merit-line.entity';
import { MeritService } from './merit.service';
import { MeritController } from './merit.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([MeritPlan, MeritBudgetNode, MeritLine]), RbacModule],
  controllers: [MeritController],
  providers: [MeritService],
  exports: [MeritService],
})
export class MeritModule {}
