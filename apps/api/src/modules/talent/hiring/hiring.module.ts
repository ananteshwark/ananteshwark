import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManpowerRequisition } from './entities/manpower-requisition.entity';
import { HiringService } from './hiring.service';
import { HiringController } from './hiring.controller';
import { AtsModule } from '../ats/ats.module';
import { JobPosting } from '../ats/entities/job-posting.entity';
import { Applicant } from '../ats/entities/applicant.entity';
import { InterviewSchedule } from '../ats/entities/interview-schedule.entity';
import { JobOffer } from '../ats/entities/job-offer.entity';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ManpowerRequisition, JobPosting, Applicant, InterviewSchedule, JobOffer]),
    AtsModule,
    RbacModule,
  ],
  controllers: [HiringController],
  providers: [HiringService],
  exports: [HiringService],
})
export class HiringModule {}
