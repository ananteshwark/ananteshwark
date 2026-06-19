import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JobPosting } from './entities/job-posting.entity';
import { Applicant } from './entities/applicant.entity';
import { InterviewSchedule } from './entities/interview-schedule.entity';
import { JobOffer } from './entities/job-offer.entity';
import { AtsService } from './ats.service';
import { AtsController } from './ats.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([JobPosting, Applicant, InterviewSchedule, JobOffer]), RbacModule],
  controllers: [AtsController],
  providers: [AtsService],
  exports: [AtsService],
})
export class AtsModule {}
