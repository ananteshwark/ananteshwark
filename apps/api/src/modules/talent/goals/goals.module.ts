import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OkrCycle } from './entities/okr-cycle.entity';
import { Objective } from './entities/objective.entity';
import { KeyResult } from './entities/key-result.entity';
import { GoalJournalEntry } from './entities/goal-journal.entity';
import { GoalsService } from './goals.service';
import { GoalsController } from './goals.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([OkrCycle, Objective, KeyResult, GoalJournalEntry]), RbacModule],
  controllers: [GoalsController],
  providers: [GoalsService],
  exports: [GoalsService],
})
export class GoalsModule {}
