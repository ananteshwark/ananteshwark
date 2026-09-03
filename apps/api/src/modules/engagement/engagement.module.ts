import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Survey } from './entities/survey.entity';
import { SurveyResponse } from './entities/survey-response.entity';
import { RecognitionBadge, Recognition } from './entities/recognition.entity';
import { FeedPost, FeedComment } from './entities/feed.entity';
import { FeedGroup } from './entities/feed-group.entity';
import { RecognitionProgram, RecognitionNomination } from './entities/recognition-nomination.entity';
import { SurveysService } from './surveys.service';
import { RecognitionService } from './recognition.service';
import { FeedService } from './feed.service';
import { FeedGroupService } from './feed-group.service';
import { NominationService } from './nomination.service';
import { EngagementController } from './engagement.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Survey, SurveyResponse, RecognitionBadge, Recognition, FeedPost, FeedComment,
      FeedGroup, RecognitionProgram, RecognitionNomination,
    ]),
    RbacModule,
  ],
  controllers: [EngagementController],
  providers: [SurveysService, RecognitionService, FeedService, FeedGroupService, NominationService],
  exports: [SurveysService, RecognitionService, FeedService, FeedGroupService, NominationService],
})
export class EngagementModule {}
