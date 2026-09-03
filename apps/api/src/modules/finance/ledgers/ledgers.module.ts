import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ledger } from './entities/ledger.entity';
import { LedgerGroup } from './entities/ledger-group.entity';
import { LedgerPostingRule } from './entities/ledger-posting-rule.entity';
import { LedgersService } from './ledgers.service';
import { LedgersController } from './ledgers.controller';
import { GlModule } from '../gl/gl.module';
import { ReportsModule } from '../reports/reports.module';
import { RbacModule } from '../../rbac/rbac.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ledger, LedgerGroup, LedgerPostingRule]),
    GlModule, // re-exports TypeOrmModule → JournalEntry + AccountingPeriod repos
    ReportsModule,
    RbacModule,
  ],
  controllers: [LedgersController],
  providers: [LedgersService],
  exports: [LedgersService],
})
export class LedgersModule {}
