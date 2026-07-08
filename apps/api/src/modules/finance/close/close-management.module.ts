import { Module } from '@nestjs/common';
import { JournalEntry } from '../gl/entities/journal-entry.entity';
import { JournalLine } from '../gl/entities/journal-line.entity';
import { JournalAnomalyService } from './journal-anomaly.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloseTask } from './entities/close-task.entity';
import { AccountReconciliation } from './entities/account-reconciliation.entity';
import { CloseManagementService } from './close-management.service';
import { CloseManagementController } from './close-management.controller';
import { GlModule } from '../gl/gl.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CloseTask, AccountReconciliation, JournalEntry, JournalLine]),
    GlModule,
    RbacModule,
  ],
  controllers: [CloseManagementController],
  providers: [CloseManagementService, JournalAnomalyService],
  exports: [CloseManagementService, JournalAnomalyService],
})
export class CloseManagementModule {}
