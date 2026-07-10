import { Module } from '@nestjs/common';
import { AtsModule } from './ats/ats.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { LearningModule } from './learning/learning.module';
import { SuccessionModule } from './succession/succession.module';
import { GoalsModule } from './goals/goals.module';
import { PerformanceModule } from './performance/performance.module';
import { AppraisalModule } from './appraisal/appraisal.module';
import { HiringModule } from './hiring/hiring.module';
import { IdpModule } from './idp/idp.module';
import { FeedbackModule } from './feedback/feedback.module';
import { ProfileModule } from './profile/profile.module';
import { CareerModule } from './career/career.module';

@Module({
  imports: [AtsModule, OnboardingModule, LearningModule, SuccessionModule, GoalsModule, PerformanceModule, AppraisalModule, HiringModule, IdpModule, FeedbackModule, ProfileModule, CareerModule],
})
export class TalentModule {}
