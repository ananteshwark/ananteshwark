import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowDefinition } from './entities/workflow-definition.entity';
import { WorkflowInstance } from './entities/workflow-instance.entity';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowDefinition, WorkflowInstance])],
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
