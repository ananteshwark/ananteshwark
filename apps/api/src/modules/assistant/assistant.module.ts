import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationTurn } from './entities/conversation-turn.entity';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';
import { RbacModule } from '../rbac/rbac.module';
import { CopilotService } from './copilot.service';
import { LlmPlannerService } from './llm-planner.service';
import { Employee } from '../hr/employees/entities/employee.entity';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';
import { EngagementModule } from '../engagement/engagement.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationTurn, Employee]),
    HelpdeskModule,
    EngagementModule,
    AnalyticsModule,
    AiModule,
    RbacModule,
  ],
  controllers: [AssistantController],
  providers: [AssistantService, CopilotService, LlmPlannerService],
  exports: [AssistantService, CopilotService, LlmPlannerService],
})
export class AssistantModule {}
