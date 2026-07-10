import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SurveyActionPlan, ActionItem, AttritionWatch } from './entities/action-planning.entity';
import { ActionPlanningService } from './action-planning.service';
import { ActionPlanningController } from './action-planning.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([SurveyActionPlan, ActionItem, AttritionWatch]), RbacModule],
  controllers: [ActionPlanningController],
  providers: [ActionPlanningService],
  exports: [ActionPlanningService],
})
export class ActionPlanningModule {}
