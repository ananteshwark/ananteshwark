import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationTurn } from './entities/conversation-turn.entity';
import { AssistantService } from './assistant.service';
import { AssistantController } from './assistant.controller';
import { RbacModule } from '../rbac/rbac.module';
import { CopilotService } from './copilot.service';
import { Employee } from '../hr/employees/entities/employee.entity';
import { HelpdeskModule } from '../helpdesk/helpdesk.module';
import { EngagementModule } from '../engagement/engagement.module';
import { AnalyticsModule } from '../analytics/analytics.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationTurn, Employee]),
    HelpdeskModule,
    EngagementModule,
    AnalyticsModule,
    RbacModule,
  ],
  controllers: [AssistantController],
  providers: [AssistantService, CopilotService],
  exports: [AssistantService, CopilotService],
})
export class AssistantModule {}
