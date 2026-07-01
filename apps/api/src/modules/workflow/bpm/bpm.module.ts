import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BpmProcess } from './entities/bpm-process.entity';
import { BpmInstance } from './entities/bpm-instance.entity';
import { ApprovalTask } from './entities/approval-task.entity';
import { DelegationRule } from './entities/delegation-rule.entity';
import { BpmService } from './bpm.service';
import { BpmController } from './bpm.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BpmProcess, BpmInstance, ApprovalTask, DelegationRule]),
    RbacModule,
  ],
  controllers: [BpmController],
  providers: [BpmService],
  exports: [BpmService],
})
export class BpmModule {}
