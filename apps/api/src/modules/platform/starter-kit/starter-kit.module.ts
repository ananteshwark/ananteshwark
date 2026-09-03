import { Module } from '@nestjs/common';
import { LeaveModule } from '../../hr/leave/leave.module';
import { EngagementModule } from '../../engagement/engagement.module';
import { LettersModule } from '../../letters/letters.module';
import { KnowledgeModule } from '../../knowledge/knowledge.module';
import { JourneysModule } from '../../hr/journeys/journeys.module';
import { RbacModule } from '../../rbac/rbac.module';
import { StarterKitService } from './starter-kit.service';
import { StarterKitController } from './starter-kit.controller';

@Module({
  imports: [LeaveModule, EngagementModule, LettersModule, KnowledgeModule, JourneysModule, RbacModule],
  controllers: [StarterKitController],
  providers: [StarterKitService],
  exports: [StarterKitService],
})
export class StarterKitModule {}
