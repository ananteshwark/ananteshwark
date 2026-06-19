import { Module } from '@nestjs/common';
import { AtsModule } from './ats/ats.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { LearningModule } from './learning/learning.module';
import { SuccessionModule } from './succession/succession.module';
import { GoalsModule } from './goals/goals.module';
import { PerformanceModule } from './performance/performance.module';
import { AppraisalModule } from './appraisal/appraisal.module';

@Module({
  imports: [AtsModule, OnboardingModule, LearningModule, SuccessionModule, GoalsModule, PerformanceModule, AppraisalModule],
})
export class TalentModule {}
