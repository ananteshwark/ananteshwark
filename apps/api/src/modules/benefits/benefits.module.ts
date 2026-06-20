import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BenefitPlan } from './entities/benefit-plan.entity';
import { BenefitEnrollment } from './entities/benefit-enrollment.entity';
import { SalaryBand } from './entities/salary-band.entity';
import { MeritCycle } from './entities/merit-cycle.entity';
import { MeritAllocation } from './entities/merit-allocation.entity';
import { BenefitsService } from './benefits.service';
import { BenefitsController } from './benefits.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BenefitPlan, BenefitEnrollment, SalaryBand, MeritCycle, MeritAllocation]),
    RbacModule,
  ],
  controllers: [BenefitsController],
  providers: [BenefitsService],
  exports: [BenefitsService],
})
export class BenefitsModule {}
