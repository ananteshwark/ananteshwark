import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './entities/account.entity';
import { CostCenter } from './entities/cost-center.entity';
import { FiscalYear } from './entities/fiscal-year.entity';
import { AccountingPeriod } from './entities/accounting-period.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalLine } from './entities/journal-line.entity';
import { DocumentSplittingRule } from './entities/document-splitting-rule.entity';
import { RecurringJournal } from './entities/recurring-journal.entity';
import { AccrualConfig } from './entities/accrual-config.entity';
import { SlaRule } from './entities/sla-rule.entity';
import { XlaAccountingEvent } from './entities/xla-accounting-event.entity';
import { CoaSegment, CoaSegmentValue } from './entities/coa-segment.entity';
import { AccountTree, AccountTreeNode } from './entities/account-tree.entity';
import { CrossValidationRule } from './entities/cross-validation-rule.entity';
import { GlService } from './gl.service';
import { SlaService } from './sla.service';
import { CoaStructureService } from './coa-structure.service';
import { GlController } from './gl.controller';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Account,
      CostCenter,
      FiscalYear,
      AccountingPeriod,
      JournalEntry,
      JournalLine,
      DocumentSplittingRule,
      RecurringJournal,
      AccrualConfig,
      SlaRule,
      XlaAccountingEvent,
      CoaSegment,
      CoaSegmentValue,
      AccountTree,
      AccountTreeNode,
      CrossValidationRule,
    ]),
    RbacModule,
  ],
  controllers: [GlController],
  providers: [GlService, SlaService, CoaStructureService],
  exports: [GlService, SlaService, CoaStructureService, TypeOrmModule],
})
export class GlModule {}
