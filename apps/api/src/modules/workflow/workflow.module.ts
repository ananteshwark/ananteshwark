import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowDefinition } from './entities/workflow-definition.entity';
import { WorkflowInstance } from './entities/workflow-instance.entity';
import { Employee } from '../hr/employees/entities/employee.entity';
import { WorkflowService } from './workflow.service';
import { ApprovalMatrixRule } from './approval-matrix/approval-matrix.entity';
import { ApprovalMatrixService } from './approval-matrix/approval-matrix.service';
import { ApprovalMatrixController } from './approval-matrix/approval-matrix.controller';
import { WorkflowController } from './workflow.controller';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowDefinition, WorkflowInstance, Employee, ApprovalMatrixRule]), RbacModule],
  controllers: [WorkflowController, ApprovalMatrixController],
  providers: [WorkflowService, ApprovalMatrixService],
  exports: [WorkflowService, ApprovalMatrixService],
})
export class WorkflowModule {}
