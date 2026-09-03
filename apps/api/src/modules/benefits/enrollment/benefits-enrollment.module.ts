import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnrollmentWindow } from './entities/enrollment-window.entity';
import { LifeEvent } from './entities/life-event.entity';
import { BenefitPlan } from '../entities/benefit-plan.entity';
import { BenefitsEnrollmentService } from './benefits-enrollment.service';
import { BenefitsEnrollmentController } from './benefits-enrollment.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EnrollmentWindow, LifeEvent, BenefitPlan]),
    RbacModule,
  ],
  controllers: [BenefitsEnrollmentController],
  providers: [BenefitsEnrollmentService],
  exports: [BenefitsEnrollmentService],
})
export class BenefitsEnrollmentModule {}
