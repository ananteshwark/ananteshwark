import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PositionBudget } from './entities/position-budget.entity';
import { WorkforceScenario } from './entities/workforce-scenario.entity';
import { Position } from '../employees/entities/position.entity';
import { HeadcountService } from './headcount.service';
import { HeadcountController } from './headcount.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PositionBudget, WorkforceScenario, Position]),
    RbacModule,
  ],
  controllers: [HeadcountController],
  providers: [HeadcountService],
  exports: [HeadcountService],
})
export class HeadcountModule {}
