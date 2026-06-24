import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './entities/account.entity';
import { CostCenter } from './entities/cost-center.entity';
import { FiscalYear } from './entities/fiscal-year.entity';
import { AccountingPeriod } from './entities/accounting-period.entity';
import { JournalEntry } from './entities/journal-entry.entity';
import { JournalLine } from './entities/journal-line.entity';
import { DocumentSplittingRule } from './entities/document-splitting-rule.entity';
import { GlService } from './gl.service';
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
    ]),
    RbacModule,
  ],
  controllers: [GlController],
  providers: [GlService],
  exports: [GlService, TypeOrmModule],
})
export class GlModule {}
