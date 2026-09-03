import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LearningProvider, XapiStatement, TrainingSession } from './entities/learning-ecosystem.entity';
import { LearningEcosystemService } from './learning-ecosystem.service';
import { LearningEcosystemController } from './learning-ecosystem.controller';
import { MeetingAdapter } from './meeting.adapter';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([LearningProvider, XapiStatement, TrainingSession]), RbacModule],
  controllers: [LearningEcosystemController],
  providers: [LearningEcosystemService, MeetingAdapter],
  exports: [LearningEcosystemService],
})
export class LearningEcosystemModule {}
