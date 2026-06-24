import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConsolidationGroup } from './entities/consolidation-group.entity';
import { ConsolidationRun } from './entities/consolidation-run.entity';
import { JournalEntry } from '../gl/entities/journal-entry.entity';
import { JournalLine } from '../gl/entities/journal-line.entity';
import { Account } from '../gl/entities/account.entity';
import { ConsolidationService } from './consolidation.service';
import { ConsolidationController } from './consolidation.controller';
import { IntercompanyModule } from '../intercompany/intercompany.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConsolidationGroup,
      ConsolidationRun,
      JournalEntry,
      JournalLine,
      Account,
    ]),
    IntercompanyModule,
    RbacModule,
  ],
  controllers: [ConsolidationController],
  providers: [ConsolidationService],
  exports: [ConsolidationService],
})
export class ConsolidationModule {}
