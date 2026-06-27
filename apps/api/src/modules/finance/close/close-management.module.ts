import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloseTask } from './entities/close-task.entity';
import { AccountReconciliation } from './entities/account-reconciliation.entity';
import { CloseManagementService } from './close-management.service';
import { CloseManagementController } from './close-management.controller';
import { GlModule } from '../gl/gl.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CloseTask, AccountReconciliation]),
    GlModule,
    RbacModule,
  ],
  controllers: [CloseManagementController],
  providers: [CloseManagementService],
  exports: [CloseManagementService],
})
export class CloseManagementModule {}
