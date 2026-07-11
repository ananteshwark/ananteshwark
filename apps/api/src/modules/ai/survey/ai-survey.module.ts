import { Module } from '@nestjs/common';
import { AiSurveyService } from './ai-survey.service';
import { AiSurveyController } from './ai-survey.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [RbacModule],
  controllers: [AiSurveyController],
  providers: [AiSurveyService],
  exports: [AiSurveyService],
})
export class AiSurveyModule {}
