import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorkflowConfig } from './entities/workflow-config.entity';
import { WorkflowConfigService } from './workflow-config.service';
import { WorkflowConfigController } from './workflow-config.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [TypeOrmModule.forFeature([WorkflowConfig]), RbacModule],
  controllers: [WorkflowConfigController],
  providers: [WorkflowConfigService],
  exports: [WorkflowConfigService],
})
export class WorkflowConfigModule {}
