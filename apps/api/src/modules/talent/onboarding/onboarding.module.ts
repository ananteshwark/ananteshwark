import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OnboardingTemplate } from './entities/onboarding-template.entity';
import { OnboardingPlan } from './entities/onboarding-plan.entity';
import { OnboardingTask } from './entities/onboarding-task.entity';
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([OnboardingTemplate, OnboardingPlan, OnboardingTask]), RbacModule],
  controllers: [OnboardingController],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class OnboardingModule {}
