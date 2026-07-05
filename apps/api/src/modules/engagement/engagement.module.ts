import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Survey } from './entities/survey.entity';
import { SurveyResponse } from './entities/survey-response.entity';
import { RecognitionBadge, Recognition } from './entities/recognition.entity';
import { FeedPost, FeedComment } from './entities/feed.entity';
import { SurveysService } from './surveys.service';
import { RecognitionService } from './recognition.service';
import { FeedService } from './feed.service';
import { EngagementController } from './engagement.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Survey, SurveyResponse, RecognitionBadge, Recognition, FeedPost, FeedComment]),
    RbacModule,
  ],
  controllers: [EngagementController],
  providers: [SurveysService, RecognitionService, FeedService],
  exports: [SurveysService, RecognitionService, FeedService],
})
export class EngagementModule {}
