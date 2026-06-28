import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayrollCostingRule } from './entities/payroll-costing-rule.entity';
import { PayrollCostDistribution } from './entities/payroll-cost-distribution.entity';
import { PayrollCostingService } from './payroll-costing.service';
import { PayrollCostingController } from './payroll-costing.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PayrollCostingRule, PayrollCostDistribution]),
    RbacModule,
  ],
  controllers: [PayrollCostingController],
  providers: [PayrollCostingService],
  exports: [PayrollCostingService],
})
export class PayrollCostingModule {}
